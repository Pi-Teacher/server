package config

import "testing"

func clearConfigEnv(t *testing.T) {
	t.Helper()
	t.Setenv(EnvDBDriver, "")
	t.Setenv(EnvDBDSN, "")
	t.Setenv(EnvListen, "")
}

func TestParseUsesEnvironment(t *testing.T) {
	clearConfigEnv(t)
	t.Setenv(EnvDBDriver, DriverPostgres)
	t.Setenv(EnvDBDSN, "postgres://user:pass@db/pi_teacher")
	t.Setenv(EnvListen, ":4321")

	cfg, err := Parse(nil)
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	if cfg.DBDriver != DriverPostgres {
		t.Fatalf("DBDriver = %q, want %q", cfg.DBDriver, DriverPostgres)
	}
	if cfg.DBDSN != "postgres://user:pass@db/pi_teacher" {
		t.Fatalf("DBDSN = %q", cfg.DBDSN)
	}
	if cfg.Listen != ":4321" {
		t.Fatalf("Listen = %q, want :4321", cfg.Listen)
	}
}

func TestParseFlagsOverrideEnvironment(t *testing.T) {
	clearConfigEnv(t)
	t.Setenv(EnvDBDriver, DriverPostgres)
	t.Setenv(EnvDBDSN, "postgres://from-env")
	t.Setenv(EnvListen, ":4321")

	cfg, err := Parse([]string{
		"--db-driver", DriverMySQL,
		"--db-dsn", "mysql-from-flag",
		"--listen", ":9876",
	})
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	if cfg.DBDriver != DriverMySQL {
		t.Fatalf("DBDriver = %q, want %q", cfg.DBDriver, DriverMySQL)
	}
	if cfg.DBDSN != "mysql-from-flag" {
		t.Fatalf("DBDSN = %q, want mysql-from-flag", cfg.DBDSN)
	}
	if cfg.Listen != ":9876" {
		t.Fatalf("Listen = %q, want :9876", cfg.Listen)
	}
}

func TestParseDefaultListen(t *testing.T) {
	clearConfigEnv(t)
	t.Setenv(EnvDBDSN, "./data/pi-teacher.db")

	cfg, err := Parse(nil)
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	if cfg.DBDriver != DriverSQLite {
		t.Fatalf("DBDriver = %q, want %q", cfg.DBDriver, DriverSQLite)
	}
	if cfg.Listen != DefaultListen {
		t.Fatalf("Listen = %q, want %q", cfg.Listen, DefaultListen)
	}
}

func TestParseRequiresDSNWithoutFlagOrEnvironment(t *testing.T) {
	clearConfigEnv(t)
	if _, err := Parse(nil); err == nil {
		t.Fatal("Parse() error = nil, want missing DSN error")
	}
}
