# Pi Teacher

![Pi Teacher - 越学习，越懂你](docs/poster.png)

Pi Teacher 是一个单用户、自托管的长期记忆与学习管理工具。它使用 FSRS 安排复习，提供 Card、Topic、Glossary、审批、回收站、用户画像、Embedding 和学习统计，并将 React WebUI 内嵌进 Go 服务端二进制。

部署时只需要一个容器或一个 `pi-teacher-server` 二进制，不需要单独安装 Web 服务器或前端运行时。

## 快速开始：Docker Compose

运行环境需要 Docker Engine 和 Docker Compose v2。

```bash
git clone https://github.com/Pi-Teacher/server.git
cd server
docker compose up -d
docker compose logs -f pi-teacher
```

首次启动会在容器日志中输出随机生成的登录密码，并且只显示一次：

```text
首次启动已创建账号.
初始密码 (仅本次显示, 请立即保存):

    <随机密码>
```

保存密码后，浏览器访问：

```text
http://127.0.0.1:3333
```

如果部署在服务器或 NAS 上，将 `127.0.0.1` 换成服务器地址。

如果拉取镜像提示 `denied`，请确认 GitHub Packages 中的 `server` 镜像已设为 Public；私有镜像需要先执行 `docker login ghcr.io`。

默认 Compose 配置使用：

- 镜像：`ghcr.io/pi-teacher/server:latest`
- 端口：`3333`
- 数据库：SQLite
- 宿主机数据目录：`./data`
- 容器内 SQLite 文件：`/data/pi-teacher.db`

停止服务：

```bash
docker compose down
```

`docker compose down` 只删除容器和网络，不会删除宿主机的 `./data`。如需彻底清空数据，请先停止服务并手动删除该目录：

```bash
docker compose down
rm -rf ./data
```

## Docker Compose 配置

仓库根目录的 [`docker-compose.yml`](docker-compose.yml) 支持以下环境变量：

| 变量 | Compose 默认值 | 说明 |
| --- | --- | --- |
| `PI_TEACHER_VERSION` | `latest` | 镜像标签，例如 `v1.0.1` |
| `PI_TEACHER_PORT` | `3333` | 宿主机暴露端口 |
| `PI_TEACHER_DB_DRIVER` | `sqlite` | `sqlite`、`mysql` 或 `postgres` |
| `PI_TEACHER_DB_DSN` | `/data/pi-teacher.db` | 数据库 DSN 或 SQLite 文件路径 |

例如固定使用 `v1.0.1`，并把宿主机端口改为 `8088`：

```bash
PI_TEACHER_VERSION=v1.0.1 PI_TEACHER_PORT=8088 docker compose up -d
```

浏览器访问：

```text
http://127.0.0.1:8088
```

也可以在仓库根目录创建 `.env` 文件，Docker Compose 会自动读取：

```dotenv
PI_TEACHER_VERSION=v1.0.1
PI_TEACHER_PORT=3333
PI_TEACHER_DB_DRIVER=sqlite
PI_TEACHER_DB_DSN=/data/pi-teacher.db
```

不要把包含真实密码或数据库凭据的 `.env` 提交到版本控制。

## 使用 MySQL 或 PostgreSQL

默认 Compose 文件只启动 Pi Teacher 服务端，不负责创建外部数据库。使用 MySQL/PostgreSQL 时，先准备好数据库，再通过环境变量提供连接信息。

PostgreSQL 示例：

```dotenv
PI_TEACHER_DB_DRIVER=postgres
PI_TEACHER_DB_DSN=postgres://pi_teacher:change-me@postgres.example.com:5432/pi_teacher?sslmode=require
```

MySQL 使用 GORM MySQL Dialector 接受的 DSN，例如：

```dotenv
PI_TEACHER_DB_DRIVER=mysql
PI_TEACHER_DB_DSN=pi_teacher:change-me@tcp(mysql.example.com:3306)/pi_teacher?charset=utf8mb4&parseTime=true&loc=UTC
```

重启容器使配置生效：

```bash
docker compose up -d
```

## 密码重置

忘记 WebUI 登录密码时，可以在容器内执行本机管理命令。该命令会生成新密码并吊销全部现有 Session：

```bash
docker compose exec pi-teacher \
  pi-teacher-server admin reset-password
```

命令使用容器中的 `PI_TEACHER_DB_DRIVER` 和 `PI_TEACHER_DB_DSN` 环境变量，不需要重复传入 DSN。

## 更新镜像

使用 `latest`：

```bash
docker compose pull
docker compose up -d
```

使用固定版本时，先修改 `PI_TEACHER_VERSION`，再执行相同命令。

服务端启动时会自动执行数据库迁移。升级前仍建议备份数据。

## SQLite 数据备份

默认 SQLite 数据保存在宿主机 `./data` 目录。备份前建议先停止服务，确保 WAL 中的数据全部落盘：

```bash
docker compose stop pi-teacher
tar czf pi-teacher-data.tar.gz -C ./data .
docker compose start pi-teacher
```

恢复备份：

```bash
docker compose stop pi-teacher
rm -rf ./data
mkdir -p ./data
tar xzf pi-teacher-data.tar.gz -C ./data
docker compose start pi-teacher
```

`./data` 已加入 `.gitignore`，不会被误提交到版本控制。

## 直接运行二进制

从 [GitHub Releases](https://github.com/Pi-Teacher/server/releases) 下载对应平台的 `pi-teacher-server`。

SQLite：

```bash
PI_TEACHER_DB_DSN=./data/pi-teacher.db \
  ./pi-teacher-server serve
```

浏览器访问 `http://127.0.0.1:3333`。

支持的运行环境变量：

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PI_TEACHER_DB_DRIVER` | `sqlite` | 数据库驱动 |
| `PI_TEACHER_DB_DSN` | 无，必须提供 | 数据库 DSN 或 SQLite 文件路径 |
| `PI_TEACHER_LISTEN` | `:3333` | HTTP 监听地址 |

同名命令行参数优先于环境变量，例如：

```bash
PI_TEACHER_LISTEN=:3333 \
  ./pi-teacher-server serve \
  --db-dsn ./data/pi-teacher.db \
  --listen 127.0.0.1:8088
```

## 本机管理命令

只执行数据库迁移：

```bash
PI_TEACHER_DB_DSN=./data/pi-teacher.db \
  ./pi-teacher-server migrate
```

重置密码：

```bash
PI_TEACHER_DB_DSN=./data/pi-teacher.db \
  ./pi-teacher-server admin reset-password
```

这些本机管理命令不使用 Web Session 或 API Key。安全边界是能够执行该进程并读取数据库连接配置的操作系统用户。

## 从源码构建

要求：

- Go 版本以 `backend/go.mod` 为准
- Node.js 24
- npm
- GNU Make

安装前端依赖并构建完整单二进制：

```bash
cd front
npm install

cd ../backend
make build
```

产物位置：

```text
backend/bin/pi-teacher-server
```

`make build` 会自动完成：

1. `npm run build`
2. 把 `front/dist` 复制进 Go 的 `go:embed` 目录
3. 编译内嵌 WebUI 的 `pi-teacher-server`

开发模式：

```bash
# 后端，默认 http://127.0.0.1:3333
cd backend
make run

# 前端，Vite 默认 http://127.0.0.1:3000，并代理 /api 到 3333
cd front
npm run dev
```

## 发布产物

仓库提供两个手动触发的 GitHub Actions：

- `Release`：从最新 tag 指向的 commit 构建 Linux、macOS、Windows 的 amd64/arm64 二进制，并附加到 GitHub Release。
- `Docker Image Build`：从最新 tag 指向的 commit 构建 `linux/amd64` 与 `linux/arm64` 多架构镜像，并推送：

```text
ghcr.io/pi-teacher/server:<tag>
ghcr.io/pi-teacher/server:latest
```

## 安全提示

- 首次密码、重置密码、新建 API Key 等敏感值只显示一次，请立即保存。
- 不要把数据库 DSN、密码、API Key 或其他密钥提交到 Git。
- 暴露到公网时，请在反向代理层配置 HTTPS，并限制管理端访问来源。
- `latest` 会随最近一次镜像构建移动；生产环境建议固定使用语义化版本标签，例如 `v1.0.1`。

## License

本项目基于 [MIT License](LICENSE) 开源。

Copyright (c) 2026 Pi-Teacher
