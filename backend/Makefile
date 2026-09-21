# Pi Teacher 服务端开发任务.
#
# 项目要求 Go 1.26.7; GOTOOLCHAIN 让旧版本本地工具链自动拉取指定版本,
# 避免每个开发者手工管理多套 Go 安装.

BINARY      := pi-teacher-server
CMD         := ./cmd/pi-teacher-server
BIN_DIR     := bin
VERSION     ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
LDFLAGS     := -s -w -X github.com/Pi-Teacher/server/internal/platform/version.Version=$(VERSION)

# WebUI 内嵌路径: 前端子项目与 go:embed 读取的产物目录.
FRONT_DIR   := ../front
WEBUI_DIST  := internal/delivery/http/webui/dist

DB_DRIVER ?= sqlite
DB_DSN    ?= ./data/pi-teacher.db

.PHONY: help build build-backend webui test test-race test-mysql test-postgres lint fmt vet staticcheck migrate run clean tidy

help: ## 显示帮助.
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

build: webui ## 构建含 WebUI 的完整服务端二进制到 ./bin.
	GOTOOLCHAIN=go1.26.7 go build -trimpath -ldflags "$(LDFLAGS)" -o $(BIN_DIR)/$(BINARY) $(CMD)

build-backend: ## 仅构建服务端 (跳过 WebUI, 用于不含前端产物的快速编译).
	GOTOOLCHAIN=go1.26.7 go build -trimpath -ldflags "$(LDFLAGS)" -o $(BIN_DIR)/$(BINARY) $(CMD)

webui: ## 构建前端并把产物复制进 go:embed 目录.
	@test -d $(FRONT_DIR)/node_modules || { echo "缺少 $(FRONT_DIR)/node_modules, 请先执行: cd $(FRONT_DIR) && npm install"; exit 1; }
	cd $(FRONT_DIR) && npm run build
	find $(WEBUI_DIST) -mindepth 1 ! -name '.gitkeep' ! -name '.gitignore' -delete
	cp -R $(FRONT_DIR)/dist/. $(WEBUI_DIST)/
	@echo "✓ 已复制前端产物到 $(WEBUI_DIST)"

test: ## 运行全部单元与集成测试 (SQLite).
	GOTOOLCHAIN=go1.26.7 go test ./...

test-race: ## 带竞态检测运行测试.
	GOTOOLCHAIN=go1.26.7 go test -race ./...

test-mysql: ## 用 MySQL 跑集成测试 (需 PI_TEST_DSN).
	@test -n "$(PI_TEST_DSN)" || { echo "需设置 PI_TEST_DSN, 例: mysql://user:pass@tcp(host:port)/db"; exit 1; }
	PI_TEST_DRIVER=mysql GOTOOLCHAIN=go1.26.7 go test -p 1 ./...

test-postgres: ## 用 PostgreSQL 跑集成测试 (需 PI_TEST_DSN).
	@test -n "$(PI_TEST_DSN)" || { echo "需设置 PI_TEST_DSN, 例: postgres://user:pass@host:5432/db?sslmode=disable"; exit 1; }
	PI_TEST_DRIVER=postgres GOTOOLCHAIN=go1.26.7 go test -p 1 ./...

lint: fmt vet ## 格式化并静态检查.

fmt: ## 格式化全部 Go 源码.
	GOTOOLCHAIN=go1.26.7 gofmt -w .

vet: ## 运行 go vet.
	GOTOOLCHAIN=go1.26.7 go vet ./...

staticcheck: ## 运行 staticcheck (需以 Go 1.26 工具链构建).
	GOTOOLCHAIN=go1.26.7 go run honnef.co/go/tools/cmd/staticcheck@latest ./...

tidy: ## 整理 go.mod/go.sum.
	GOTOOLCHAIN=go1.26.7 go mod tidy

migrate: ## 按 DB_DRIVER/DB_DSN 执行迁移.
	GOTOOLCHAIN=go1.26.7 go run $(CMD) migrate --db-driver $(DB_DRIVER) --db-dsn "$(DB_DSN)"

run: ## 以本地默认配置启动服务.
	GOTOOLCHAIN=go1.26.7 go run $(CMD) serve --db-driver $(DB_DRIVER) --db-dsn "$(DB_DSN)" --listen :8080

clean: ## 清理构建产物.
	rm -rf $(BIN_DIR)
	find $(WEBUI_DIST) -mindepth 1 ! -name '.gitkeep' ! -name '.gitignore' -delete
	@echo "✓ 已清理 $(BIN_DIR) 与 $(WEBUI_DIST) 构建产物"
