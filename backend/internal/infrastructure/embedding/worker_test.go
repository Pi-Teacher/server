package embedding_test

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"
	"time"

	"gorm.io/gorm"

	"github.com/Pi-Teacher/server/internal/domain/embedding"
	embeddinginfra "github.com/Pi-Teacher/server/internal/infrastructure/embedding"
	"github.com/Pi-Teacher/server/internal/infrastructure/persistence/model"
	"github.com/Pi-Teacher/server/internal/infrastructure/persistence/repo"
	"github.com/Pi-Teacher/server/internal/platform/database/dbtest"
)

// fakeProvider 是确定性 provider, 可按文本决定成功或失败.
type fakeProvider struct {
	dims   int
	failOn string
}

func (p *fakeProvider) Embed(_ context.Context, inputs []string) ([][]float32, error) {
	out := make([][]float32, len(inputs))
	for i, in := range inputs {
		if p.failOn != "" && in == p.failOn {
			return nil, errors.New("上游失败")
		}
		v := make([]float32, p.dims)
		v[0] = 1
		out[i] = v
	}
	return out, nil
}

// setupWorkerDB 打开一个已迁移的空库, 返回 Card 仓库与底层 db.
func setupWorkerDB(t *testing.T) (*repo.CardRepository, *gorm.DB) {
	t.Helper()
	db := dbtest.Open(t)
	return repo.NewCardRepository(db.DB), db.DB
}

// insertCard 插入一张处于指定 embedding 状态的卡.
func insertCard(t *testing.T, cards *repo.CardRepository, front string, status int16) int64 {
	t.Helper()
	s := status
	c := &model.Card{
		Front:            front,
		Back:             "back",
		EnableEmbedding:  true,
		FrontFingerprint: []byte{1, 2, 3, 4, 5, 6, 7, 8},
		Version:          1,
		EmbeddingStatus:  &s,
		CreatedAt:        time.Now().UTC(),
		UpdatedAt:        time.Now().UTC(),
	}
	if err := cards.Create(context.Background(), c); err != nil {
		t.Fatalf("create card: %v", err)
	}
	return c.ID
}

// newTestWorker 构造一个不打印日志的 worker.
func newTestWorker(cards *repo.CardRepository, provider embedding.Provider) *embeddinginfra.Worker {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	return embeddinginfra.NewWorker(cards, provider, func() int { return 10 }, nil, logger)
}

// TestWorkerClaimsAndWritesReady 验证 worker 领取 pending 并写入 ready 向量.
func TestWorkerClaimsAndWritesReady(t *testing.T) {
	cards, _ := setupWorkerDB(t)
	id := insertCard(t, cards, "front-1", model.EmbeddingPending)
	worker := newTestWorker(cards, &fakeProvider{dims: 4})

	n, err := worker.RunOnce(context.Background())
	if err != nil {
		t.Fatalf("RunOnce error: %v", err)
	}
	if n != 1 {
		t.Fatalf("claimed %d, want 1", n)
	}
	got, err := cards.Find(context.Background(), id)
	if err != nil {
		t.Fatalf("find: %v", err)
	}
	if got.EmbeddingStatus == nil || *got.EmbeddingStatus != model.EmbeddingReady {
		t.Fatalf("status = %v, want ready", got.EmbeddingStatus)
	}
	if len(got.Embedding) != 4*4 {
		t.Fatalf("embedding len = %d, want 16", len(got.Embedding))
	}
	if got.EmbeddingError != nil {
		t.Fatalf("embedding_error = %v, want nil", got.EmbeddingError)
	}
	// 领取/回写不改业务 version.
	if got.Version != 1 {
		t.Fatalf("version = %d, want 1 (embedding 不改业务版本)", got.Version)
	}
}

// TestWorkerWritesFailure 验证调用失败时状态置 failed 且保存完整错误.
func TestWorkerWritesFailure(t *testing.T) {
	cards, _ := setupWorkerDB(t)
	id := insertCard(t, cards, "will-fail", model.EmbeddingPending)
	worker := newTestWorker(cards, &fakeProvider{dims: 4, failOn: "will-fail"})

	if _, err := worker.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce error: %v", err)
	}
	got, err := cards.Find(context.Background(), id)
	if err != nil {
		t.Fatalf("find: %v", err)
	}
	if got.EmbeddingStatus == nil || *got.EmbeddingStatus != model.EmbeddingFailed {
		t.Fatalf("status = %v, want failed", got.EmbeddingStatus)
	}
	if got.EmbeddingError == nil || *got.EmbeddingError == "" {
		t.Fatal("expected non-empty embedding_error")
	}
}

// TestWorkerConditionalWriteDiscardsStale 验证领取后被并发修改的卡
// 不会被旧任务结果覆盖: 条件回写未命中, 状态保持新版.
func TestWorkerConditionalWriteDiscardsStale(t *testing.T) {
	cards, db := setupWorkerDB(t)
	id := insertCard(t, cards, "front-1", model.EmbeddingPending)
	worker := newTestWorker(cards, &fakeProvider{dims: 4})

	// 模拟领取 (pending -> processing), 读取 task version.
	tasks, err := cards.ClaimPendingEmbedding(context.Background(), 10, time.Now().UTC())
	if err != nil || len(tasks) != 1 {
		t.Fatalf("claim = %v, %v", tasks, err)
	}
	task := tasks[0]
	// 领取后模拟前端修改 front: version 递增, 状态回到 pending.
	if err := db.Model(&model.Card{}).Where("id = ?", id).
		Updates(map[string]any{"version": 2, "embedding_status": model.EmbeddingPending}).Error; err != nil {
		t.Fatalf("bump version: %v", err)
	}
	// 旧任务回写应未命中. worker 变量仅保留以对齐真实处理入口.
	_ = worker
	ok, err := cards.UpdateEmbeddingSuccess(context.Background(), id, task.Version, []byte{1}, time.Now().UTC())
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if ok {
		t.Fatal("stale write should not match")
	}
	got, _ := cards.Find(context.Background(), id)
	if got.Version != 2 {
		t.Fatalf("version = %d, want 2 (stale result must not overwrite)", got.Version)
	}
}

// TestWorkerResetProcessingOnStartup 验证启动恢复把 processing 改回 pending.
func TestWorkerResetProcessingOnStartup(t *testing.T) {
	cards, _ := setupWorkerDB(t)
	id := insertCard(t, cards, "stuck", model.EmbeddingProcessing)

	n, err := cards.ResetProcessingEmbedding(context.Background(), time.Now().UTC())
	if err != nil {
		t.Fatalf("reset: %v", err)
	}
	if n != 1 {
		t.Fatalf("reset %d, want 1", n)
	}
	got, _ := cards.Find(context.Background(), id)
	if got.EmbeddingStatus == nil || *got.EmbeddingStatus != model.EmbeddingPending {
		t.Fatalf("status = %v, want pending after reset", got.EmbeddingStatus)
	}
}
