package repo

import (
	"context"

	"gorm.io/gorm"

	"github.com/Pi-Teacher/server/internal/infrastructure/persistence/model"
)

// AppLogFilter 是 app_log 列表的筛选条件, 值由 HTTP 层校验后传入.
// 三个字段都是精确相等匹配, 空串表示不过滤.
type AppLogFilter struct {
	// Level 是日志级别名 (debug|info|warn|error), 空表示全部.
	Level string
	// Event 是稳定事件名, 空表示全部.
	Event string
	// RequestID 是请求关联 ID, 空表示全部.
	RequestID string
}

// AppLogRepository 查询 app_log 记录, 供 WebUI 日志查看器使用.
// app_log 只读不在此仓库修改: 写入由 logging sink 与 AppLogWriter 负责,
// 裁剪由 AppLogWriter.PruneAppLogs 负责.
type AppLogRepository struct {
	db *gorm.DB
}

// NewAppLogRepository 构造日志查询仓库.
func NewAppLogRepository(db *gorm.DB) *AppLogRepository {
	return &AppLogRepository{db: db}
}

// appLogLevelValue 把级别名映射为数据库枚举值, 未知名回退 debug.
// 调用方 (服务层) 已保证取值合法, 这里只作防御.
func appLogLevelValue(name string) int16 {
	switch name {
	case "debug":
		return model.LogDebug
	case "warn":
		return model.LogWarn
	case "error":
		return model.LogError
	default:
		return model.LogInfo
	}
}

// List 按筛选条件返回日志分页, 按 logged_at 降序, 并列时按 id 降序,
// 保证 offset 分页稳定. 返回的 total 是筛选后的总行数.
func (r *AppLogRepository) List(ctx context.Context, f AppLogFilter, offset, limit int) ([]model.AppLog, int64, error) {
	q := r.db.WithContext(ctx).Model(&model.AppLog{})
	if f.Level != "" {
		q = q.Where("level = ?", appLogLevelValue(f.Level))
	}
	if f.Event != "" {
		q = q.Where("event = ?", f.Event)
	}
	if f.RequestID != "" {
		q = q.Where("request_id = ?", f.RequestID)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	rows := make([]model.AppLog, 0, limit)
	if err := q.Order("logged_at DESC, id DESC").
		Offset(offset).Limit(limit).
		Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}
