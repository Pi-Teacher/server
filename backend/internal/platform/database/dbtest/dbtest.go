// Package dbtest 为集成测试提供一次性的数据库连接, 支持在 SQLite
// (默认) 与 MySQL/PostgreSQL (可选) 之间按环境变量切换, 让同一套测试
// 能在不同方言上完整重跑.
//
// 环境变量:
//
//	PI_TEST_DRIVER  sqlite(默认) | mysql | postgres
//	PI_TEST_DSN     非 SQLite 时的完整 DSN; 缺省时直接 t.Fatal
//
// 非 SQLite 目标每次调用都会删除并重建本项目 16 张表, 保证用例从干净
// 状态起步; 删表只针对注册表中的表名, 不触碰同一 schema 下的其他表.
//
// 注意: 非 SQLite 目标共用同一个 schema, 因此跨包并发执行会互相删表.
// 用环境变量跑非 SQLite 时必须以 `go test -p 1 ./...` 串行执行各测试包.
package dbtest

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Pi-Teacher/server/internal/infrastructure/persistence/model"
	"github.com/Pi-Teacher/server/internal/platform/config"
	"github.com/Pi-Teacher/server/internal/platform/database"
)

// EnvDriver/EnvDSN 是切换目标数据库的环境变量名.
const (
	EnvDriver = "PI_TEST_DRIVER"
	EnvDSN    = "PI_TEST_DSN"
)

// Open 打开一个已迁移的空数据库连接, 并在测试结束时自动关闭.
//
// SQLite 走临时目录文件, 天然隔离; 其它方言读取 PI_TEST_DSN, 先删表清空
// 再迁移, 让"依赖空库"的用例 (如首次启动建账号) 稳定成立.
func Open(t *testing.T) *database.DB {
	t.Helper()
	ctx := context.Background()
	cfg := configFor(t)
	db, err := database.Open(ctx, cfg)
	if err != nil {
		t.Fatalf("open %s: %v", cfg.DBDriver, err)
	}
	t.Cleanup(func() { _ = db.Close() })

	if cfg.DBDriver != config.DriverSQLite {
		dropProjectTables(t, db)
	}
	if err := database.Migrate(ctx, db); err != nil {
		t.Fatalf("migrate %s: %v", cfg.DBDriver, err)
	}
	return db
}

// configFor 解析环境变量, 返回目标数据库配置.
func configFor(t *testing.T) *config.Config {
	t.Helper()
	driver := strings.TrimSpace(os.Getenv(EnvDriver))
	if driver == "" {
		driver = config.DriverSQLite
	}
	if driver == config.DriverSQLite {
		return &config.Config{
			DBDriver: config.DriverSQLite,
			DBDSN:    filepath.Join(t.TempDir(), "test.db"),
			Listen:   ":0",
		}
	}
	dsn := strings.TrimSpace(os.Getenv(EnvDSN))
	if dsn == "" {
		t.Fatalf("%s=%s 时必须设置 %s", EnvDriver, driver, EnvDSN)
	}
	return &config.Config{DBDriver: driver, DBDSN: dsn, Listen: ":0"}
}

// projectTables 返回本项目的全部表名 (含 goose 版本表).
func projectTables() []string {
	names := []string{"goose_db_version"}
	for _, m := range model.Models() {
		if tab, ok := m.(interface{ TableName() string }); ok {
			names = append(names, tab.TableName())
		}
	}
	return names
}

// dropProjectTables 删除本项目全部表, 容忍表不存在 (首次运行).
// 先关外键检查, 避免方言差异导致的删除顺序问题 (本项目本就不建外键).
func dropProjectTables(t *testing.T, db *database.DB) {
	t.Helper()
	for _, name := range projectTables() {
		if err := db.DB.Exec("DROP TABLE IF EXISTS " + name).Error; err != nil {
			t.Fatalf("drop %s: %v", name, err)
		}
	}
}
