package httpapi

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/Pi-Teacher/server/internal/application/apperr"
	"github.com/Pi-Teacher/server/internal/platform/version"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// mcpToolResult 是所有 MCP 工具的统一出参: CLI 链路返回什么 JSON,
// payload 就是什么 JSON, 另附 HTTP 状态码供 LLM 理解写入结果.
// 写操作在审批开关开启时 payload 为提案对象 (approval/approvals),
// 关闭时为直写结果; 因此 outputSchema 用宽泛描述而不锁定形状.
type mcpToolResult struct {
	Status  int `json:"status" jsonschema:"等价 HTTP 端点状态码"`
	Payload any `json:"payload" jsonschema:"等价端点的 JSON 响应体"`
}

// newMCPToolResult 从捕获的 CLI 响应构造工具结果.
// 空响应体归一为 {}, 保证 payload 始终是对象, 与出参 schema 一致.
func newMCPToolResult(status int, body []byte) mcpToolResult {
	payload := json.RawMessage("{}")
	if len(bytes.TrimSpace(body)) > 0 {
		payload = json.RawMessage(body)
	}
	return mcpToolResult{Status: status, Payload: payload}
}

// newMCPRandomKey 生成未显式提供幂等键时使用的随机键.
// 随机键保证每次调用都是独立请求, 不触发幂等重放.
func newMCPRandomKey() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		// 随机源失效时退化为时间戳, 仍然几乎不可能重复.
		return strconv.FormatInt(time.Now().UnixNano(), 10)
	}
	return hex.EncodeToString(b[:])
}

// mcpCLIExecutor 把 MCP 工具调用合成为对 CLI 路由链的内部 HTTP 请求.
// 工具端点零独立业务逻辑: 认证, 审批分流, 幂等, 锁顺序全部复用 CLI 实现.
type mcpCLIExecutor struct {
	server *Server
	// handler 是 CLI 路由所在的根 mux. 合成请求带 Bearer 头,
	// 会完整经过 requireCLIAPIKey 与各资源的幂等/审批中间件.
	handler http.Handler
}

// executeCLICall 合成并发送一次内部 CLI 请求.
// method/path 是 CLI 命名空间下的路径 (如 POST /api/cli/topics);
// query 为查询参数 (可为 nil); body 为请求体 (可为 nil);
// authorization 是触发工具调用的原始 Authorization 头值 (含 Bearer 前缀),
// 原样透传让 requireCLIAPIKey 完整校验; idemKey 为幂等键.
// 返回捕获的状态码与响应体. 协议层错误 (认证/路由失败) 返回错误.
func (e *mcpCLIExecutor) executeCLICall(
	ctx context.Context,
	authorization string,
	method, path string,
	query map[string]string,
	body any,
	idemKey string,
) (int, []byte, error) {
	var bodyReader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return 0, nil, apperr.Wrap(apperr.CodeInternal, "MCP 请求体序列化失败", err)
		}
		bodyReader = bytes.NewReader(encoded)
	} else if method != http.MethodGet {
		// CLI 写链路要求非空 JSON 体, 空体在 decodeJSON 处会报校验错误;
		// 统一补空对象, 让校验错误语义与直连 CLI 一致.
		bodyReader = bytes.NewReader([]byte("{}"))
	}

	req, err := http.NewRequestWithContext(ctx, method, "http://mcp.local"+path, bodyReader)
	if err != nil {
		return 0, nil, apperr.Wrap(apperr.CodeInternal, "MCP 内部请求构造失败", err)
	}
	if body != nil || method != http.MethodGet {
		req.Header.Set("Content-Type", "application/json")
	}
	if query != nil {
		q := req.URL.Query()
		for k, v := range query {
			q.Set(k, v)
		}
		req.URL.RawQuery = q.Encode()
	}
	// 认证复用 requireCLIAPIKey: 透传原始 Authorization 头,
	// 由它重新校验并注入 apiKey 到 context.
	req.Header.Set("Authorization", authorization)
	if idemKey != "" {
		req.Header.Set("Idempotency-Key", "mcp:"+idemKey)
	}

	rec := &bufferedResponse{header: make(http.Header)}
	e.handler.ServeHTTP(rec, req)
	return rec.statusOrOK(), rec.body.Bytes(), nil
}

// callCLITool 是工具 handler 的公共落点: 发送合成请求并把结果包装为
// mcpToolResult. 业务失败不返回 Go error, 而是原样透传状态码与错误信封,
// 让 LLM 在 payload 中看到错误详情并自我修正.
func (s *Server) callCLITool(
	ctx context.Context,
	extraHeader http.Header,
	method, path string,
	query map[string]string,
	body any,
	idemKey string,
) (*mcp.CallToolResult, mcpToolResult, error) {
	token := ""
	if extraHeader != nil {
		token = extraHeader.Get("Authorization")
	}
	// 到达工具 handler 的请求必然已过 requireCLIAPIKey, 此处必为 Bearer 头;
	// 防御性检查避免中间件重构后静默退化为匿名调用.
	if token == "" {
		return nil, mcpToolResult{}, fmt.Errorf("MCP 请求缺少认证信息")
	}
	status, respBody, err := s.mcpExecutor.executeCLICall(ctx, token, method, path, query, body, idemKey)
	if err != nil {
		return nil, mcpToolResult{}, err
	}
	result := newMCPToolResult(status, respBody)
	// 4xx/5xx 标记为工具级错误, 客户端可据此提示重试或修正参数.
	if status >= 400 {
		return &mcp.CallToolResult{IsError: true}, result, nil
	}
	return nil, result, nil
}

// --- MCP Server 组装 ---

// newMCPServer 构造 MCP 协议服务器并注册全部工具.
// 工具目录见 mcp_tools.go; 协议层 (initialize/tools/list/tools/call)
// 由官方 go-sdk 提供.
//
// Instructions 是写给模型看的行为指引: 只说明覆盖面, 使用时机,
// 以及写操作的两个非直觉行为. 不复制 REST 文档里的状态码与错误信封说明.
func (s *Server) newMCPServer() *mcp.Server {
	server := mcp.NewServer(&mcp.Implementation{
		Name:    "pi-teacher",
		Version: version.Version,
	}, &mcp.ServerOptions{
		Instructions: "pi-teacher: 知识卡片管理与间隔复习服务, 按 FSRS 安排复习, " +
			"结合用户画像 (user_profile) 实现长期记忆与定制化学习.\n\n" +
			"制卡或辅助复习前先读 user_profile, 按用户背景组织例子和解释; " +
			"了解到新的背景或偏好时可更新它. 当用户想整理知识、查询卡片或术语、" +
			"维护学习偏好、提交复习评分时使用. 永久删除、审批、改设置等管理操作" +
			"不在这里, 引导用户到 Web 界面完成.\n\n" +
			"写操作可能返回 approval 字段, 表示已进审批队列而未生效: " +
			"告知用户去 Web 审批, 不要重复提交. 修改与回收需先读到对象当前的 " +
			"version, 作为 expected_version 传入.",
	})
	s.registerMCPTools(server)
	return server
}

// requireMCPAuth 是 /api/mcp 专属认证: 在 requireCLIAPIKey 之前处理
// URL 参数 apikey. 部分 MCP 客户端不便配置自定义请求头, 因此额外
// 支持 http://host/api/mcp?apikey=ptk_... 形式.
//
// 优先级: URL 参数存在时覆盖 Authorization 头 (即使参数无效也不回落,
// 避免凭据歧义); 否则按 CLI 语义使用 Bearer 头.
//
// 认证前把参数规范化为 Authorization 头并从 URL 移除 apikey:
// 一方面工具调用合成内部 CLI 请求时凭据链路不变, 另一方面
// 避免明文凭据进入访问日志与错误信息.
func (s *Server) requireMCPAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if key := r.URL.Query().Get("apikey"); key != "" {
			q := r.URL.Query()
			q.Del("apikey")
			r.URL.RawQuery = q.Encode()
			r.Header.Set("Authorization", "Bearer "+key)
		}
		s.requireCLIAPIKey(next).ServeHTTP(w, r)
	})
}

// mcpHTTPHandler 构造 /api/mcp 的 Streamable HTTP handler.
// 认证走 requireMCPAuth (URL apikey 参数优先, 回落 Bearer 头),
// 与 CLI 命名空间同一把 API Key.
// Stateless 模式: 每个请求独立处理, 无会话状态, GET/DELETE 返回 405.
// JSONResponse 避免为简单请求-响应场景引入 SSE 流.
func (s *Server) mcpHTTPHandler() http.Handler {
	return s.requireMCPAuth(mcp.NewStreamableHTTPHandler(func(r *http.Request) *mcp.Server {
		return s.newMCPServer()
	}, &mcp.StreamableHTTPOptions{
		Stateless:    true,
		JSONResponse: true,
	}))
}

// callToolHeader 提取触发工具调用的原始 HTTP 请求头.
func callToolHeader(req *mcp.CallToolRequest) http.Header {
	if req == nil || req.Extra == nil {
		return nil
	}
	return req.Extra.Header
}
