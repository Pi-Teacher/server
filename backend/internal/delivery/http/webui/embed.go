// Package webui 以 go:embed 内嵌前端 SPA 构建产物.
//
// 产物不入库: `make build` 会先构建 ../front, 再把 front/dist 复制到本包
// 的 dist/ 目录, 随后编译进 pi-teacher-server, 使单个二进制即可同时提供
// WebUI 与 API. 前端未构建时 dist/ 只保留 .gitkeep, go build 与 go test
// 仍能通过, 运行时回退到内置的提示页.
package webui

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var embedded embed.FS

// Dist 返回内嵌前端产物在 dist/ 下的根文件系统.
//
// 交给 http 交付层挂载为静态资源与 SPA fallback 的来源.
func Dist() fs.FS {
	sub, err := fs.Sub(embedded, "dist")
	if err != nil {
		// 路径在编译期固定存在, 失败说明内嵌构建被破坏, 属于不可恢复的编程错误.
		panic("webui: 内嵌 dist 子树缺失: " + err.Error())
	}
	return sub
}
