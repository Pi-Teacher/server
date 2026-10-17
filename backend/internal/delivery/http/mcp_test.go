package httpapi_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

// mcpClient 是测试用的最小 MCP Streamable HTTP 客户端:
// 每个 POST 一条 JSON-RPC 消息, Stateless 模式下响应为单个 JSON 对象.
type mcpClient struct {
	t *testing.T
	// baseURL 是不含凭据的端点根 URL.
	baseURL string
	// apiKey 为 Bearer 头凭据, urlAPIKey 为 URL apikey 参数凭据,
	// 两者可同时设置以测试优先级.
	apiKey    string
	urlAPIKey string
}

// endpoint 返回实际请求 URL: urlAPIKey 非空时以查询参数附加.
func (c *mcpClient) endpoint() string {
	if c.urlAPIKey == "" {
		return c.baseURL + "/api/mcp"
	}
	return c.baseURL + "/api/mcp?apikey=" + c.urlAPIKey
}

// call 发送一条 JSON-RPC 请求并解析响应.
func (c *mcpClient) call(method string, params any) map[string]any {
	c.t.Helper()
	body := map[string]any{"jsonrpc": "2.0", "id": 1, "method": method}
	if params != nil {
		body["params"] = params
	}
	encoded, err := json.Marshal(body)
	if err != nil {
		c.t.Fatal(err)
	}
	req, err := http.NewRequest(http.MethodPost, c.endpoint(), bytes.NewReader(encoded))
	if err != nil {
		c.t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		c.t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		c.t.Fatalf("mcp %s status = %d, body = %s", method, resp.StatusCode, raw)
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		c.t.Fatalf("mcp %s response is not json: %s", method, raw)
	}
	if e, ok := out["error"].(map[string]any); ok {
		c.t.Fatalf("mcp %s jsonrpc error: %v", method, e)
	}
	return out
}

// callRawHTTP 发送 JSON-RPC 请求并返回原始 HTTP 响应, 用于断言状态码.
// 调用方负责关闭响应体.
func (c *mcpClient) callRawHTTP(method string, params any) *http.Response {
	c.t.Helper()
	body := map[string]any{"jsonrpc": "2.0", "id": 1, "method": method}
	if params != nil {
		body["params"] = params
	}
	encoded, _ := json.Marshal(body)
	req, _ := http.NewRequest(http.MethodPost, c.endpoint(), bytes.NewReader(encoded))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	return resp
}

// toolNames 从 tools/list 结果提取工具名集合.
func toolNames(c map[string]any) map[string]bool {
	result, _ := c["result"].(map[string]any)
	tools, _ := result["tools"].([]any)
	names := make(map[string]bool, len(tools))
	for _, t := range tools {
		tool, _ := t.(map[string]any)
		if name, ok := tool["name"].(string); ok {
			names[name] = true
		}
	}
	return names
}

// callToolPayload 调用工具并返回 {status, payload}.
func (c *mcpClient) callToolPayload(name string, args map[string]any) (float64, any) {
	c.t.Helper()
	resp := c.call("tools/call", map[string]any{
		"name":      name,
		"arguments": args,
	})
	result, _ := resp["result"].(map[string]any)
	if result == nil {
		c.t.Fatalf("tools/call %s missing result: %v", name, resp)
	}
	if isErr, _ := result["isError"].(bool); isErr {
		c.t.Fatalf("tools/call %s isError: %v", name, result)
	}
	structured, _ := result["structuredContent"].(map[string]any)
	if structured == nil {
		c.t.Fatalf("tools/call %s missing structuredContent: %v", name, result)
	}
	status, _ := structured["status"].(float64)
	return status, structured["payload"]
}

// callRaw 发送 JSON-RPC 请求, 返回原始响应 map, 不对错误做断言.
func (c *mcpClient) callRaw(method string, params any) map[string]any {
	c.t.Helper()
	body := map[string]any{"jsonrpc": "2.0", "id": 1, "method": method}
	if params != nil {
		body["params"] = params
	}
	encoded, _ := json.Marshal(body)
	req, _ := http.NewRequest(http.MethodPost, c.endpoint(), bytes.NewReader(encoded))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		c.t.Fatalf("mcp %s status = %d", method, resp.StatusCode)
	}
	var out map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		c.t.Fatalf("mcp %s response is not json", method)
	}
	return out
}

// TestMCPToolCatalogSchema 校验工具目录的 schema 质量:
// 三态字段类型正确, 批量 items 不泄露 MCP 专属字段, annotations 正确.
func TestMCPToolCatalogSchema(t *testing.T) {
	ts := newTestServer(t)
	cli := ts.newCLIClient(t)
	client := &mcpClient{t: t, baseURL: ts.srv.URL, apiKey: cli.apiKey}

	resp := client.call("tools/list", nil)
	result, _ := resp["result"].(map[string]any)
	rawTools, _ := result["tools"].([]any)
	tools := make(map[string]map[string]any, len(rawTools))
	for _, rt := range rawTools {
		tool, _ := rt.(map[string]any)
		name, _ := tool["name"].(string)
		tools[name] = tool
	}

	propSchema := func(toolName, prop string) map[string]any {
		t.Helper()
		schema, _ := tools[toolName]["inputSchema"].(map[string]any)
		props, _ := schema["properties"].(map[string]any)
		p, _ := props[prop].(map[string]any)
		if p == nil {
			t.Fatalf("%s 缺少属性 %s", toolName, prop)
		}
		return p
	}

	// 1. 顶层三态 topic_id 保留描述且类型为 integer|null.
	for _, toolName := range []string{"card_update", "card_merge"} {
		p := propSchema(toolName, "topic_id")
		if desc, _ := p["description"].(string); desc == "" {
			t.Errorf("%s.topic_id 丢失描述", toolName)
		}
		b, _ := json.Marshal(p)
		if !strings.Contains(string(b), "integer") || !strings.Contains(string(b), "null") {
			t.Errorf("%s.topic_id schema = %s, want integer|null", toolName, b)
		}
	}

	// 2. 创建/恢复类 topic_id 是普通可空整数 (非三态).
	for _, toolName := range []string{"card_create", "trash_card_restore"} {
		b, _ := json.Marshal(propSchema(toolName, "topic_id"))
		if strings.Contains(string(b), "array") {
			t.Errorf("%s.topic_id 仍被推导为数组: %s", toolName, b)
		}
	}

	// 3. 批量工具的 items 元素不含 idempotency_key, 且嵌套 topic_id 类型正确.
	for _, toolName := range []string{"card_batch_create", "glossary_batch_create", "topic_batch_create", "card_batch_trash"} {
		items := propSchema(toolName, "items")
		elem, _ := items["items"].(map[string]any)
		if elem == nil {
			t.Fatalf("%s.items 缺少元素 schema", toolName)
		}
		elemProps, _ := elem["properties"].(map[string]any)
		if _, ok := elemProps["idempotency_key"]; ok {
			t.Errorf("%s.items 元素不应包含 idempotency_key", toolName)
		}
		if topicID, ok := elemProps["topic_id"].(map[string]any); ok {
			b, _ := json.Marshal(topicID)
			if strings.Contains(string(b), "array") {
				t.Errorf("%s.items[].topic_id 被推导为数组: %s", toolName, b)
			}
		}
	}

	// 4. annotations: 读工具 readOnlyHint, 回收类 destructiveHint.
	annotations := func(toolName string) map[string]any {
		a, _ := tools[toolName]["annotations"].(map[string]any)
		return a
	}
	for _, toolName := range []string{"topic_list", "card_get", "system_info", "review_due"} {
		if annotations(toolName)["readOnlyHint"] != true {
			t.Errorf("%s 应标记 readOnlyHint", toolName)
		}
	}
	for _, toolName := range []string{"card_trash", "topic_trash", "card_merge", "glossary_batch_trash"} {
		if annotations(toolName)["destructiveHint"] != true {
			t.Errorf("%s 应标记 destructiveHint", toolName)
		}
	}
	if annotations("card_create")["destructiveHint"] == true {
		t.Error("card_create 是新增操作, 不应标记 destructiveHint")
	}

	// 5. 出参 schema: payload 是对象, status 是整数.
	output, _ := tools["topic_list"]["outputSchema"].(map[string]any)
	outProps, _ := output["properties"].(map[string]any)
	payload, _ := outProps["payload"].(map[string]any)
	if payload["type"] != "object" {
		t.Errorf("出参 payload type = %v, want object", payload["type"])
	}
	status, _ := outProps["status"].(map[string]any)
	if status["type"] != "integer" {
		t.Errorf("出参 status type = %v, want integer", status["type"])
	}
}

// TestMCPProtocolBasics 验证 MCP 端点的协议层行为:
// 认证, initialize 握手, tools/list 目录与 tools/call 调用.
func TestMCPProtocolBasics(t *testing.T) {
	ts := newTestServer(t)

	// 1. 未认证请求被拒绝.
	unauth := &mcpClient{t: t, baseURL: ts.srv.URL}
	body := map[string]any{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
	encoded, _ := json.Marshal(body)
	resp, err := http.Post(ts.srv.URL+"/api/mcp", "application/json", bytes.NewReader(encoded))
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("unauthenticated mcp status = %d, want 401", resp.StatusCode)
	}
	_ = unauth

	// 2. GET/DELETE 在 Stateless 模式下返回 405.
	cli := ts.newCLIClient(t)
	client := &mcpClient{t: t, baseURL: ts.srv.URL, apiKey: cli.apiKey}
	for _, method := range []string{http.MethodGet, http.MethodDelete} {
		req, _ := http.NewRequest(method, ts.srv.URL+"/api/mcp", nil)
		req.Header.Set("Authorization", "Bearer "+cli.apiKey)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusMethodNotAllowed {
			t.Fatalf("mcp %s status = %d, want 405", method, resp.StatusCode)
		}
	}

	// 3. initialize 握手返回 serverInfo.
	init := client.call("initialize", map[string]any{
		"protocolVersion": "2025-06-18",
		"capabilities":    map[string]any{},
		"clientInfo":      map[string]any{"name": "test", "version": "1"},
	})
	serverInfo, _ := init["result"].(map[string]any)["serverInfo"].(map[string]any)
	if serverInfo["name"] != "pi-teacher" {
		t.Fatalf("serverInfo.name = %v, want pi-teacher", serverInfo["name"])
	}

	// 4. tools/list 返回完整工具目录, 含入参 schema.
	list := client.call("tools/list", nil)
	names := toolNames(list)
	wantTools := []string{
		"topic_list", "topic_get", "topic_create", "topic_update", "topic_trash",
		"topic_batch_create", "topic_batch_trash",
		"card_list", "card_get", "card_create", "card_update", "card_trash",
		"card_batch_create", "card_batch_trash", "card_merge", "card_check",
		"glossary_list", "glossary_get", "glossary_create", "glossary_update",
		"glossary_trash", "glossary_batch_create", "glossary_batch_trash",
		"trash_cards_list", "trash_topics_list", "trash_glossary_list",
		"trash_card_restore", "trash_topic_restore", "trash_glossary_restore",
		"review_due", "review_submit", "user_profile_get", "user_profile_update",
		"approvals_list", "approval_get", "system_info",
	}
	for _, name := range wantTools {
		if !names[name] {
			t.Errorf("tools/list missing tool %q (have %v)", name, names)
		}
	}
	// 工具数量恰好等于目录清单, 防止意外重复注册.
	if len(names) != len(wantTools) {
		t.Errorf("tools/list returned %d tools, want %d: %v", len(names), len(wantTools), names)
	}
	// 抽查 card_update 的 topic_id schema 是 integer|null 而非字节数组.
	result, _ := list["result"].(map[string]any)
	tools, _ := result["tools"].([]any)
	for _, tt := range tools {
		tool, _ := tt.(map[string]any)
		if tool["name"] != "card_update" {
			continue
		}
		schema, _ := tool["inputSchema"].(map[string]any)
		props, _ := schema["properties"].(map[string]any)
		topicSchema, _ := props["topic_id"].(map[string]any)
		b, _ := json.Marshal(topicSchema)
		if !strings.Contains(string(b), "integer") {
			t.Fatalf("card_update topic_id schema = %s, want integer|null", b)
		}
	}

	// 5. 只读工具调用: system_info.
	status, payload := client.callToolPayload("system_info", map[string]any{})
	if status != 200 {
		t.Fatalf("system_info status = %v, want 200", status)
	}
	info, _ := payload.(map[string]any)
	if info["db_driver"] != ts.driver {
		t.Fatalf("system_info db_driver = %v, want %s", info["db_driver"], ts.driver)
	}

	// 6. 写工具在默认审批开关下走提案: topic_create 返回 202 + approval.
	status, payload = client.callToolPayload("topic_create", map[string]any{
		"name": "MCP Topic", "idempotency_key": "mcp-test-1",
	})
	if status != 202 {
		t.Fatalf("topic_create status = %v, want 202", status)
	}
	proposal, _ := payload.(map[string]any)
	approval, _ := proposal["approval"].(map[string]any)
	if approval["status"] != "pending" {
		t.Fatalf("topic_create approval.status = %v, want pending", approval["status"])
	}
	approvalID, _ := approval["id"].(float64)
	if approvalID <= 0 {
		t.Fatalf("topic_create approval.id = %v", approval["id"])
	}

	// 7. 同幂等键重试重放首次结果, 不产生第二个提案.
	status, payload = client.callToolPayload("topic_create", map[string]any{
		"name": "MCP Topic", "idempotency_key": "mcp-test-1",
	})
	if status != 202 {
		t.Fatalf("topic_create replay status = %v, want 202", status)
	}
	replay, _ := payload.(map[string]any)
	replayApproval, _ := replay["approval"].(map[string]any)
	if replayApproval["id"].(float64) != approvalID {
		t.Fatalf("topic_create replay approval.id = %v, want %v", replayApproval["id"], approvalID)
	}

	// 8. 工具返回的提案在 CLI 侧可见, 证明两者共享同一审批队列.
	cliResp := cli.do(http.MethodGet, "/api/cli/approvals?status=pending", nil, "")
	if cliResp.StatusCode != http.StatusOK {
		t.Fatalf("cli approvals status = %d", cliResp.StatusCode)
	}
	var cliList struct {
		Items []struct {
			ID     int64  `json:"id"`
			Status string `json:"status"`
		} `json:"items"`
	}
	decodeBody(t, cliResp, &cliList)
	if len(cliList.Items) != 1 || cliList.Items[0].ID != int64(approvalID) {
		t.Fatalf("cli approvals = %+v, want 1 item with id %v", cliList.Items, approvalID)
	}

	// 9. 关闭审批开关后 MCP 直写生效 (开关与 CLI 完全共享).
	csrf := ts.login()
	disableCLIApprovals(t, ts, csrf)
	status, payload = client.callToolPayload("topic_create", map[string]any{
		"name": "MCP Direct Topic", "idempotency_key": "mcp-test-2",
	})
	if status != 201 {
		t.Fatalf("topic_create direct status = %v, want 201", status)
	}
	created, _ := payload.(map[string]any)
	if created["name"] != "MCP Direct Topic" {
		t.Fatalf("topic_create direct payload = %v", payload)
	}

	// 10. 缺少必填参数被 MCP 层 schema 校验拦截, 返回 isError 的工具结果.
	// (参数校验在协议层完成, 未透传到 CLI; 同样保护了后端.)
	invalidResp := client.call("tools/call", map[string]any{
		"name": "topic_create", "arguments": map[string]any{"idempotency_key": "mcp-test-3"},
	})
	invalidResult, _ := invalidResp["result"].(map[string]any)
	if invalidResult == nil || invalidResult["isError"] != true {
		t.Fatalf("invalid topic_create should be isError, got %v", invalidResp)
	}

	// 10b. CLI 层校验错误透传: 评分取值非法, 返回带字段名的错误信封.
	invalidRating := client.call("tools/call", map[string]any{
		"name": "review_submit",
		"arguments": map[string]any{
			"card_id": 1, "rating": "invalid", "expected_card_version": 1, "expected_schedule_version": 1,
		},
	})
	irResult, _ := invalidRating["result"].(map[string]any)
	irStructured, _ := irResult["structuredContent"].(map[string]any)
	if irResult == nil || irResult["isError"] != true || irStructured["status"] != 400.0 {
		t.Fatalf("review_submit invalid rating should be 400 isError, got %v", invalidRating)
	}
	irPayload, _ := irStructured["payload"].(map[string]any)
	irError, _ := irPayload["error"].(map[string]any)
	if irError["code"] != "validation_error" {
		t.Fatalf("review_submit error code = %v, want validation_error", irError["code"])
	}

	// 11. 不存在的工具返回 JSON-RPC 错误 (-32602).
	errResp := client.callRaw("tools/call", map[string]any{
		"name": "nonexistent_tool", "arguments": map[string]any{},
	})
	errObj, ok := errResp["error"].(map[string]any)
	if !ok {
		t.Fatalf("tools/call unknown tool should return jsonrpc error, got %v", errResp)
	}
	if code, _ := errObj["code"].(float64); code == 0 {
		t.Fatalf("tools/call unknown tool error code = %v", errObj)
	}

	// 12. URL apikey 参数认证: 优先于 Authorization 头.
	// 12a. 仅 URL 参数即可认证成功.
	urlClient := &mcpClient{t: t, baseURL: ts.srv.URL, urlAPIKey: cli.apiKey}
	initResp := urlClient.call("initialize", map[string]any{
		"protocolVersion": "2025-06-18",
		"capabilities":    map[string]any{},
		"clientInfo":      map[string]any{"name": "url-auth", "version": "1"},
	})
	if _, ok := initResp["result"]; !ok {
		t.Fatalf("url apikey auth should succeed, got %v", initResp)
	}

	// 12b. URL 参数存在时覆盖 Header: 无效 URL key + 有效 Header key => 401,
	// 证明 URL 优先且不回落到 Header.
	badURLClient := &mcpClient{t: t, baseURL: ts.srv.URL, urlAPIKey: "ptk_invalid", apiKey: cli.apiKey}
	badResp := badURLClient.callRawHTTP("initialize", map[string]any{
		"protocolVersion": "2025-06-18",
		"capabilities":    map[string]any{},
		"clientInfo":      map[string]any{"name": "bad-url", "version": "1"},
	})
	defer badResp.Body.Close()
	if badResp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("invalid url apikey with valid header status = %d, want 401", badResp.StatusCode)
	}

	// 12c. URL 参数有效 + Header 无效 => 200, 证明 URL 参数真正生效.
	mixedClient := &mcpClient{t: t, baseURL: ts.srv.URL, urlAPIKey: cli.apiKey, apiKey: "ptk_invalid"}
	mixedResp := mixedClient.call("tools/list", nil)
	if _, ok := mixedResp["result"]; !ok {
		t.Fatalf("valid url apikey with invalid header should succeed, got %v", mixedResp)
	}

	// 13. URL 参数与 Header 均无凭据 => 401.
	anonClient := &mcpClient{t: t, baseURL: ts.srv.URL}
	anonResp := anonClient.callRawHTTP("tools/list", nil)
	defer anonResp.Body.Close()
	if anonResp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("no credentials status = %d, want 401", anonResp.StatusCode)
	}
}
