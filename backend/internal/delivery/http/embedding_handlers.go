package httpapi

import (
	"net/http"

	"github.com/Pi-Teacher/server/internal/application/apperr"
	"github.com/Pi-Teacher/server/internal/application/appsvc"
)

// --- Embedding 配置与重建 ---

// embeddingConfigResponse 是配置端点响应体.
type embeddingConfigResponse struct {
	BaseURL                   string `json:"base_url"`
	APIKey                    string `json:"api_key"`
	Model                     string `json:"model"`
	Dimensions                int64  `json:"dimensions"`
	TimeoutSeconds            int64  `json:"timeout_seconds"`
	WorkerBatchSize           int64  `json:"worker_batch_size"`
	SimilarityMinReadyPercent int64  `json:"similarity_min_ready_percent"`
}

// patchEmbeddingConfigRequest 是配置修改请求体, 字段全部可选.
type patchEmbeddingConfigRequest struct {
	BaseURL                   *string `json:"base_url"`
	APIKey                    *string `json:"api_key"`
	Model                     *string `json:"model"`
	Dimensions                *int64  `json:"dimensions"`
	TimeoutSeconds            *int64  `json:"timeout_seconds"`
	WorkerBatchSize           *int64  `json:"worker_batch_size"`
	SimilarityMinReadyPercent *int64  `json:"similarity_min_ready_percent"`
}

// embeddingCoverageResponse 是覆盖率响应体, 字段名与 check/status 统一.
type embeddingCoverageResponse struct {
	TotalEnabled int64   `json:"total_enabled"`
	Ready        int64   `json:"ready"`
	Pending      int64   `json:"pending"`
	Processing   int64   `json:"processing"`
	Failed       int64   `json:"failed"`
	ReadyPercent float64 `json:"ready_percent"`
}

// embeddingStatusResponse 是状态端点响应体.
type embeddingStatusResponse struct {
	Rebuilding        bool                      `json:"rebuilding"`
	SimilarityEnabled bool                      `json:"similarity_enabled"`
	Coverage          embeddingCoverageResponse `json:"coverage"`
}

// embeddingTestResponse 是探测端点响应体. 失败仍为 200, 用 ok 表达.
type embeddingTestResponse struct {
	OK         bool   `json:"ok"`
	Dimensions int    `json:"dimensions,omitempty"`
	Error      string `json:"error,omitempty"`
}

// embeddingConfigToResponse 把服务视图转为响应体.
func embeddingConfigToResponse(c appsvc.EmbeddingConfig) embeddingConfigResponse {
	return embeddingConfigResponse{
		BaseURL:                   c.BaseURL,
		APIKey:                    c.APIKey,
		Model:                     c.Model,
		Dimensions:                c.Dimensions,
		TimeoutSeconds:            c.TimeoutSeconds,
		WorkerBatchSize:           c.WorkerBatchSize,
		SimilarityMinReadyPercent: c.SimilarityMinReadyPercent,
	}
}

// embeddingCoverageToResponse 把覆盖率视图转为响应体.
func embeddingCoverageToResponse(c appsvc.EmbeddingCoverageInfo) embeddingCoverageResponse {
	return embeddingCoverageResponse{
		TotalEnabled: c.TotalEnabled,
		Ready:        c.Ready,
		Pending:      c.Pending,
		Processing:   c.Processing,
		Failed:       c.Failed,
		ReadyPercent: c.ReadyPercent,
	}
}

// handleGetEmbeddingConfig 实现 GET /api/web/embedding/config.
func (s *Server) handleGetEmbeddingConfig(w http.ResponseWriter, r *http.Request) {
	if s.Embedding == nil {
		writeError(w, apperr.New(apperr.CodeInternal, "embedding 服务未启用"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"config": embeddingConfigToResponse(s.Embedding.Config()),
	})
}

// handlePatchEmbeddingConfig 实现 PATCH /api/web/embedding/config.
// 重建进行中禁止修改任何字段 (含最低覆盖率与批次大小), 返回 409.
func (s *Server) handlePatchEmbeddingConfig(w http.ResponseWriter, r *http.Request) {
	if s.Embedding == nil {
		writeError(w, apperr.New(apperr.CodeInternal, "embedding 服务未启用"))
		return
	}
	var req patchEmbeddingConfigRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	patch := appsvc.EmbeddingConfigPatch{
		BaseURL:                   req.BaseURL,
		APIKey:                    req.APIKey,
		Model:                     req.Model,
		Dimensions:                req.Dimensions,
		TimeoutSeconds:            req.TimeoutSeconds,
		WorkerBatchSize:           req.WorkerBatchSize,
		SimilarityMinReadyPercent: req.SimilarityMinReadyPercent,
	}
	if err := s.Embedding.PatchConfig(r.Context(), patch); err != nil {
		writeError(w, err)
		return
	}
	s.logEntityEvent(r, "embedding_config_updated", "embedding", 0)
	writeJSON(w, http.StatusOK, map[string]any{
		"config": embeddingConfigToResponse(s.Embedding.Config()),
	})
}

// handleEmbeddingStatus 实现 GET /api/web/embedding/status.
func (s *Server) handleEmbeddingStatus(w http.ResponseWriter, r *http.Request) {
	if s.Embedding == nil {
		writeError(w, apperr.New(apperr.CodeInternal, "embedding 服务未启用"))
		return
	}
	status, err := s.Embedding.Status(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, embeddingStatusResponse{
		Rebuilding:        status.Rebuilding,
		SimilarityEnabled: status.SimilarityEnabled,
		Coverage:          embeddingCoverageToResponse(status.Coverage),
	})
}

// handleEmbeddingTest 实现 POST /api/web/embedding/test.
// 探测失败是业务失败, 仍返回 200 + ok=false.
func (s *Server) handleEmbeddingTest(w http.ResponseWriter, r *http.Request) {
	if s.Embedding == nil {
		writeError(w, apperr.New(apperr.CodeInternal, "embedding 服务未启用"))
		return
	}
	dimensions, err := s.Embedding.Test(r.Context())
	if err != nil {
		writeJSON(w, http.StatusOK, embeddingTestResponse{OK: false, Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, embeddingTestResponse{OK: true, Dimensions: dimensions})
}

// handleEmbeddingRebuild 实现 POST /api/web/embedding/rebuild: 清空全部
// 启用卡向量并重置为 pending, 提交后唤醒 worker. 已在重建中返回 409.
func (s *Server) handleEmbeddingRebuild(w http.ResponseWriter, r *http.Request) {
	if s.Embedding == nil {
		writeError(w, apperr.New(apperr.CodeInternal, "embedding 服务未启用"))
		return
	}
	if err := s.Embedding.Rebuild(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	s.logEntityEvent(r, "embedding_rebuild_started", "embedding", 0)
	writeJSON(w, http.StatusAccepted, map[string]any{"status": "rebuilding"})
}

// handleEmbeddingRetryFailed 实现 POST /api/web/embedding/retry-failed:
// 仅 failed 卡改回 pending, 不清 ready 向量. 无失败项直接成功.
func (s *Server) handleEmbeddingRetryFailed(w http.ResponseWriter, r *http.Request) {
	if s.Embedding == nil {
		writeError(w, apperr.New(apperr.CodeInternal, "embedding 服务未启用"))
		return
	}
	if err := s.Embedding.RetryFailed(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	s.logEntityEvent(r, "embedding_retry_failed", "embedding", 0)
	writeJSON(w, http.StatusAccepted, map[string]any{"status": "accepted"})
}

// --- 查重 ---

// checkCardRequest 是查重请求体. top_k 缺省 5, 上限 50.
type checkCardRequest struct {
	Front           string `json:"front"`
	EnableEmbedding *bool  `json:"enable_embedding"`
	TopK            *int   `json:"top_k"`
}

// checkMatchResponse 是查重候选响应体. exact 分支无 similarity.
type checkMatchResponse struct {
	ID         int64    `json:"id"`
	Front      string   `json:"front"`
	Back       string   `json:"back"`
	TopicID    *int64   `json:"topic_id"`
	Similarity *float64 `json:"similarity,omitempty"`
}

// checkCardResponse 是查重响应体. coverage 只在语义分支出现.
type checkCardResponse struct {
	MatchType string                     `json:"match_type"`
	Coverage  *embeddingCoverageResponse `json:"coverage,omitempty"`
	Matches   []checkMatchResponse       `json:"matches"`
}

// handleCheckCard 实现 POST /api/{web,cli}/cards/check.
// 只读 dry-run: 不创建 Card, 不产审批, 永不进审批队列.
func (s *Server) handleCheckCard(w http.ResponseWriter, r *http.Request) {
	if s.Embedding == nil {
		writeError(w, apperr.New(apperr.CodeInternal, "embedding 服务未启用"))
		return
	}
	var req checkCardRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	topK := 0
	if req.TopK != nil {
		if *req.TopK <= 0 {
			writeError(w, validationFieldError("top_k", "必须是正整数"))
			return
		}
		topK = *req.TopK
	}
	result, err := s.Embedding.Check(r.Context(), appsvc.CheckInput{
		Front:           req.Front,
		EnableEmbedding: req.EnableEmbedding == nil || *req.EnableEmbedding,
		TopK:            topK,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	matches := make([]checkMatchResponse, 0, len(result.Matches))
	for i := range result.Matches {
		m := result.Matches[i]
		matches = append(matches, checkMatchResponse{
			ID: m.ID, Front: m.Front, Back: m.Back, TopicID: m.TopicID, Similarity: m.Similarity,
		})
	}
	resp := checkCardResponse{MatchType: result.MatchType, Matches: matches}
	if result.Coverage != nil {
		coverage := embeddingCoverageToResponse(*result.Coverage)
		resp.Coverage = &coverage
	}
	writeJSON(w, http.StatusOK, resp)
}
