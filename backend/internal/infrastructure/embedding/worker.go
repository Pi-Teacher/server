package embedding

import (
	"context"
	"log/slog"
	"time"

	"github.com/Pi-Teacher/server/internal/domain/embedding"
	"github.com/Pi-Teacher/server/internal/infrastructure/persistence/repo"
	"github.com/Pi-Teacher/server/internal/platform/logging"
)

// defaultBatchSize 是 batch 设置缺失时的兜底批量, 与设置默认值一致.
const defaultBatchSize = 100

// defaultPollInterval 是空闲时轮询兜底的周期. 正常路径靠 Wake 立即
// 唤醒, 轮询只用于兜底跨进程/遗漏的唤醒信号.
const defaultPollInterval = 5 * time.Second

// Worker 是进程内单实例的 embedding 后台处理器.
//
// 生命周期: Run 启动时先把遗留 processing 改回 pending (崩溃恢复),
// 随后循环 "领取一批 → 事务外逐张调 API → 条件回写", 直到没有
// pending/processing 时调用 onIdle (供重建完成判定) 并等待唤醒.
// 每张卡在一次处理中只调用一次 API, 不重试也不退避: 失败写入 failed
// 与完整错误, 等用户显式 retry.
type Worker struct {
	cards    *repo.CardRepository
	provider embedding.Provider
	// batchSize 每次读取当前设置快照, 保证改配置后无需重启即生效.
	batchSize func() int
	// onIdle 在 worker 排空到无 pending/processing 时调用, 用于重建与
	// retry 的完成判定. 可以为 nil.
	onIdle func(ctx context.Context)
	logger *slog.Logger
	// wake 是容量 1 的唤醒信号: 非阻塞写入, 重复唤醒合并为一次.
	wake     chan struct{}
	interval time.Duration
	now      func() time.Time
}

// NewWorker 构造 worker. batchSize/onIdle 可为 nil.
func NewWorker(
	cards *repo.CardRepository,
	provider embedding.Provider,
	batchSize func() int,
	onIdle func(ctx context.Context),
	logger *slog.Logger,
) *Worker {
	if batchSize == nil {
		batchSize = func() int { return defaultBatchSize }
	}
	return &Worker{
		cards:     cards,
		provider:  provider,
		batchSize: batchSize,
		onIdle:    onIdle,
		logger:    logger,
		wake:      make(chan struct{}, 1),
		interval:  defaultPollInterval,
		now:       nowUTC,
	}
}

// Wake 触发一次立即处理. 非阻塞: 已有待处理信号时不重复入队.
func (w *Worker) Wake() {
	select {
	case w.wake <- struct{}{}:
	default:
	}
}

// RunOnce 领取并处理一批后返回, 供测试在不启动常驻循环时驱动 worker.
// 返回本次领取到的任务数. onIdle 不被调用.
func (w *Worker) RunOnce(ctx context.Context) (int, error) {
	return w.processBatch(ctx)
}

// Run 阻塞运行 worker 直到 ctx 取消. 调用方通常在独立 goroutine 中启动.
func (w *Worker) Run(ctx context.Context) {
	if n, err := w.cards.ResetProcessingEmbedding(ctx, w.now()); err != nil {
		w.warn(ctx, "embedding_reset_failed", "恢复遗留 processing 失败", err)
	} else if n > 0 {
		w.logger.InfoContext(logging.WithEvent(ctx, "embedding_recovered"),
			"启动恢复遗留 processing 任务", "count", n)
	}
	for {
		processed, err := w.processBatch(ctx)
		if err != nil {
			w.warn(ctx, "embedding_batch_failed", "处理 embedding 批次失败", err)
		}
		if processed > 0 {
			// 可能仍有待处理任务, 立即继续下一批.
			continue
		}
		// 已排空: 交给完成判定, 然后等待唤醒或轮询兜底.
		if w.onIdle != nil {
			w.onIdle(ctx)
		}
		select {
		case <-ctx.Done():
			return
		case <-w.wake:
		case <-time.After(w.interval):
		}
	}
}

// processBatch 领取并处理一批, 返回本次领取到的任务数.
// HTTP 调用全部在事务之外; 每个任务独立成败, 不影响同批其他任务.
func (w *Worker) processBatch(ctx context.Context) (int, error) {
	limit := w.batchSize()
	if limit <= 0 {
		limit = defaultBatchSize
	}
	tasks, err := w.cards.ClaimPendingEmbedding(ctx, limit, w.now())
	if err != nil {
		return 0, err
	}
	for i := range tasks {
		if ctx.Err() != nil {
			// 进程退出中: 停止处理, 已领取的 processing 由下次启动恢复.
			return i, ctx.Err()
		}
		w.processOne(ctx, tasks[i])
	}
	return len(tasks), nil
}

// processOne 处理单个任务: 一次 API 调用后条件回写.
// 条件回写未命中说明领取后卡片已被并发修改/关闭 embedding, 静默丢弃结果.
func (w *Worker) processOne(ctx context.Context, task repo.EmbeddingTask) {
	now := w.now()
	vectors, err := w.provider.Embed(ctx, []string{task.Front})
	if err != nil {
		w.writeFailure(ctx, task, now, err.Error())
		return
	}
	if len(vectors) != 1 {
		w.writeFailure(ctx, task, now, "embedding 返回向量数量与请求不一致")
		return
	}
	blob := embedding.Encode(vectors[0])
	ok, err := w.cards.UpdateEmbeddingSuccess(ctx, task.ID, task.Version, blob, now)
	if err != nil {
		w.warn(ctx, "embedding_write_failed", "回写 embedding 成功结果失败", err)
		return
	}
	if !ok {
		w.logger.DebugContext(ctx, "embedding 结果丢弃: 卡片已被并发修改",
			logging.AttrEntityID, task.ID)
	}
}

// writeFailure 把失败写回卡片的 failed 状态与完整错误.
func (w *Worker) writeFailure(ctx context.Context, task repo.EmbeddingTask, now time.Time, errText string) {
	ok, err := w.cards.UpdateEmbeddingFailure(ctx, task.ID, task.Version, errText, now)
	if err != nil {
		w.warn(ctx, "embedding_write_failed", "回写 embedding 失败结果失败", err)
		return
	}
	if !ok {
		w.logger.DebugContext(ctx, "embedding 失败结果丢弃: 卡片已被并发修改",
			logging.AttrEntityID, task.ID)
		return
	}
	w.logger.WarnContext(logging.WithEvent(ctx, "embedding_failed"),
		"embedding 生成失败",
		logging.AttrEntityID, task.ID,
		logging.AttrError, errText)
}

// warn 记录一条 warn 日志, 附事件名与错误.
func (w *Worker) warn(ctx context.Context, event, msg string, err error) {
	w.logger.WarnContext(logging.WithEvent(ctx, event), msg, logging.AttrError, err.Error())
}
