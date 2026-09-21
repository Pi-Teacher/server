# syntax=docker/dockerfile:1

# Pi Teacher 服务端镜像: 前端与后端都在镜像内构建, 产出单一二进制的运行镜像.
#
# 交叉编译策略: 前两个阶段固定跑在 BUILDPLATFORM (构建机原生架构) 上,
# 由 Go 自己用 GOOS/GOARCH 交叉编译出目标平台二进制, 因此 linux/arm64
# 镜像不需要 QEMU 模拟执行任何编译动作, 只有最后运行镜像按目标平台选择基础镜像.

# ---------- 前端构建 ----------
# 固定 BUILDPLATFORM: 产物是平台无关的静态文件, 无需按目标架构重复构建.
FROM --platform=$BUILDPLATFORM node:24-alpine AS frontend
WORKDIR /src/front
# 先只拷贝清单以利用层缓存: 依赖不变时不重复 npm ci.
COPY front/package.json front/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY front/ ./
RUN npm run build

# ---------- 服务端构建 ----------
FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS backend
# TARGETOS/TARGETARCH 由 buildx 按 --platform 注入, 用于 Go 交叉编译.
ARG TARGETOS
ARG TARGETARCH
ARG VERSION=dev
WORKDIR /src/backend
# 先拷贝模块清单单独下载依赖, 同样是为了命中层缓存.
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
# 前端产物写入 go:embed 目标目录, 与本地 make webui 的效果一致.
COPY --from=frontend /src/front/dist/ ./internal/delivery/http/webui/dist/
# CGO_ENABLED=0 产出静态二进制, 保证可在最小运行镜像中运行.
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
      go build -trimpath \
      -ldflags "-s -w -X github.com/Pi-Teacher/server/internal/platform/version.Version=${VERSION}" \
      -o /out/pi-teacher-server ./cmd/pi-teacher-server

# ---------- 运行镜像 ----------
FROM alpine:3.21

# ca-certificates: 调用外部 embedding API (HTTPS) 需要根证书.
# tzdata: 日历按 calendar_timezone 归属自然日, 需要时区数据库.
# 以非 root 用户运行, 并以 /data 作为默认可写数据目录 (SQLite 文件落在这里).
RUN apk add --no-cache ca-certificates tzdata wget \
 && adduser -D -H -u 10001 pi \
 && mkdir -p /data \
 && chown pi:pi /data

COPY --from=backend /out/pi-teacher-server /usr/local/bin/pi-teacher-server

USER pi
WORKDIR /data
VOLUME ["/data"]

EXPOSE 8080

# /api/health 无需认证, 适合作为存活探针.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/health >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/usr/local/bin/pi-teacher-server"]
# 容器内必须监听 0.0.0.0 才能被端口映射访问; 数据落在挂载卷 /data.
CMD ["serve", "--db-driver", "sqlite", "--db-dsn", "/data/pi-teacher.db", "--listen", ":8080"]
