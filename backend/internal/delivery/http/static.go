package httpapi

import (
	"bytes"
	"io"
	"io/fs"
	"log/slog"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/Pi-Teacher/server/internal/application/apperr"
)

// zeroTime 是传给 http.ServeContent 的零修改时间, 让内嵌产物不写出 Last-Modified.
var zeroTime time.Time

// 静态资源缓存策略:
// Vite 产出的 /assets/ 文件名带内容哈希, 内容一变文件名就变, 可放心长期强缓存;
// index.html 是版本入口, 必须每次回源校验, 否则用户会一直读到指向旧资源的旧壳.
const (
	immutableCacheControl = "public, max-age=31536000, immutable"
	noCacheControl        = "no-cache"
)

// spaHandler 托管内嵌前端产物: 命中真实文件时按静态资源返回,
// 未命中的无扩展名路径回退到 index.html, 供 React Router 的深链使用.
type spaHandler struct {
	dist   fs.FS
	logger *slog.Logger
}

// newSPAHandler 构造内嵌 WebUI 处理器. dist 是前端产物根目录.
func newSPAHandler(dist fs.FS, logger *slog.Logger) http.Handler {
	return &spaHandler{dist: dist, logger: logger}
}

func (h *spaHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// 静态资源只读, 其他方法没有语义.
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		writeError(w, apperr.NotFound("路由不存在"))
		return
	}

	// /api 命名空间的未命中仍按 API 错误信封返回, 不能回退成 index.html:
	// 否则客户端会对一段 HTML 做主 JSON 解析, 掩盖真实的 404.
	if r.URL.Path == "/api" || strings.HasPrefix(r.URL.Path, "/api/") {
		writeError(w, apperr.NotFound("路由不存在"))
		return
	}

	// 去掉前导斜杠, 空路径代表站点根, 映射到 index.html.
	// embed.FS 与 fstest.MapFS 都会拒绝含 ".." 的路径, 天然挡住目录穿越.
	rel := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")

	if rel == "" {
		h.serveFallback(w, r)
		return
	}

	info, err := fs.Stat(h.dist, rel)
	switch {
	case err == nil && !info.IsDir():
		h.serveFile(w, r, rel)
	case err == nil && info.IsDir():
		// dist 由 Vite 产出, 只有 assets/ 一个子目录; 目录请求尝试其中的 index.html.
		idx := path.Join(rel, "index.html")
		if fi, statErr := fs.Stat(h.dist, idx); statErr == nil && !fi.IsDir() {
			h.serveFile(w, r, idx)
			return
		}
		// 目录下没有入口, 按未命中处理, 落到 fallback 或 404.
		h.missOrFallback(w, r, rel)
	default:
		h.missOrFallback(w, r, rel)
	}
}

// missOrFallback 决定未命中的请求是回退到 SPA 入口还是直接 404.
//
// 带扩展名的请求按静态资源对待并返回 404: 若把 index.html 当 JS/CSS 返回,
// 浏览器会拿到 200 却解析失败, 排障困难. 无扩展名的路径才是前端路由,
// 回退到 index.html 交给 React Router 处理.
func (h *spaHandler) missOrFallback(w http.ResponseWriter, r *http.Request, rel string) {
	if path.Ext(rel) != "" {
		writeError(w, apperr.NotFound("静态资源不存在"))
		return
	}
	h.serveFallback(w, r)
}

// serveFallback 返回 SPA 入口 index.html, 供根路径与前端深链使用.
func (h *spaHandler) serveFallback(w http.ResponseWriter, r *http.Request) {
	if _, err := fs.Stat(h.dist, "index.html"); err != nil {
		// 前端未构建时 dist 只有占位文件, 这里给出可操作的提示而非裸 404.
		h.logger.ErrorContext(r.Context(), "前端产物缺失, 请先执行 make build 构建 WebUI")
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = io.WriteString(w, "WebUI 尚未构建: 请在仓库执行 make build 生成前端产物后重新启动服务.\n")
		return
	}
	h.serveFile(w, r, "index.html")
}

// serveFile 从内嵌产物读取一个文件并写出.
//
// 产物体积受 Vite 控制 (单个 JS 约 700KB), 一次性读入内存换取统一的
// http.ServeContent 处理 (Content-Type 探测、Range、HEAD), 实现更简单.
func (h *spaHandler) serveFile(w http.ResponseWriter, r *http.Request, rel string) {
	data, err := fs.ReadFile(h.dist, rel)
	if err != nil {
		writeError(w, apperr.NotFound("静态资源不存在"))
		return
	}
	w.Header().Set("Cache-Control", cacheControlFor(rel))
	// modtime 传零值: 内嵌产物没有有意义的修改时间, 避免写出误导性的 Last-Modified.
	http.ServeContent(w, r, path.Base(rel), zeroTime, bytes.NewReader(data))
}

// cacheControlFor 返回路径对应的缓存策略.
//
// /assets/ 下的资源由 Vite 加内容哈希, 可永久强缓存; 其余 (index.html、
// 根目录下的图标) 文件名不随内容变化, 必须回源校验.
func cacheControlFor(rel string) string {
	if strings.HasPrefix(rel, "assets/") {
		return immutableCacheControl
	}
	return noCacheControl
}
