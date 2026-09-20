package httpapi

import (
	"net/http"
	"time"

	"github.com/Pi-Teacher/server/internal/application/appsvc"
	"github.com/Pi-Teacher/server/internal/infrastructure/persistence/model"
)

// appLogResponse 是 GET /api/web/logs 的单条日志响应.
// source 与 entity_type 由整型枚举映射为字符串, 无值时输出 null.
type appLogResponse struct {
	ID         int64   `json:"id"`
	LoggedAt   string  `json:"logged_at"`
	Level      string  `json:"level"`
	Event      string  `json:"event"`
	Message    string  `json:"message"`
	RequestID  *string `json:"request_id"`
	Source     *string `json:"source"`
	EntityType *string `json:"entity_type"`
	EntityID   *int64  `json:"entity_id"`
	Details    *string `json:"details"`
}

// logLevelText 把数据库级别枚举映射为响应字符串.
func logLevelText(level int16) string {
	switch level {
	case model.LogDebug:
		return "debug"
	case model.LogWarn:
		return "warn"
	case model.LogError:
		return "error"
	default:
		return "info"
	}
}

// logSourceText 把来源枚举映射为响应字符串, 未知或空值返回 nil.
func logSourceText(v *int16) *string {
	if v == nil {
		return nil
	}
	var s string
	switch *v {
	case model.SourceWeb:
		s = "web"
	case model.SourceCLI:
		s = "cli"
	case model.SourceWorker:
		s = "worker"
	case model.SourceAdmin:
		s = "admin"
	case model.SourceSystem:
		s = "system"
	default:
		return nil
	}
	return &s
}

// logEntityTypeText 把对象类型枚举映射为响应字符串, 未知或空值返回 nil.
func logEntityTypeText(v *int16) *string {
	if v == nil {
		return nil
	}
	var s string
	switch *v {
	case model.EntityTopic:
		s = "topic"
	case model.EntityCard:
		s = "card"
	case model.EntityGlossary:
		s = "glossary"
	default:
		return nil
	}
	return &s
}

// appLogToResponse 把日志行转为响应体, 时间统一 RFC3339 UTC.
func appLogToResponse(row model.AppLog) appLogResponse {
	return appLogResponse{
		ID:         row.ID,
		LoggedAt:   row.LoggedAt.UTC().Format(time.RFC3339),
		Level:      logLevelText(row.Level),
		Event:      row.Event,
		Message:    row.Message,
		RequestID:  row.RequestID,
		Source:     logSourceText(row.Source),
		EntityType: logEntityTypeText(row.EntityType),
		EntityID:   row.EntityID,
		Details:    row.Details,
	}
}

// handleListLogs 实现 GET /api/web/logs.
// 参数 level/event/request_id 为精确匹配, 非法 level 由服务层报 400.
func (s *Server) handleListLogs(w http.ResponseWriter, r *http.Request) {
	page, pageSize := parsePaging(r)
	rows, total, err := s.Logs.List(r.Context(), appsvc.LogFilter{
		Level:     r.URL.Query().Get("level"),
		Event:     r.URL.Query().Get("event"),
		RequestID: r.URL.Query().Get("request_id"),
	}, page, pageSize)
	if err != nil {
		writeError(w, err)
		return
	}
	items := make([]appLogResponse, 0, len(rows))
	for _, row := range rows {
		items = append(items, appLogToResponse(row))
	}
	writeJSON(w, http.StatusOK, pageResponse[appLogResponse]{
		Items: items, Total: total, Page: page, PageSize: pageSize,
	})
}
