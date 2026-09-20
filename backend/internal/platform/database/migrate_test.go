package database_test

import (
	"context"
	"sort"
	"strings"
	"testing"

	"gorm.io/gorm"

	"github.com/Pi-Teacher/server/internal/infrastructure/persistence"
	"github.com/Pi-Teacher/server/internal/infrastructure/persistence/model"
	"github.com/Pi-Teacher/server/internal/platform/config"
	"github.com/Pi-Teacher/server/internal/platform/database"
	"github.com/Pi-Teacher/server/internal/platform/database/dbtest"
)

// expectedTables 列出全部 16 张表, 含 goose 的版本记录表.
var expectedTables = []string{
	"account",
	"api_key",
	"app_log",
	"approval_request",
	"approval_target",
	"calendar",
	"card",
	"card_schedule",
	"glossary",
	"goose_db_version",
	"idempotency_record",
	"review_log",
	"setting_keys",
	"topic",
	"trashed_card",
	"web_session",
}

func openMigrated(t *testing.T) *database.DB {
	t.Helper()
	return dbtest.Open(t)
}

// currentSchema 返回当前连接的默认 schema 名, 用于信息模式查询.
// SQLite 无 schema 概念, 返回空串.
func currentSchema(t *testing.T, db *database.DB) string {
	t.Helper()
	switch db.Driver {
	case config.DriverSQLite:
		return ""
	case config.DriverMySQL:
		var name string
		if err := db.DB.Raw("SELECT DATABASE()").Scan(&name).Error; err != nil {
			t.Fatalf("query database(): %v", err)
		}
		return name
	default:
		var name string
		if err := db.DB.Raw("SELECT current_schema()").Scan(&name).Error; err != nil {
			t.Fatalf("query current_schema(): %v", err)
		}
		return name
	}
}

// listTables 返回库内全部业务表名, 按方言分别查询.
func listTables(t *testing.T, db *database.DB) []string {
	t.Helper()
	var names []string
	switch db.Driver {
	case config.DriverSQLite:
		rows, err := db.SQL().QueryContext(context.Background(),
			`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
		if err != nil {
			t.Fatalf("query tables: %v", err)
		}
		defer rows.Close()
		for rows.Next() {
			var name string
			if err := rows.Scan(&name); err != nil {
				t.Fatal(err)
			}
			// sqlite_sequence 是 AUTOINCREMENT 的内部表, 不属于业务表.
			if name == "sqlite_sequence" {
				continue
			}
			names = append(names, name)
		}
		if err := rows.Err(); err != nil {
			t.Fatal(err)
		}
	case config.DriverMySQL:
		rows, err := db.SQL().QueryContext(context.Background(),
			`SELECT table_name FROM information_schema.tables
			 WHERE table_schema = DATABASE() ORDER BY table_name`)
		if err != nil {
			t.Fatalf("query tables: %v", err)
		}
		defer rows.Close()
		for rows.Next() {
			var name string
			if err := rows.Scan(&name); err != nil {
				t.Fatal(err)
			}
			names = append(names, name)
		}
		if err := rows.Err(); err != nil {
			t.Fatal(err)
		}
	default:
		rows, err := db.SQL().QueryContext(context.Background(),
			`SELECT table_name FROM information_schema.tables
			 WHERE table_schema = current_schema() ORDER BY table_name`)
		if err != nil {
			t.Fatalf("query tables: %v", err)
		}
		defer rows.Close()
		for rows.Next() {
			var name string
			if err := rows.Scan(&name); err != nil {
				t.Fatal(err)
			}
			names = append(names, name)
		}
		if err := rows.Err(); err != nil {
			t.Fatal(err)
		}
	}
	// 目标库可能混有非本项目的表 (如公共学习实例): 只保留预期表集,
	// 与 expectedTables 比较时不把无关表当成错误.
	sort.Strings(names)
	return filterToExpected(names)
}

// filterToExpected 只保留 expectedTables 中的表名, 保持入参顺序.
func filterToExpected(names []string) []string {
	want := make(map[string]struct{}, len(expectedTables))
	for _, n := range expectedTables {
		want[n] = struct{}{}
	}
	out := names[:0]
	for _, n := range names {
		if _, ok := want[n]; ok {
			out = append(out, n)
		}
	}
	return out
}

// TestMigrateCreatesAllTables 验证迁移后表集合与预期一致.
func TestMigrateCreatesAllTables(t *testing.T) {
	db := openMigrated(t)

	for _, m := range model.Models() {
		if !db.Migrator().HasTable(m) {
			t.Errorf("missing table for model %T", m)
		}
	}

	names := listTables(t, db)

	if len(names) != len(expectedTables) {
		t.Fatalf("table count = %d, want %d: %v", len(names), len(expectedTables), names)
	}
	for i, want := range expectedTables {
		if names[i] != want {
			t.Fatalf("table[%d] = %q, want %q", i, names[i], want)
		}
	}
}

// TestMigrateIsIdempotent 验证重复执行迁移是空操作.
func TestMigrateIsIdempotent(t *testing.T) {
	db := openMigrated(t)
	if err := database.Migrate(context.Background(), db); err != nil {
		t.Fatalf("second migrate: %v", err)
	}
}

// TestNoForeignKeyConstraints 验证 DDL 中没有任何外键:
// 项目统一使用 Go 逻辑外键, 迁移里混入数据库外键属于实现错误.
func TestNoForeignKeyConstraints(t *testing.T) {
	db := openMigrated(t)
	for _, name := range listTables(t, db) {
		for _, ddl := range tableDDL(t, db, name) {
			upper := strings.ToUpper(ddl)
			if strings.Contains(upper, "FOREIGN KEY") || strings.Contains(upper, "REFERENCES") {
				t.Errorf("unexpected foreign key in DDL of %s: %s", name, ddl)
			}
		}
	}
}

// tableDDL 返回某张表的建表语句片段, 按方言分别查询.
// 返回值只用于子串检测, 不追求完整还原.
func tableDDL(t *testing.T, db *database.DB, table string) []string {
	t.Helper()
	var out []string
	switch db.Driver {
	case config.DriverSQLite:
		var ddl string
		if err := db.DB.Raw(
			`SELECT COALESCE(sql, '') FROM sqlite_master WHERE type='table' AND name = ?`,
			table).Scan(&ddl).Error; err != nil {
			t.Fatalf("query ddl %s: %v", table, err)
		}
		out = append(out, ddl)
	default:
		// MySQL/PG 都用 information_schema 检查外键约束, 而不是解析 DDL 文本.
		var refs []string
		if err := db.DB.Raw(
			`SELECT constraint_name FROM information_schema.referential_constraints
			 WHERE constraint_schema = `+schemaExpr(db)+` AND table_name = ?`,
			table).Scan(&refs).Error; err != nil {
			t.Fatalf("query fk %s: %v", table, err)
		}
		for _, r := range refs {
			// 有外键就构造一段含关键字的文本, 让上面的断言命中.
			out = append(out, "FOREIGN KEY "+r)
		}
	}
	return out
}

// schemaExpr 返回当前 schema 的 SQL 表达式, 供 information_schema 查询.
func schemaExpr(db *database.DB) string {
	if db.Driver == config.DriverMySQL {
		return "DATABASE()"
	}
	return "current_schema()"
}

// TestOptimisticLockHelper 验证乐观锁 helper:
// 命中时递增 version, 期望版本过期时返回冲突且不覆盖新值.
func TestOptimisticLockHelper(t *testing.T) {
	db := openMigrated(t)
	now := persistence.Now()

	topic := model.Topic{Name: "A", Description: "", Version: 1, CreatedAt: now, UpdatedAt: now}
	if err := db.DB.Create(&topic).Error; err != nil {
		t.Fatal(err)
	}

	err := db.DB.Transaction(func(tx *gorm.DB) error {
		return persistence.UpdateOptimistic(tx, &model.Topic{}, topic.ID, 1, map[string]any{"name": "B"})
	})
	if err != nil {
		t.Fatalf("first optimistic update: %v", err)
	}

	// 仍用旧版本更新, 必须冲突.
	err = db.DB.Transaction(func(tx *gorm.DB) error {
		return persistence.UpdateOptimistic(tx, &model.Topic{}, topic.ID, 1, map[string]any{"name": "C"})
	})
	if err != persistence.ErrVersionConflict {
		t.Fatalf("stale optimistic update error = %v, want ErrVersionConflict", err)
	}

	var reloaded model.Topic
	if err := db.DB.First(&reloaded, topic.ID).Error; err != nil {
		t.Fatal(err)
	}
	if reloaded.Version != 2 || reloaded.Name != "B" {
		t.Fatalf("after update: version=%d name=%q, want version=2 name=B", reloaded.Version, reloaded.Name)
	}
}
