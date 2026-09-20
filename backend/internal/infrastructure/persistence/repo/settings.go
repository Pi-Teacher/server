// Package repo 实现 GORM 仓库, 属于基础设施层, 不感知 HTTP.
package repo

import (
	"context"
	"errors"
	"fmt"
	"os"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/Pi-Teacher/server/internal/infrastructure/persistence"
	"github.com/Pi-Teacher/server/internal/infrastructure/persistence/model"
	"github.com/Pi-Teacher/server/internal/platform/settings"
)

// SettingsRepository 基于 GORM 实现 settings.Provider.
type SettingsRepository struct {
	db *gorm.DB
}

// NewSettingsRepository 构造设置仓库.
func NewSettingsRepository(db *gorm.DB) *SettingsRepository {
	return &SettingsRepository{db: db}
}

// WithTx 返回绑定到给定事务句柄的仓库副本, 供服务层把设置写入与
// 领域写入收进同一事务 (embedding 重建的原子性依赖它).
func (r *SettingsRepository) WithTx(tx *gorm.DB) *SettingsRepository {
	return &SettingsRepository{db: tx}
}

var _ settings.Provider = (*SettingsRepository)(nil)

// LoadAll 读取全部设置行, 返回原始字符串值.
func (r *SettingsRepository) LoadAll(ctx context.Context) (map[string]string, error) {
	var rows []model.SettingKey
	if err := r.db.WithContext(ctx).Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make(map[string]string, len(rows))
	for _, row := range rows {
		out[row.SettingKey] = row.SettingValue
	}
	return out, nil
}

// Apply 在单个事务内逐项 upsert, 全部成功才提交, 返回更新后的完整值集.
// 冲突分支递增 version 并刷新 updated_at, 保持设置的乐观锁语义连续.
func (r *SettingsRepository) Apply(ctx context.Context, updates []settings.Update) (map[string]string, error) {
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return r.WithTx(tx).ApplyTx(ctx, updates)
	})
	if err != nil {
		return nil, err
	}
	return r.LoadAll(ctx)
}

// ApplyTx 在调用方提供的事务句柄中逐项 upsert, 不自开事务.
// 供需要把设置变更与领域写入原子提交的场景使用 (如 embedding 重建).
func (r *SettingsRepository) ApplyTx(ctx context.Context, updates []settings.Update) error {
	registry := settings.Default()
	now := persistence.Now()
	for _, u := range updates {
		encoded, valueType, err := registry.MarshalValue(u.Key, u.Value)
		if err != nil {
			return err
		}
		row := model.SettingKey{
			SettingKey:   u.Key,
			SettingValue: encoded,
			ValueType:    int16(valueType),
			Version:      1,
			CreatedAt:    now,
			UpdatedAt:    now,
		}
		if err := r.db.WithContext(ctx).Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "setting_key"}},
			DoUpdates: clause.Assignments(map[string]any{
				"setting_value": encoded,
				"value_type":    int16(valueType),
				"version":       gorm.Expr("version + 1"),
				"updated_at":    now,
			}),
		}).Create(&row).Error; err != nil {
			return err
		}
	}
	return nil
}

// GetOne 读取单个设置的字符串值, 不存在时返回 ("", false, nil).
// 供事务内读取权威状态使用 (如 embedding_rebuilding).
func (r *SettingsRepository) GetOne(ctx context.Context, key string) (string, bool, error) {
	var row model.SettingKey
	err := r.db.WithContext(ctx).Where("setting_key = ?", key).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return row.SettingValue, true, nil
}

// EnsureDefaults 为注册表中尚无数据库行的设置补写默认值, 已存在的值不动.
// 只在启动初始化时调用, 防止每次重启把用户在 WebUI 里的修改冲掉.
func (r *SettingsRepository) EnsureDefaults(ctx context.Context) error {
	now := persistence.Now()
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, s := range settings.Default().All() {
			row := model.SettingKey{
				SettingKey:   s.Key,
				SettingValue: s.Default,
				ValueType:    int16(s.Type),
				Version:      1,
				CreatedAt:    now,
				UpdatedAt:    now,
			}
			if err := tx.Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "setting_key"}},
				DoNothing: true,
			}).Create(&row).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// AppLogWriter 把 app_log 批量写入数据库, 是日志 sink 的落库端.
//
// 裁剪不用独立定时器: 它内存累计已落库行数, 每满 pruneInterval 行触发一次
// PruneAppLogs, 把定时查库的读压力降到极低. 仅有 sink 单 goroutine 调用,
// 无需加锁.
type AppLogWriter struct {
	db *gorm.DB
	// pruneParams 返回当前的保留天数与最大行数, 为 nil 时跳过裁剪.
	pruneParams func() (retentionDays, maxRows int64)
	// inserted 是自上次裁剪以来累计落库的行数.
	inserted int64
}

// pruneInterval 是触发一次裁剪所需的累计落库行数.
const pruneInterval = 30

// NewAppLogWriter 构造日志写入器.
func NewAppLogWriter(db *gorm.DB) *AppLogWriter { return &AppLogWriter{db: db} }

// SetPruneParams 注入裁剪参数提供者 (每次从设置快照读). 为空时不裁剪.
// 在 serve 装配阶段调用一次, 之后不再变更.
func (w *AppLogWriter) SetPruneParams(fn func() (retentionDays, maxRows int64)) {
	w.pruneParams = fn
}

// InsertAppLogs 批量插入日志行, 补齐缺失时间戳防止零值入库.
// 插入成功后累计行数, 每满 pruneInterval 行执行一次裁剪.
func (w *AppLogWriter) InsertAppLogs(ctx context.Context, rows []model.AppLog) error {
	if len(rows) == 0 {
		return nil
	}
	for i := range rows {
		if rows[i].LoggedAt.IsZero() {
			rows[i].LoggedAt = time.Now().UTC()
		}
	}
	if err := w.db.WithContext(ctx).Create(&rows).Error; err != nil {
		return err
	}
	w.inserted += int64(len(rows))
	if w.inserted >= pruneInterval && w.pruneParams != nil {
		w.inserted = 0
		retentionDays, maxRows := w.pruneParams()
		// 裁剪失败只写 stderr: 本批日志已成功落库, 不能因裁剪失败让上层
		// 误判落库失败, 也不能递归生成新数据库日志.
		if err := w.PruneAppLogs(ctx, retentionDays, maxRows); err != nil {
			fmt.Fprintf(os.Stderr, "pi-teacher: app_log prune failed: %v\n", err)
		}
	}
	return nil
}

// PruneAppLogs 先删除超过保留天数的行, 再从旧到新裁剪超出 maxRows 的部分,
// 两个上限不分等级一起生效.
//
// 裁剪用 "按 id 倒序偏移定位边界行, 再删除不大于该 id 的行" 实现:
// DELETE ... LIMIT 在 PostgreSQL 上不可用, 子查询方案三个数据库都支持.
func (w *AppLogWriter) PruneAppLogs(ctx context.Context, retentionDays, maxRows int64) error {
	cutoff := persistence.Now().Add(-time.Duration(retentionDays) * 24 * time.Hour)
	if err := w.db.WithContext(ctx).
		Where("logged_at < ?", cutoff).
		Delete(&model.AppLog{}).Error; err != nil {
		return err
	}
	if maxRows <= 0 {
		return nil
	}
	var boundaryID int64
	err := w.db.WithContext(ctx).
		Model(&model.AppLog{}).
		Select("id").
		Order("id DESC").
		Offset(int(maxRows)).
		Limit(1).
		Scan(&boundaryID).Error
	if err != nil {
		return err
	}
	if boundaryID == 0 {
		// 行数未超上限, 偏移查询没有命中行.
		return nil
	}
	return w.db.WithContext(ctx).
		Where("id <= ?", boundaryID).
		Delete(&model.AppLog{}).Error
}
