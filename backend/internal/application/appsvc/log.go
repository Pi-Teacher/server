package appsvc

import (
	"context"

	"github.com/Pi-Teacher/server/internal/application/apperr"
	"github.com/Pi-Teacher/server/internal/infrastructure/persistence/model"
	"github.com/Pi-Teacher/server/internal/infrastructure/persistence/repo"
)

// LogService 提供 app_log 的筛选分页查询, 只读.
// app_log 写入由 logging sink 负责, 裁剪由 AppLogWriter 负责, 本服务不修改数据.
type LogService struct {
	logs *repo.AppLogRepository
}

// NewLogService 构造日志查询服务.
func NewLogService(logs *repo.AppLogRepository) *LogService {
	return &LogService{logs: logs}
}

// 允许的日志级别名, 与 model 枚举一一对应.
var validLogLevels = map[string]int16{
	"debug": model.LogDebug,
	"info":  model.LogInfo,
	"warn":  model.LogWarn,
	"error": model.LogError,
}

// LogFilter 是已校验的日志查询条件.
type LogFilter struct {
	Level     string
	Event     string
	RequestID string
}

// List 返回筛选后的日志分页. level 取值非法返回 400, 其余为精确匹配.
func (s *LogService) List(ctx context.Context, f LogFilter, page, pageSize int) ([]model.AppLog, int64, error) {
	if f.Level != "" {
		if _, ok := validLogLevels[f.Level]; !ok {
			return nil, 0, apperr.Validation("level 取值必须是 debug|info|warn|error").
				WithDetails(map[string]any{"field": "level"})
		}
	}
	offset := (page - 1) * pageSize
	return s.logs.List(ctx, repo.AppLogFilter{
		Level:     f.Level,
		Event:     f.Event,
		RequestID: f.RequestID,
	}, offset, pageSize)
}
