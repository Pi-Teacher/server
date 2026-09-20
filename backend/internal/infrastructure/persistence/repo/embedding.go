package repo

import (
	"context"
	"time"

	"gorm.io/gorm"

	"github.com/Pi-Teacher/server/internal/infrastructure/persistence"
	"github.com/Pi-Teacher/server/internal/infrastructure/persistence/model"
)

// EmbeddingTask 是 worker 领取到的一张待嵌入 Card.
// Version 是领取时的 card.version, 回写时用于条件匹配, 防止旧任务
// 覆盖领取后又被修改的 front; 该值只存在于内存任务对象, 不落库.
type EmbeddingTask struct {
	ID      int64
	Version int64
	Front   string
}

// EmbeddingCoverage 是启用 embedding 卡的状态分布.
// TotalEnabled 是 enable_embedding=true 的全部卡, 其余四类互斥且求和等于它.
type EmbeddingCoverage struct {
	TotalEnabled int64
	Ready        int64
	Pending      int64
	Processing   int64
	Failed       int64
}

// ReadyPercent 返回覆盖率百分比. 空集合按 100% 处理, 避免除零.
func (c EmbeddingCoverage) ReadyPercent() float64 {
	if c.TotalEnabled == 0 {
		return 100
	}
	return float64(c.Ready) / float64(c.TotalEnabled) * 100
}

// Idle 表示没有待处理任务, 重建与 retry 的完成判定以此为前提.
func (c EmbeddingCoverage) Idle() bool { return c.Pending == 0 && c.Processing == 0 }

// ClaimPendingEmbedding 在一个短事务中领取最多 limit 张 pending 卡:
// 读出后逐张条件改为 processing 并收集 (id, version, front).
//
// 只改 embedding_status: 任务状态不是卡片内容, 递增 version 会误伤
// 客户端的乐观锁, 也不应改动 updated_at (业务修改时间) 以免扰乱
// 按 updated_at 的排序. 领取版本作为快照记入内存任务.
// 条件更新未命中的卡 (并发已被改动) 不计入本次任务.
func (r *CardRepository) ClaimPendingEmbedding(ctx context.Context, limit int, _ time.Time) ([]EmbeddingTask, error) {
	if limit <= 0 {
		return nil, nil
	}
	tasks := make([]EmbeddingTask, 0, limit)
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		rows := make([]model.Card, 0, limit)
		if err := tx.
			Where("enable_embedding = ? AND embedding_status = ?", true, model.EmbeddingPending).
			Order("id ASC").Limit(limit).
			Find(&rows).Error; err != nil {
			return err
		}
		for i := range rows {
			res := tx.Model(&model.Card{}).
				Where("id = ? AND enable_embedding = ? AND embedding_status = ?",
					rows[i].ID, true, model.EmbeddingPending).
				Update("embedding_status", model.EmbeddingProcessing)
			if res.Error != nil {
				return res.Error
			}
			if res.RowsAffected == 1 {
				tasks = append(tasks, EmbeddingTask{
					ID: rows[i].ID, Version: rows[i].Version, Front: rows[i].Front,
				})
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return tasks, nil
}

// ResetProcessingEmbedding 把所有 processing 卡改回 pending, 返回行数.
// 进程启动 (崩溃恢复) 与重建开始时调用: 没有活跃 worker 认领的
// processing 行必须重新进入队列, 否则会永久卡住. 不改 updated_at.
func (r *CardRepository) ResetProcessingEmbedding(ctx context.Context, _ time.Time) (int64, error) {
	res := r.db.WithContext(ctx).Model(&model.Card{}).
		Where("enable_embedding = ? AND embedding_status = ?", true, model.EmbeddingProcessing).
		Update("embedding_status", model.EmbeddingPending)
	return res.RowsAffected, res.Error
}

// UpdateEmbeddingSuccess 条件写入 ready 向量, 返回是否命中.
// 条件同时匹配领取时的 version, enable_embedding 与 processing 状态:
// 领取后 front 被改或开关被关都会递增 version 并改变状态, 旧结果自然写不进.
// 只改 embedding 相关列, 不动 version 与 updated_at.
func (r *CardRepository) UpdateEmbeddingSuccess(
	ctx context.Context,
	id, taskVersion int64,
	vector []byte,
	_ time.Time,
) (bool, error) {
	return persistence.UpdateConditional(r.db.WithContext(ctx), &model.Card{},
		"id = ? AND version = ? AND enable_embedding = ? AND embedding_status = ?",
		[]any{id, taskVersion, true, model.EmbeddingProcessing},
		map[string]any{
			"embedding":        vector,
			"embedding_status": model.EmbeddingReady,
			"embedding_error":  nil,
		})
}

// UpdateEmbeddingFailure 条件写入 failed 与完整错误文本, 返回是否命中.
// 错误不做脱敏也不截断, 原样保存 Go/HTTP/上游错误内容.
func (r *CardRepository) UpdateEmbeddingFailure(
	ctx context.Context,
	id, taskVersion int64,
	errText string,
	_ time.Time,
) (bool, error) {
	return persistence.UpdateConditional(r.db.WithContext(ctx), &model.Card{},
		"id = ? AND version = ? AND enable_embedding = ? AND embedding_status = ?",
		[]any{id, taskVersion, true, model.EmbeddingProcessing},
		map[string]any{
			"embedding":        nil,
			"embedding_status": model.EmbeddingFailed,
			"embedding_error":  errText,
		})
}

// EmbeddingCoverage 统计启用 embedding 卡的状态分布.
// embedding_status 为 NULL 的启用卡按 pending 归类 (数据异常兜底,
// 使其重新进入队列而不是从统计中消失).
func (r *CardRepository) EmbeddingCoverage(ctx context.Context) (EmbeddingCoverage, error) {
	var rows []struct {
		Status *int16
		N      int64
	}
	err := r.db.WithContext(ctx).Model(&model.Card{}).
		Select("embedding_status AS status, COUNT(*) AS n").
		Where("enable_embedding = ?", true).
		Group("embedding_status").
		Find(&rows).Error
	if err != nil {
		return EmbeddingCoverage{}, err
	}
	var c EmbeddingCoverage
	for _, row := range rows {
		c.TotalEnabled += row.N
		if row.Status == nil {
			c.Pending += row.N
			continue
		}
		switch *row.Status {
		case model.EmbeddingProcessing:
			c.Processing += row.N
		case model.EmbeddingReady:
			c.Ready += row.N
		case model.EmbeddingFailed:
			c.Failed += row.N
		default:
			c.Pending += row.N
		}
	}
	return c, nil
}

// ClearAllEmbedding 把全部启用卡清空向量与错误并置 pending, 返回行数.
// 手动完整重建开始时在一个短事务内调用. 不动 version 与 updated_at.
func (r *CardRepository) ClearAllEmbedding(ctx context.Context, _ time.Time) (int64, error) {
	res := r.db.WithContext(ctx).Model(&model.Card{}).
		Where("enable_embedding = ?", true).
		Updates(map[string]any{
			"embedding":        nil,
			"embedding_status": model.EmbeddingPending,
			"embedding_error":  nil,
		})
	return res.RowsAffected, res.Error
}

// CountFailedEmbedding 统计 failed 卡数量.
// retry-failed 用它判断是否需要进入 rebuilding.
func (r *CardRepository) CountFailedEmbedding(ctx context.Context) (int64, error) {
	var n int64
	err := r.db.WithContext(ctx).Model(&model.Card{}).
		Where("enable_embedding = ? AND embedding_status = ?", true, model.EmbeddingFailed).
		Count(&n).Error
	return n, err
}

// ResetFailedEmbedding 把全部 failed 卡改回 pending 并清空错误, 返回行数.
// 不清空 ready 卡的向量; 供 retry-failed 使用. 不动 version 与 updated_at.
func (r *CardRepository) ResetFailedEmbedding(ctx context.Context, _ time.Time) (int64, error) {
	res := r.db.WithContext(ctx).Model(&model.Card{}).
		Where("enable_embedding = ? AND embedding_status = ?", true, model.EmbeddingFailed).
		Updates(map[string]any{
			"embedding_status": model.EmbeddingPending,
			"embedding_error":  nil,
		})
	return res.RowsAffected, res.Error
}

// ExactCandidate 是非向量查重的候选: 同 front 指纹的未启用 embedding 卡.
// 只取响应需要的列, 不读 embedding BLOB.
type ExactCandidate struct {
	ID      int64
	Front   string
	Back    string
	TopicID *int64
}

// FindExactCandidates 用 (front_fingerprint, enable_embedding) 索引召回
// enable_embedding=false 的同指纹卡. 指纹是初筛, 调用方必须再用完整
// canonical front 复核, 排除 64-bit 理论碰撞.
func (r *CardRepository) FindExactCandidates(ctx context.Context, fingerprint []byte) ([]ExactCandidate, error) {
	rows := make([]ExactCandidate, 0, 8)
	err := r.db.WithContext(ctx).Model(&model.Card{}).
		Select("id, front, back, topic_id").
		Where("front_fingerprint = ? AND enable_embedding = ?", fingerprint, false).
		Order("id ASC").
		Find(&rows).Error
	if err != nil {
		return nil, err
	}
	return rows, nil
}

// SemanticCandidate 是语义查重的候选: ready 卡的向量与展示字段.
type SemanticCandidate struct {
	ID        int64
	Front     string
	Back      string
	TopicID   *int64
	Embedding []byte
}

// ListSemanticCandidates 返回全部 enable_embedding=true AND ready 的卡,
// 含向量 BLOB. 语义查重与全量基准才会读取 BLOB, 正常列表查询不读.
func (r *CardRepository) ListSemanticCandidates(ctx context.Context) ([]SemanticCandidate, error) {
	rows := make([]SemanticCandidate, 0, 64)
	err := r.db.WithContext(ctx).Model(&model.Card{}).
		Select("id, front, back, topic_id, embedding").
		Where("enable_embedding = ? AND embedding_status = ?", true, model.EmbeddingReady).
		Find(&rows).Error
	if err != nil {
		return nil, err
	}
	return rows, nil
}
