package httpapi

import (
	"net/http"

	"github.com/Pi-Teacher/server/internal/application/apperr"
)

// userProfileResponse 是用户画像端点的响应体.
type userProfileResponse struct {
	Profile string `json:"profile"`
	Version int64  `json:"version"`
}

// putUserProfileRequest 是更新画像的请求体.
// 两个字段都必填: profile 允许空字符串但不能缺省 (用指针区分缺省与空串),
// expected_version=0 合法 (首次写入), 但字段本身必须出现.
type putUserProfileRequest struct {
	Profile         *string `json:"profile"`
	ExpectedVersion *int64  `json:"expected_version"`
}

// handleGetUserProfile 实现 GET /api/{web,cli}/user-profile.
func (s *Server) handleGetUserProfile(w http.ResponseWriter, r *http.Request) {
	profile, err := s.UserProfile.Get(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, userProfileResponse{
		Profile: profile.Profile,
		Version: profile.Version,
	})
}

// handlePutUserProfile 实现 PUT /api/{web,cli}/user-profile.
// 版本不一致返回 409 version_conflict, details.current_version 携带当前值.
func (s *Server) handlePutUserProfile(w http.ResponseWriter, r *http.Request) {
	var req putUserProfileRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	if req.Profile == nil {
		writeError(w, apperr.Validation("profile 不能缺省").
			WithDetails(map[string]any{"field": "profile"}))
		return
	}
	if req.ExpectedVersion == nil {
		writeError(w, apperr.Validation("expected_version 不能缺省").
			WithDetails(map[string]any{"field": "expected_version"}))
		return
	}
	updated, err := s.UserProfile.Update(r.Context(), *req.ExpectedVersion, *req.Profile)
	if err != nil {
		writeError(w, err)
		return
	}
	// 画像不是知识库对象, entity_id 用 0: 它只有一行, 无独立 ID.
	s.logEntityEvent(r, "user_profile_updated", "user_profile", 0)
	writeJSON(w, http.StatusOK, userProfileResponse{
		Profile: updated.Profile,
		Version: updated.Version,
	})
}
