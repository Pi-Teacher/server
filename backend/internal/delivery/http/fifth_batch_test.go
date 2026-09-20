package httpapi_test

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/Pi-Teacher/server/internal/platform/settings"
)

// embeddingConfigLite 是配置端点响应子集.
type embeddingConfigLite struct {
	BaseURL                   string `json:"base_url"`
	APIKey                    string `json:"api_key"`
	Model                     string `json:"model"`
	Dimensions                int64  `json:"dimensions"`
	TimeoutSeconds            int64  `json:"timeout_seconds"`
	WorkerBatchSize           int64  `json:"worker_batch_size"`
	SimilarityMinReadyPercent int64  `json:"similarity_min_ready_percent"`
}

type embeddingConfigEnvelope struct {
	Config embeddingConfigLite `json:"config"`
}

type embeddingCoverageLite struct {
	TotalEnabled int64   `json:"total_enabled"`
	Ready        int64   `json:"ready"`
	Pending      int64   `json:"pending"`
	Processing   int64   `json:"processing"`
	Failed       int64   `json:"failed"`
	ReadyPercent float64 `json:"ready_percent"`
}

type embeddingStatusLite struct {
	Rebuilding        bool                  `json:"rebuilding"`
	SimilarityEnabled bool                  `json:"similarity_enabled"`
	Coverage          embeddingCoverageLite `json:"coverage"`
}

type checkMatchLite struct {
	ID         int64    `json:"id"`
	Front      string   `json:"front"`
	Similarity *float64 `json:"similarity"`
}

type checkResponseLite struct {
	MatchType string                 `json:"match_type"`
	Coverage  *embeddingCoverageLite `json:"coverage"`
	Matches   []checkMatchLite       `json:"matches"`
}

// statusEmbedding 读取 embedding 状态.
func statusEmbedding(t *testing.T, ts *testServer) embeddingStatusLite {
	t.Helper()
	resp := ts.do(http.MethodGet, "/api/web/embedding/status", nil, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("embedding status = %d, want 200", resp.StatusCode)
	}
	var out embeddingStatusLite
	decodeBody(t, resp, &out)
	return out
}

// rebuildEmbedding 触发一次完整重建并断言 202.
func rebuildEmbedding(t *testing.T, ts *testServer, csrf string) {
	t.Helper()
	resp := ts.do(http.MethodPost, "/api/web/embedding/rebuild", nil,
		map[string]string{"X-CSRF-Token": csrf})
	if resp.StatusCode != http.StatusAccepted {
		t.Fatalf("embedding rebuild = %d, want 202", resp.StatusCode)
	}
	resp.Body.Close()
}

// drainWorker 反复驱动 worker 直到没有 pending/processing, 再执行完成判定.
func drainWorker(t *testing.T, ts *testServer) {
	t.Helper()
	ctx := context.Background()
	for i := 0; i < 20; i++ {
		n, err := ts.worker.RunOnce(ctx)
		if err != nil {
			t.Fatalf("worker RunOnce error: %v", err)
		}
		if n == 0 {
			break
		}
	}
	ts.embeddingSvc.FinalizeIfIdle(ctx)
}

// TestFifthBatchWorkerGeneratesEmbedding 覆盖: 建卡 → worker 自动生成 →
// 状态 ready → check 返回语义候选, 并验证覆盖率统计.
func TestFifthBatchWorkerGeneratesEmbedding(t *testing.T) {
	ts := newTestServer(t)
	csrf := ts.login()

	card := createCardWeb(t, ts, csrf, nil, "Go slice 的底层结构?", "slice header")

	// 建卡后默认启用 embedding, 应为 pending.
	st := statusEmbedding(t, ts)
	if st.Coverage.TotalEnabled != 1 || st.Coverage.Pending != 1 {
		t.Fatalf("after create coverage = %+v, want total=1 pending=1", st.Coverage)
	}

	// worker 处理一批后应变为 ready.
	drainWorker(t, ts)
	st = statusEmbedding(t, ts)
	if st.Coverage.Ready != 1 || st.Coverage.Pending != 0 || st.Coverage.Failed != 0 {
		t.Fatalf("after worker coverage = %+v, want ready=1 pending=0 failed=0", st.Coverage)
	}

	// 直接检查库中向量已写入.
	var detail struct {
		EmbeddingStatus string `json:"embedding_status"`
	}
	resp := ts.do(http.MethodGet, fmt.Sprintf("/api/web/cards/%d", card.ID), nil, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("get card = %d, want 200", resp.StatusCode)
	}
	decodeBody(t, resp, &detail)
	if detail.EmbeddingStatus != "ready" {
		t.Fatalf("embedding_status = %q, want ready", detail.EmbeddingStatus)
	}
}

// TestFifthBatchRebuildAndCoverage 覆盖手动重建与覆盖率达标后相似度恢复:
// 先让相似度关闭, 手动重建, worker 处理完毕后 similarity_enabled 打开.
func TestFifthBatchRebuildAndCoverage(t *testing.T) {
	ts := newTestServer(t)
	csrf := ts.login()

	createCardWeb(t, ts, csrf, nil, "什么是 goroutine?", "轻量线程")
	createCardWeb(t, ts, csrf, nil, "什么是 channel?", "goroutine 通信")

	// 手动完整重建: 清空全部并置 pending, similarity_enabled 立即关闭.
	rebuildEmbedding(t, ts, csrf)
	st := statusEmbedding(t, ts)
	if !st.Rebuilding {
		t.Fatal("rebuilding should be true after rebuild")
	}
	if st.SimilarityEnabled {
		t.Fatal("similarity_enabled should be false right after rebuild")
	}
	if st.Coverage.Pending != 2 || st.Coverage.Ready != 0 {
		t.Fatalf("coverage after rebuild = %+v, want pending=2 ready=0", st.Coverage)
	}

	// worker 处理完毕 + 完成判定: 2/2 = 100% >= 90, 相似度打开, rebuilding 关闭.
	drainWorker(t, ts)
	st = statusEmbedding(t, ts)
	if st.Rebuilding {
		t.Fatal("rebuilding should be false after drain")
	}
	if !st.SimilarityEnabled {
		t.Fatal("similarity_enabled should be true after 100% coverage")
	}
	if st.Coverage.Ready != 2 {
		t.Fatalf("ready = %d, want 2", st.Coverage.Ready)
	}
}

// TestFifthBatchRetryFailed 覆盖 retry-failed: 无失败项直接成功;
// 有失败项时重新排队并在处理后打开相似度.
func TestFifthBatchRetryFailed(t *testing.T) {
	ts := newTestServer(t)
	csrf := ts.login()

	// 无失败项: 直接 202, 不进入 rebuilding.
	resp := ts.do(http.MethodPost, "/api/web/embedding/retry-failed", nil,
		map[string]string{"X-CSRF-Token": csrf})
	if resp.StatusCode != http.StatusAccepted {
		t.Fatalf("retry-failed (none) = %d, want 202", resp.StatusCode)
	}
	resp.Body.Close()
	if statusEmbedding(t, ts).Rebuilding {
		t.Fatal("rebuilding must stay false when no failed cards")
	}

	// 造一张失败卡: 让 provider 报错后建卡并处理.
	createCardWeb(t, ts, csrf, nil, "会失败的卡", "back")
	ts.provider.setError(errors.New("上游连接被拒绝"))
	drainWorker(t, ts)
	st := statusEmbedding(t, ts)
	if st.Coverage.Failed != 1 {
		t.Fatalf("failed = %d, want 1", st.Coverage.Failed)
	}
	// 失败不阻止完成判定: 覆盖率 0/1 = 0 < 90, 相似度保持关闭.
	if st.SimilarityEnabled {
		t.Fatal("similarity should stay disabled at 0 percent")
	}

	// 修复 provider 后 retry-failed 应重新排队并最终达标.
	ts.provider.setError(nil)
	resp = ts.do(http.MethodPost, "/api/web/embedding/retry-failed", nil,
		map[string]string{"X-CSRF-Token": csrf})
	if resp.StatusCode != http.StatusAccepted {
		t.Fatalf("retry-failed = %d, want 202", resp.StatusCode)
	}
	resp.Body.Close()
	drainWorker(t, ts)
	st = statusEmbedding(t, ts)
	if st.Coverage.Ready != 1 || st.Coverage.Failed != 0 {
		t.Fatalf("after retry coverage = %+v, want ready=1 failed=0", st.Coverage)
	}
	if !st.SimilarityEnabled {
		t.Fatal("similarity should be enabled after retry reached 100 percent")
	}
}

// TestFifthBatchCheckExact 覆盖 enable_embedding=false 的精确查重:
// 同 front (含大小写/全角归一) 命中, 不同 front 不命中.
func TestFifthBatchCheckExact(t *testing.T) {
	ts := newTestServer(t)
	csrf := ts.login()

	// 建一张不启用 embedding 的卡.
	resp := ts.do(http.MethodPost, "/api/web/cards", map[string]any{
		"front": "New York 的地铁", "back": "subway", "enable_embedding": false,
	}, map[string]string{"X-CSRF-Token": csrf})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create card = %d, want 201", resp.StatusCode)
	}
	var created cardDetailLite
	decodeBody(t, resp, &created)

	// 大小写不同的同 front 应命中 exact.
	check := func(front string) checkResponseLite {
		t.Helper()
		resp := ts.do(http.MethodPost, "/api/cli/cards/check", map[string]any{
			"front": front, "enable_embedding": false,
		}, map[string]string{"Authorization": "Bearer " + ts.makeAPIKey(t, csrf), "Idempotency-Key": "check-" + front})
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("check %q = %d, want 200", front, resp.StatusCode)
		}
		var out checkResponseLite
		decodeBody(t, resp, &out)
		return out
	}

	hit := check("new york 的地铁")
	if hit.MatchType != "exact" {
		t.Fatalf("match_type = %q, want exact", hit.MatchType)
	}
	if len(hit.Matches) != 1 || hit.Matches[0].ID != created.ID {
		t.Fatalf("matches = %+v, want the created card", hit.Matches)
	}
	if hit.Matches[0].Similarity != nil {
		t.Fatal("exact match must not carry similarity")
	}

	miss := check("北京的地铁")
	if len(miss.Matches) != 0 {
		t.Fatalf("expected no match, got %+v", miss.Matches)
	}
}

// TestFifthBatchCheckSemantic 覆盖语义查重:
// 相似度关闭时 409 similarity_disabled (带 coverage); 开放后返回 top-K.
func TestFifthBatchCheckSemantic(t *testing.T) {
	ts := newTestServer(t)
	csrf := ts.login()

	// 建两张启用 embedding 的卡, 让 worker 生成向量.
	createCardWeb(t, ts, csrf, nil, "goroutine 是什么?", "轻量线程")
	createCardWeb(t, ts, csrf, nil, "channel 是什么?", "通信机制")
	// 让相似度开放: 手动重建 + 排空.
	rebuildEmbedding(t, ts, csrf)
	drainWorker(t, ts)
	if !statusEmbedding(t, ts).SimilarityEnabled {
		t.Fatal("precondition: similarity should be enabled")
	}

	apiKey := ts.makeAPIKey(t, csrf)
	resp := ts.do(http.MethodPost, "/api/cli/cards/check", map[string]any{
		"front": "goroutine 是什么?", "enable_embedding": true, "top_k": 1,
	}, map[string]string{"Authorization": "Bearer " + apiKey, "Idempotency-Key": "sem-1"})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("semantic check = %d, want 200", resp.StatusCode)
	}
	var out checkResponseLite
	decodeBody(t, resp, &out)
	if out.MatchType != "semantic" {
		t.Fatalf("match_type = %q, want semantic", out.MatchType)
	}
	if out.Coverage == nil || out.Coverage.TotalEnabled != 2 {
		t.Fatalf("coverage = %+v, want total_enabled=2", out.Coverage)
	}
	if len(out.Matches) != 1 {
		t.Fatalf("top_k=1 but got %d matches", len(out.Matches))
	}
	if out.Matches[0].Similarity == nil {
		t.Fatal("semantic match must carry similarity")
	}

	// 关闭相似度后应返回 409 similarity_disabled.
	ts.setBoolSetting(t, csrf, "embedding_similarity_enabled", false)
	resp = ts.do(http.MethodPost, "/api/cli/cards/check", map[string]any{
		"front": "goroutine 是什么?", "enable_embedding": true,
	}, map[string]string{"Authorization": "Bearer " + apiKey, "Idempotency-Key": "sem-2"})
	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("disabled check = %d, want 409", resp.StatusCode)
	}
	var errBody struct {
		Error struct {
			Code    string         `json:"code"`
			Details map[string]any `json:"details"`
		} `json:"error"`
	}
	decodeBody(t, resp, &errBody)
	if errBody.Error.Code != "similarity_disabled" {
		t.Fatalf("error code = %q, want similarity_disabled", errBody.Error.Code)
	}
	if _, ok := errBody.Error.Details["coverage"]; !ok {
		t.Fatalf("details missing coverage: %+v", errBody.Error.Details)
	}
}

// TestFifthBatchCheckEmbeddingUnavailable 覆盖查询向量生成失败返回 503.
func TestFifthBatchCheckEmbeddingUnavailable(t *testing.T) {
	ts := newTestServer(t)
	csrf := ts.login()

	// 先开放相似度 (空集合按 100%).
	rebuildEmbedding(t, ts, csrf)
	drainWorker(t, ts)

	apiKey := ts.makeAPIKey(t, csrf)
	ts.provider.setError(errors.New("连接超时"))
	resp := ts.do(http.MethodPost, "/api/cli/cards/check", map[string]any{
		"front": "任意", "enable_embedding": true,
	}, map[string]string{"Authorization": "Bearer " + apiKey, "Idempotency-Key": "unavail-1"})
	if resp.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("unavailable check = %d, want 503", resp.StatusCode)
	}
	var errBody struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	decodeBody(t, resp, &errBody)
	if errBody.Error.Code != "embedding_unavailable" {
		t.Fatalf("error code = %q, want embedding_unavailable", errBody.Error.Code)
	}
}

// TestFifthBatchRebuildBlocksConfigPatch 覆盖重建期间禁止修改配置 (409).
func TestFifthBatchRebuildBlocksConfigPatch(t *testing.T) {
	ts := newTestServer(t)
	csrf := ts.login()

	rebuildEmbedding(t, ts, csrf)
	resp := ts.do(http.MethodPatch, "/api/web/embedding/config", map[string]any{
		"model": "new-model",
	}, map[string]string{"X-CSRF-Token": csrf})
	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("patch config during rebuild = %d, want 409", resp.StatusCode)
	}
	var errBody struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	decodeBody(t, resp, &errBody)
	if errBody.Error.Code != "rebuilding" {
		t.Fatalf("error code = %q, want rebuilding", errBody.Error.Code)
	}
	// 排空后允许修改, 且返回更新后的配置.
	drainWorker(t, ts)
	resp = ts.do(http.MethodPatch, "/api/web/embedding/config", map[string]any{
		"model": "new-model",
	}, map[string]string{"X-CSRF-Token": csrf})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("patch config after drain = %d, want 200", resp.StatusCode)
	}
	var env embeddingConfigEnvelope
	decodeBody(t, resp, &env)
	if env.Config.Model != "new-model" {
		t.Fatalf("model = %q, want new-model", env.Config.Model)
	}
}

// TestFifthBatchEmbeddingTest 覆盖探测端点: 成功返回 ok=true 与维度,
// 失败仍 200 且 ok=false.
func TestFifthBatchEmbeddingTest(t *testing.T) {
	ts := newTestServer(t)
	csrf := ts.login()

	resp := ts.do(http.MethodPost, "/api/web/embedding/test", nil,
		map[string]string{"X-CSRF-Token": csrf})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("test = %d, want 200", resp.StatusCode)
	}
	var ok struct {
		OK         bool `json:"ok"`
		Dimensions int  `json:"dimensions"`
	}
	decodeBody(t, resp, &ok)
	if !ok.OK || ok.Dimensions != 4 {
		t.Fatalf("test ok=%v dims=%d, want ok=true dims=4", ok.OK, ok.Dimensions)
	}

	ts.provider.setError(errors.New("connection refused"))
	resp = ts.do(http.MethodPost, "/api/web/embedding/test", nil,
		map[string]string{"X-CSRF-Token": csrf})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("failing test = %d, want 200", resp.StatusCode)
	}
	var bad struct {
		OK    bool   `json:"ok"`
		Error string `json:"error"`
	}
	decodeBody(t, resp, &bad)
	if bad.OK || bad.Error == "" {
		t.Fatalf("failing test ok=%v err=%q, want ok=false with error", bad.OK, bad.Error)
	}
}

// --- 测试辅助 ---

// makeAPIKey 创建一个 API Key 并返回明文.
func (ts *testServer) makeAPIKey(t *testing.T, csrf string) string {
	t.Helper()
	name := fmt.Sprintf("agent-%d", time.Now().UnixNano())
	resp := ts.do(http.MethodPost, "/api/web/api-keys", map[string]string{"name": name},
		map[string]string{"X-CSRF-Token": csrf})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create api key = %d, want 201", resp.StatusCode)
	}
	var created struct {
		APIKey string `json:"api_key"`
	}
	decodeBody(t, resp, &created)
	if created.APIKey == "" {
		t.Fatal("empty api key")
	}
	return created.APIKey
}

// setBoolSetting 直接通过设置管理器写一个布尔 key.
// embedding_similarity_enabled 不在通用设置端点的暴露范围内,
// 因此测试绕开 HTTP 直接改内存写库 (与 WebUI 之外的内部写入等价).
func (ts *testServer) setBoolSetting(t *testing.T, _ string, key string, value bool) {
	t.Helper()
	val := "false"
	if value {
		val = "true"
	}
	if err := ts.settings.Apply(context.Background(), []settings.Update{
		{Key: key, Value: val},
	}); err != nil {
		t.Fatalf("apply setting %s: %v", key, err)
	}
}

// TestFifthBatchCheckCLIRequiresIdempotencyKey 验证 CLI check 与其它 CLI
// POST 一致: 缺 Idempotency-Key 返回 400, 而 Web check 不需要该头.
func TestFifthBatchCheckCLIRequiresIdempotencyKey(t *testing.T) {
	ts := newTestServer(t)
	csrf := ts.login()
	apiKey := ts.makeAPIKey(t, csrf)

	resp := ts.do(http.MethodPost, "/api/cli/cards/check", map[string]any{
		"front": "x", "enable_embedding": false,
	}, map[string]string{"Authorization": "Bearer " + apiKey})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("cli check without key = %d, want 400", resp.StatusCode)
	}
	var errBody struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	decodeBody(t, resp, &errBody)
	if errBody.Error.Code != "validation_error" {
		t.Fatalf("error code = %q, want validation_error", errBody.Error.Code)
	}

	// Web check 同构端点不需要 Idempotency-Key.
	resp = ts.do(http.MethodPost, "/api/web/cards/check", map[string]any{
		"front": "x", "enable_embedding": false,
	}, map[string]string{"X-CSRF-Token": csrf})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("web check = %d, want 200", resp.StatusCode)
	}
	resp.Body.Close()
}

// TestFifthBatchCheckValidation 验证 top_k 非正与未知字段被拒绝.
func TestFifthBatchCheckValidation(t *testing.T) {
	ts := newTestServer(t)
	csrf := ts.login()

	resp := ts.do(http.MethodPost, "/api/web/cards/check", map[string]any{
		"front": "x", "top_k": 0,
	}, map[string]string{"X-CSRF-Token": csrf})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("top_k=0 = %d, want 400", resp.StatusCode)
	}
	resp.Body.Close()

	resp = ts.do(http.MethodPost, "/api/web/cards/check", map[string]any{
		"front": "x", "unexpected": 1,
	}, map[string]string{"X-CSRF-Token": csrf})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("unknown field = %d, want 400", resp.StatusCode)
	}
	resp.Body.Close()

	// front 为空按校验错误拒绝.
	resp = ts.do(http.MethodPost, "/api/web/cards/check", map[string]any{
		"front": "  ",
	}, map[string]string{"X-CSRF-Token": csrf})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("empty front = %d, want 400", resp.StatusCode)
	}
	resp.Body.Close()
}
