package httpapi_test

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/Pi-Teacher/server/internal/infrastructure/persistence/model"
	"github.com/Pi-Teacher/server/internal/infrastructure/persistence/repo"
	"github.com/Pi-Teacher/server/internal/platform/settings"
)

// userProfileLite 是画像端点响应子集.
type userProfileLite struct {
	Profile string `json:"profile"`
	Version int64  `json:"version"`
}

// appLogLite 是日志端点单条响应子集.
type appLogLite struct {
	ID         int64   `json:"id"`
	LoggedAt   string  `json:"logged_at"`
	Level      string  `json:"level"`
	Event      string  `json:"event"`
	Message    string  `json:"message"`
	RequestID  *string `json:"request_id"`
	Source     *string `json:"source"`
	EntityType *string `json:"entity_type"`
	EntityID   *int64  `json:"entity_id"`
	Details    *string `json:"details"`
}

type appLogsPageLite struct {
	Items    []appLogLite `json:"items"`
	Total    int64        `json:"total"`
	Page     int          `json:"page"`
	PageSize int          `json:"page_size"`
}

// seedAppLog 直接向 app_log 塞一条日志, 供查询与裁剪测试.
func seedAppLog(t *testing.T, ts *testServer, level int16, event, requestID string, loggedAt time.Time) {
	t.Helper()
	row := model.AppLog{
		LoggedAt: loggedAt,
		Level:    level,
		Event:    event,
		Message:  "seed " + event,
	}
	if requestID != "" {
		row.RequestID = &requestID
	}
	// source/entity_type 一并塞入, 验证响应字符串映射.
	src := model.SourceWeb
	et := model.EntityCard
	row.Source = &src
	row.EntityType = &et
	eid := int64(7)
	row.EntityID = &eid
	if err := ts.db.Create(&row).Error; err != nil {
		t.Fatalf("seed app_log: %v", err)
	}
}

// TestSixthBatchUserProfileWeb 覆盖 Web 画像端点: 默认行 version=1 →
// PUT 首次写入 → 版本递增 → 旧版本 PUT 返回 409 version_conflict.
func TestSixthBatchUserProfileWeb(t *testing.T) {
	ts := newTestServer(t)
	csrf := ts.login()

	// 注册表已保证有一条默认行, version=1; 初始画像为空.
	resp := ts.do(http.MethodGet, "/api/web/user-profile", nil, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("get profile = %d, want 200", resp.StatusCode)
	}
	var got userProfileLite
	decodeBody(t, resp, &got)
	if got.Profile != "" || got.Version != 1 {
		t.Fatalf("initial profile = %+v, want empty version 1", got)
	}

	// 首次写入 (expected_version=1).
	resp = ts.do(http.MethodPut, "/api/web/user-profile", map[string]any{
		"profile": "本科计算机专业, Go 后端开发者", "expected_version": 1,
	}, map[string]string{"X-CSRF-Token": csrf})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("put profile = %d, want 200", resp.StatusCode)
	}
	decodeBody(t, resp, &got)
	if got.Version != 2 || got.Profile == "" {
		t.Fatalf("after first put = %+v, want version 2", got)
	}

	// 再读应拿到相同内容与 version=2.
	resp = ts.do(http.MethodGet, "/api/web/user-profile", nil, nil)
	decodeBody(t, resp, &got)
	if got.Version != 2 {
		t.Fatalf("get version = %d, want 2", got.Version)
	}

	// 用过期版本写入应 409, 且 details.current_version=2.
	resp = ts.do(http.MethodPut, "/api/web/user-profile", map[string]any{
		"profile": "过期版本", "expected_version": 1,
	}, map[string]string{"X-CSRF-Token": csrf})
	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("stale put = %d, want 409", resp.StatusCode)
	}
	var errEnv struct {
		Error struct {
			Code    string         `json:"code"`
			Details map[string]any `json:"details"`
		} `json:"error"`
	}
	decodeBody(t, resp, &errEnv)
	if errEnv.Error.Code != "version_conflict" {
		t.Fatalf("error code = %s, want version_conflict", errEnv.Error.Code)
	}
	if cv, _ := errEnv.Error.Details["current_version"].(float64); int64(cv) != 2 {
		t.Fatalf("details.current_version = %v, want 2", errEnv.Error.Details["current_version"])
	}

	// 空字符串是合法内容, 允许写空.
	resp = ts.do(http.MethodPut, "/api/web/user-profile", map[string]any{
		"profile": "", "expected_version": 2,
	}, map[string]string{"X-CSRF-Token": csrf})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("put empty profile = %d, want 200", resp.StatusCode)
	}
	decodeBody(t, resp, &got)
	if got.Profile != "" || got.Version != 3 {
		t.Fatalf("empty profile put = %+v, want empty version 3", got)
	}

	// 缺字段返回 400.
	resp = ts.do(http.MethodPut, "/api/web/user-profile", map[string]any{"profile": "x"},
		map[string]string{"X-CSRF-Token": csrf})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("missing expected_version = %d, want 400", resp.StatusCode)
	}
	resp.Body.Close()
}

// TestSixthBatchUserProfileCLI 覆盖 CLI 画像端点:
// 缺 Idempotency-Key 返回 400, 携带后直写生效, 不产生审批请求.
func TestSixthBatchUserProfileCLI(t *testing.T) {
	ts := newTestServer(t)
	csrf := ts.login()
	apiKey := ts.makeAPIKey(t, csrf)

	// 缺幂等头 → 400.
	resp := ts.do(http.MethodPut, "/api/cli/user-profile", map[string]any{
		"profile": "x", "expected_version": 0,
	}, map[string]string{"Authorization": "Bearer " + apiKey})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("cli put without key = %d, want 400", resp.StatusCode)
	}
	resp.Body.Close()

	// 携带幂等头直写 (默认行 version=1, 写后 2).
	resp = ts.do(http.MethodPut, "/api/cli/user-profile", map[string]any{
		"profile": "CLI 写入", "expected_version": 1,
	}, map[string]string{
		"Authorization":   "Bearer " + apiKey,
		"Idempotency-Key": "profile-1",
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("cli put = %d, want 200", resp.StatusCode)
	}
	var got userProfileLite
	decodeBody(t, resp, &got)
	if got.Profile != "CLI 写入" || got.Version != 2 {
		t.Fatalf("cli put profile = %+v", got)
	}

	// 同 Key 重放返回首次结果 (version 不重复递增).
	resp = ts.do(http.MethodPut, "/api/cli/user-profile", map[string]any{
		"profile": "CLI 写入", "expected_version": 1,
	}, map[string]string{
		"Authorization":   "Bearer " + apiKey,
		"Idempotency-Key": "profile-1",
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("replay put = %d, want 200", resp.StatusCode)
	}
	decodeBody(t, resp, &got)
	if got.Version != 2 {
		t.Fatalf("replay version = %d, want 2", got.Version)
	}

	// CLI 读端点拿到同一内容.
	resp = ts.do(http.MethodGet, "/api/cli/user-profile", nil,
		map[string]string{"Authorization": "Bearer " + apiKey})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("cli get = %d, want 200", resp.StatusCode)
	}
	decodeBody(t, resp, &got)
	if got.Profile != "CLI 写入" || got.Version != 2 {
		t.Fatalf("cli get profile = %+v", got)
	}

	// 画像写入不产生任何审批请求.
	listResp := ts.do(http.MethodGet, "/api/web/approvals", nil, nil)
	var approvals struct {
		Total int64 `json:"total"`
	}
	decodeBody(t, listResp, &approvals)
	if approvals.Total != 0 {
		t.Fatalf("approvals total = %d, want 0", approvals.Total)
	}
}

// TestSixthBatchLogsQuery 覆盖日志查询: 筛选 level/event/request_id、
// 分页结构、降序排序与 source/entity_type 字符串映射.
func TestSixthBatchLogsQuery(t *testing.T) {
	ts := newTestServer(t)
	ts.login()

	base := time.Date(2026, 9, 16, 0, 0, 0, 0, time.UTC)
	seedAppLog(t, ts, model.LogInfo, "card_created", "req-a", base)
	seedAppLog(t, ts, model.LogWarn, "approval_stale", "req-b", base.Add(time.Minute))
	seedAppLog(t, ts, model.LogWarn, "card_created", "req-c", base.Add(2*time.Minute))

	// 全量列表: 降序, 统一分页结构.
	resp := ts.do(http.MethodGet, "/api/web/logs", nil, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("logs = %d, want 200", resp.StatusCode)
	}
	var page appLogsPageLite
	decodeBody(t, resp, &page)
	if page.Total != 3 || page.Page != 1 || page.PageSize != 20 {
		t.Fatalf("logs page = %+v, want total 3 page 1 size 20", page)
	}
	if len(page.Items) != 3 {
		t.Fatalf("items = %d, want 3", len(page.Items))
	}
	// 最新在前: req-c → req-b → req-a.
	if page.Items[0].RequestID == nil || *page.Items[0].RequestID != "req-c" {
		t.Fatalf("top item request = %v, want req-c", page.Items[0].RequestID)
	}
	if page.Items[0].Source == nil || *page.Items[0].Source != "web" {
		t.Fatalf("source = %v, want web", page.Items[0].Source)
	}
	if page.Items[0].EntityType == nil || *page.Items[0].EntityType != "card" {
		t.Fatalf("entity_type = %v, want card", page.Items[0].EntityType)
	}
	if page.Items[0].Level != "warn" {
		t.Fatalf("level = %s, want warn", page.Items[0].Level)
	}

	// level 精确筛选.
	resp = ts.do(http.MethodGet, "/api/web/logs?level=warn", nil, nil)
	decodeBody(t, resp, &page)
	if page.Total != 2 {
		t.Fatalf("warn total = %d, want 2", page.Total)
	}

	// event 精确筛选.
	resp = ts.do(http.MethodGet, "/api/web/logs?event=card_created", nil, nil)
	decodeBody(t, resp, &page)
	if page.Total != 2 {
		t.Fatalf("event total = %d, want 2", page.Total)
	}

	// request_id 精确筛选.
	resp = ts.do(http.MethodGet, "/api/web/logs?request_id=req-b", nil, nil)
	decodeBody(t, resp, &page)
	if page.Total != 1 || page.Items[0].RequestID == nil || *page.Items[0].RequestID != "req-b" {
		t.Fatalf("request_id filter = %+v", page)
	}

	// 非法 level → 400.
	resp = ts.do(http.MethodGet, "/api/web/logs?level=verbose", nil, nil)
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("bad level = %d, want 400", resp.StatusCode)
	}
	resp.Body.Close()
}

// TestSixthBatchLogsPrune 覆盖日志裁剪: AppLogWriter 累计满 30 行后按
// database_max_rows 裁剪, 并保留最新的记录.
func TestSixthBatchLogsPrune(t *testing.T) {
	ts := newTestServer(t)
	ts.login()

	// 通过设置管理器把最大行数压到 5, 保留天数放宽避免按时间删除.
	if err := ts.settings.Apply(context.Background(), []settings.Update{
		{Key: "database_max_rows", Value: "5"},
		{Key: "database_retention_days", Value: "3650"},
	}); err != nil {
		t.Fatalf("apply settings: %v", err)
	}

	writer := repo.NewAppLogWriter(ts.db)
	writer.SetPruneParams(func() (int64, int64) {
		snap := ts.settings.Snapshot()
		return snap.Int64("database_retention_days"), snap.Int64("database_max_rows")
	})

	// 写入 60 行: 累计满 30 触发一次裁剪, 共触发两次, 最终裁到上限 5 行.
	// 每行时间递增保证顺序可预期.
	base := time.Now().UTC().Add(-time.Hour)
	for i := 0; i < 60; i++ {
		row := model.AppLog{
			LoggedAt: base.Add(time.Duration(i) * time.Second),
			Level:    model.LogInfo,
			Event:    fmt.Sprintf("e-%02d", i),
			Message:  "m",
		}
		if err := writer.InsertAppLogs(context.Background(), []model.AppLog{row}); err != nil {
			t.Fatalf("insert %d: %v", i, err)
		}
	}

	var count int64
	if err := ts.db.Model(&model.AppLog{}).Count(&count).Error; err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 5 {
		t.Fatalf("app_log rows = %d, want 5 after two prunes", count)
	}
	// 最新一条必须在: 裁剪删旧留新.
	var newest model.AppLog
	if err := ts.db.Order("id DESC").First(&newest).Error; err != nil {
		t.Fatalf("newest: %v", err)
	}
	if newest.Event != "e-59" {
		t.Fatalf("newest event = %s, want e-59", newest.Event)
	}
}

// TestSixthBatchSystemInfo 覆盖系统信息与健康检查 (第一批已实现, 第六批补断言).
func TestSixthBatchSystemInfo(t *testing.T) {
	ts := newTestServer(t)
	csrf := ts.login()

	// health 无认证.
	resp := ts.do(http.MethodGet, "/api/health", nil, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("health = %d, want 200", resp.StatusCode)
	}
	var health struct {
		Status string `json:"status"`
	}
	decodeBody(t, resp, &health)
	if health.Status != "ok" {
		t.Fatalf("health status = %s, want ok", health.Status)
	}

	// system/info 需要 API Key.
	apiKey := ts.makeAPIKey(t, csrf)
	resp = ts.do(http.MethodGet, "/api/cli/system/info", nil,
		map[string]string{"Authorization": "Bearer " + apiKey})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("system info = %d, want 200", resp.StatusCode)
	}
	var info struct {
		Version       string `json:"version"`
		GoVersion     string `json:"go_version"`
		DBDriver      string `json:"db_driver"`
		UptimeSeconds int64  `json:"uptime_seconds"`
	}
	decodeBody(t, resp, &info)
	if info.Version == "" || info.GoVersion == "" {
		t.Fatalf("system info missing fields: %+v", info)
	}
	if info.DBDriver != ts.driver {
		t.Fatalf("db_driver = %s, want %s", info.DBDriver, ts.driver)
	}
	if info.UptimeSeconds < 0 {
		t.Fatalf("uptime = %d, want >= 0", info.UptimeSeconds)
	}
}

// --- 并发测试 (第六批 6.4, 仅 SQLite) ---

// TestConcurrentKnowledgeNameCreate 验证单实例名称写锁使并发同名创建
// 严格串行化: Topic 和 Glossary 都只能成功创建一行.
func TestConcurrentKnowledgeNameCreate(t *testing.T) {
	ts := newTestServer(t)
	csrf := ts.login()

	tests := []struct {
		name string
		path string
		body map[string]any
		list string
	}{
		{name: "topic", path: "/api/web/topics", body: map[string]any{"name": "并发同名"}, list: "/api/web/topics?q=并发同名"},
		{name: "glossary", path: "/api/web/glossary", body: map[string]any{"term": "并发术语", "definition": "定义"}, list: "/api/web/glossary?q=并发术语"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			const workers = 8
			var wg sync.WaitGroup
			var mu sync.Mutex
			created, conflict, other := 0, 0, 0
			for range workers {
				wg.Add(1)
				go func() {
					defer wg.Done()
					resp := ts.do(http.MethodPost, tc.path, tc.body,
						map[string]string{"X-CSRF-Token": csrf})
					mu.Lock()
					switch resp.StatusCode {
					case http.StatusCreated:
						created++
					case http.StatusConflict:
						conflict++
					default:
						other++
					}
					mu.Unlock()
					resp.Body.Close()
				}()
			}
			wg.Wait()
			if created != 1 || conflict != workers-1 || other != 0 {
				t.Fatalf("created=%d conflict=%d other=%d", created, conflict, other)
			}
			resp := ts.do(http.MethodGet, tc.list, nil, nil)
			var list struct {
				Total int64 `json:"total"`
			}
			decodeBody(t, resp, &list)
			if list.Total != 1 {
				t.Fatalf("total = %d, want 1", list.Total)
			}
		})
	}
}

// TestSixthBatchConcurrentOptimisticLock 验证并发写入同一 Topic 时,
// 恰好一个成功, 其余得到 409 version_conflict, 不出现丢失更新.
func TestSixthBatchConcurrentOptimisticLock(t *testing.T) {
	ts := newTestServer(t)
	csrf := ts.login()
	topicID := createTopicWeb(t, ts, csrf, "并发锁")

	const workers = 8
	var wg sync.WaitGroup
	var mu sync.Mutex
	okCount, conflictCount, otherCount := 0, 0, 0
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			resp := ts.do(http.MethodPatch, fmt.Sprintf("/api/web/topics/%d", topicID),
				map[string]any{"description": fmt.Sprintf("d-%d", n), "expected_version": 1},
				map[string]string{"X-CSRF-Token": csrf})
			mu.Lock()
			switch resp.StatusCode {
			case http.StatusOK:
				okCount++
			case http.StatusConflict:
				conflictCount++
			default:
				otherCount++
			}
			mu.Unlock()
			resp.Body.Close()
		}(i)
	}
	wg.Wait()
	if okCount != 1 {
		t.Fatalf("ok = %d, want exactly 1", okCount)
	}
	if conflictCount != workers-1 {
		t.Fatalf("conflicts = %d, want %d (other=%d)", conflictCount, workers-1, otherCount)
	}
	// 最终 version 恰好为 2, 证明没有多次成功更新叠加.
	resp := ts.do(http.MethodGet, fmt.Sprintf("/api/web/topics/%d", topicID), nil, nil)
	var topic struct {
		Version int64 `json:"version"`
	}
	decodeBody(t, resp, &topic)
	if topic.Version != 2 {
		t.Fatalf("final version = %d, want 2", topic.Version)
	}
}

// TestSixthBatchConcurrentIdempotency 验证同 Idempotency-Key 并发重试
// 只创建一份资源.
func TestSixthBatchConcurrentIdempotency(t *testing.T) {
	ts := newTestServer(t)
	csrf := ts.login()
	disableCLIApprovals(t, ts, csrf)
	apiKey := ts.makeAPIKey(t, csrf)

	const workers = 6
	body := map[string]any{"name": "幂等并发", "description": ""}
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			resp := ts.do(http.MethodPost, "/api/cli/topics", body, map[string]string{
				"Authorization":   "Bearer " + apiKey,
				"Idempotency-Key": "concurrent-topic-1",
			})
			resp.Body.Close()
		}()
	}
	wg.Wait()
	// 无论几个并发请求, 只有一行 Topic.
	resp := ts.do(http.MethodGet, "/api/web/topics?q=幂等并发", nil, nil)
	var list struct {
		Total int64 `json:"total"`
	}
	decodeBody(t, resp, &list)
	if list.Total != 1 {
		t.Fatalf("topics total = %d, want 1", list.Total)
	}
}
