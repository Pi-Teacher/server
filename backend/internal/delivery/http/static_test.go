package httpapi

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

// newTestSPA 用内存文件系统构造 SPA 处理器, 不依赖真实前端产物,
// 保证 CI 里未构建 front 时本组用例仍可运行.
func newTestSPA(files map[string]string) http.Handler {
	fsys := fstest.MapFS{}
	for name, body := range files {
		fsys[name] = &fstest.MapFile{Data: []byte(body)}
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	return newSPAHandler(fsys, logger)
}

// builtFiles 模拟一次真实 Vite 构建的产物结构.
func builtFiles() map[string]string {
	return map[string]string{
		"index.html":              "<!doctype html><div id=root></div>",
		"assets/index-abc123.js":  "console.log('app')",
		"assets/index-abc123.css": "body{}",
		"favicon-32.png":          "png",
	}
}

func doSPA(t *testing.T, h http.Handler, method, target string) *http.Response {
	t.Helper()
	req := httptest.NewRequest(method, target, nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec.Result()
}

func TestSPAServesIndexAtRoot(t *testing.T) {
	h := newTestSPA(builtFiles())
	resp := doSPA(t, h, http.MethodGet, "/")
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	if got := resp.Header.Get("Cache-Control"); got != noCacheControl {
		t.Fatalf("Cache-Control = %q, want %q", got, noCacheControl)
	}
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), "id=root") {
		t.Fatalf("root body = %q, want index.html", body)
	}
}

// TestSPADeepLinkFallback 覆盖阶段 8 的核心验收点:
// 刷新 /cards、/settings/general 等前端路由必须返回 index.html 而不是 404.
func TestSPADeepLinkFallback(t *testing.T) {
	h := newTestSPA(builtFiles())
	for _, path := range []string{"/cards", "/settings/general", "/trash", "/nested/deep/path"} {
		resp := doSPA(t, h, http.MethodGet, path)
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("%s status = %d, want 200", path, resp.StatusCode)
		}
		if !strings.Contains(string(body), "id=root") {
			t.Fatalf("%s 未回退到 index.html, body = %q", path, body)
		}
	}
}

func TestSPAServesAssetsWithImmutableCache(t *testing.T) {
	h := newTestSPA(builtFiles())
	resp := doSPA(t, h, http.MethodGet, "/assets/index-abc123.js")
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	if got := resp.Header.Get("Cache-Control"); got != immutableCacheControl {
		t.Fatalf("Cache-Control = %q, want %q", got, immutableCacheControl)
	}
	body, _ := io.ReadAll(resp.Body)
	if string(body) != "console.log('app')" {
		t.Fatalf("body = %q", body)
	}
}

// TestSPAMissingAssetReturns404 确认带扩展名的未命中不回退到 index.html:
// 否则浏览器会把 HTML 当 JS/CSS 解析, 报错难以定位.
func TestSPAMissingAssetReturns404(t *testing.T) {
	h := newTestSPA(builtFiles())
	resp := doSPA(t, h, http.MethodGet, "/assets/gone.js")
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); !strings.Contains(ct, "application/json") {
		t.Fatalf("Content-Type = %q, want JSON error envelope", ct)
	}
}

// TestSPAAPI404StaysJSON 确认 /api 命名空间的未命中不被 SPA 吞掉.
func TestSPAAPI404StaysJSON(t *testing.T) {
	h := newTestSPA(builtFiles())
	resp := doSPA(t, h, http.MethodGet, "/api/web/does-not-exist")
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if strings.Contains(string(body), "id=root") {
		t.Fatalf("/api 未命中被回退成 index.html: %q", body)
	}
}

func TestSPARejectsNonReadMethods(t *testing.T) {
	h := newTestSPA(builtFiles())
	resp := doSPA(t, h, http.MethodPost, "/cards")
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("POST /cards status = %d, want 404", resp.StatusCode)
	}
}

// TestSPAFallbackWhenUnbuilt 覆盖前端未构建时的可操作提示 (503 而非裸 404).
func TestSPAFallbackWhenUnbuilt(t *testing.T) {
	h := newTestSPA(map[string]string{".gitkeep": ""})
	resp := doSPA(t, h, http.MethodGet, "/")
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), "make build") {
		t.Fatalf("提示未包含构建指引: %q", body)
	}
}

func TestCacheControlFor(t *testing.T) {
	cases := map[string]string{
		"assets/index-abc.js": immutableCacheControl,
		"assets/logo-abc.png": immutableCacheControl,
		"index.html":          noCacheControl,
		"favicon-32.png":      noCacheControl,
	}
	for rel, want := range cases {
		if got := cacheControlFor(rel); got != want {
			t.Fatalf("cacheControlFor(%q) = %q, want %q", rel, got, want)
		}
	}
}
