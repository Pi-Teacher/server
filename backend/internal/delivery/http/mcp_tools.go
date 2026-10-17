package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"reflect"
	"strconv"

	"github.com/google/jsonschema-go/jsonschema"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// MCP 工具目录: 每个 CLI 端点对应一个工具, 命名 snake_case.
// 工具入参是 CLI 请求体的镜像 (字段名与语义一致), 出参统一为
// mcpToolResult: status 是 HTTP 状态码, payload 是 CLI 响应 JSON 原文.
// 写工具带可选 idempotency_key: 同一 Key 重试会重放首次结果;
// 不提供时使用随机键, 每次调用视为独立请求.

// --- 公共入参辅助 ---

// idempotencyField 统一的幂等键入参, 各写工具结构体内嵌使用.
// 完整语义写在 Server Instructions 里, 字段描述保持简短以节省 tools/list 体积.
type idempotencyField struct {
	// IdempotencyKey 用于写请求重试: 同一 Key 同一参数只生效一次并重放首次结果.
	IdempotencyKey string `json:"idempotency_key,omitempty" jsonschema:"可选幂等键, 用于安全重试"`
}

// --- Topic 工具入参 ---

type mcpListTopicsIn struct {
	Q        string `json:"q,omitempty" jsonschema:"按名称模糊搜索的关键字"`
	Page     int    `json:"page,omitempty" jsonschema:"页码, 从 1 开始, 缺省 1"`
	PageSize int    `json:"page_size,omitempty" jsonschema:"每页数量, 1-100, 缺省 20"`
}

type mcpGetTopicIn struct {
	ID int64 `json:"id" jsonschema:"Topic id"`
}

type mcpCreateTopicIn struct {
	idempotencyField
	Name        string `json:"name" jsonschema:"Topic 名称, 必填"`
	Description string `json:"description,omitempty" jsonschema:"Topic 描述"`
}

type mcpUpdateTopicIn struct {
	idempotencyField
	ID              int64   `json:"id" jsonschema:"Topic id"`
	ExpectedVersion int64   `json:"expected_version" jsonschema:"乐观锁期望版本, 必填"`
	Name            *string `json:"name,omitempty" jsonschema:"新名称, 省略表示不修改"`
	Description     *string `json:"description,omitempty" jsonschema:"新描述, 省略表示不修改"`
}

type mcpTrashTopicIn struct {
	idempotencyField
	ID              int64 `json:"id" jsonschema:"Topic id"`
	ExpectedVersion int64 `json:"expected_version" jsonschema:"乐观锁期望版本"`
	IncludeCards    *bool `json:"include_cards,omitempty" jsonschema:"是否连同 Card 一起回收, 缺省 false"`
}

type mcpTopicItem struct {
	ID              int64 `json:"id" jsonschema:"Topic id"`
	ExpectedVersion int64 `json:"expected_version" jsonschema:"乐观锁期望版本"`
}

type mcpBatchTrashTopicsIn struct {
	idempotencyField
	Items        []mcpTopicItem `json:"items" jsonschema:"要回收的 Topic 列表"`
	IncludeCards *bool          `json:"include_cards,omitempty" jsonschema:"是否连同 Card 一起回收"`
}

// mcpTopicCreateItem 是批量创建 Topic 的单项.
// 不含 idempotency_key: 幂等键属于整个批量请求, 由外层提供.
type mcpTopicCreateItem struct {
	Name        string `json:"name" jsonschema:"Topic 名称, 必填"`
	Description string `json:"description,omitempty" jsonschema:"Topic 描述"`
}

type mcpBatchCreateTopicsIn struct {
	idempotencyField
	Items []mcpTopicCreateItem `json:"items" jsonschema:"要创建的 Topic 列表, 至少一项"`
}

// --- Card 工具入参 ---

type mcpListCardsIn struct {
	Q               string `json:"q,omitempty" jsonschema:"按正面/背面内容搜索的关键字"`
	TopicID         *int64 `json:"topic_id,omitempty" jsonschema:"按 Topic 过滤, 0 表示无 Topic 的 Card"`
	EmbeddingStatus string `json:"embedding_status,omitempty" jsonschema:"按向量状态过滤: pending/processing/ready/failed/disabled"`
	Sort            string `json:"sort,omitempty" jsonschema:"排序字段: created_at/updated_at, 缺省 created_at"`
	Order           string `json:"order,omitempty" jsonschema:"排序方向: asc/desc, 缺省 desc"`
	Page            int    `json:"page,omitempty" jsonschema:"页码, 从 1 开始, 缺省 1"`
	PageSize        int    `json:"page_size,omitempty" jsonschema:"每页数量, 1-100, 缺省 20"`
}

type mcpGetCardIn struct {
	ID int64 `json:"id" jsonschema:"Card id"`
}

type mcpCreateCardIn struct {
	idempotencyField
	TopicID         *int64 `json:"topic_id,omitempty" jsonschema:"所属 Topic id, 省略为无 Topic"`
	Front           string `json:"front" jsonschema:"正面内容, 必填"`
	Back            string `json:"back" jsonschema:"背面内容, 必填"`
	EnableEmbedding *bool  `json:"enable_embedding,omitempty" jsonschema:"是否生成语义向量, 缺省 true"`
}

// mcpCardCreateItem 是批量创建 Card 的单项.
// topic_id 用 *int64 而非三态类型: 创建场景下省略与 null 语义相同 (无 Topic).
type mcpCardCreateItem struct {
	TopicID         *int64 `json:"topic_id,omitempty" jsonschema:"所属 Topic id, 省略为无 Topic"`
	Front           string `json:"front" jsonschema:"正面内容, 必填"`
	Back            string `json:"back" jsonschema:"背面内容, 必填"`
	EnableEmbedding *bool  `json:"enable_embedding,omitempty" jsonschema:"是否生成语义向量, 缺省 true"`
}

type mcpUpdateCardIn struct {
	idempotencyField
	ID              int64           `json:"id" jsonschema:"Card id"`
	ExpectedVersion int64           `json:"expected_version" jsonschema:"乐观锁期望版本, 必填"`
	TopicID         json.RawMessage `json:"topic_id,omitempty" jsonschema:"目标 Topic: 省略不修改, null 移出 Topic, 数字指定 Topic"`
	Front           *string         `json:"front,omitempty" jsonschema:"新正面内容"`
	Back            *string         `json:"back,omitempty" jsonschema:"新背面内容"`
	EnableEmbedding *bool           `json:"enable_embedding,omitempty" jsonschema:"是否生成语义向量"`
}

type mcpCardItem struct {
	ID              int64 `json:"id" jsonschema:"Card id"`
	ExpectedVersion int64 `json:"expected_version" jsonschema:"乐观锁期望版本"`
}

// mcpTrashCardIn 是回收单个 Card 的入参.
type mcpTrashCardIn struct {
	idempotencyField
	ID              int64 `json:"id" jsonschema:"Card id"`
	ExpectedVersion int64 `json:"expected_version" jsonschema:"乐观锁期望版本"`
}

type mcpBatchCreateCardsIn struct {
	idempotencyField
	Items []mcpCardCreateItem `json:"items" jsonschema:"要创建的 Card 列表, 至少一项"`
}

type mcpBatchTrashCardsIn struct {
	idempotencyField
	Items []mcpCardItem `json:"items" jsonschema:"要回收的 Card 列表, 至少一项"`
}

type mcpMergeCardsIn struct {
	idempotencyField
	SourceCardIDs   []int64         `json:"source_card_ids" jsonschema:"要合并的两张来源 Card id, 必填"`
	Front           *string         `json:"front,omitempty" jsonschema:"合并后正面内容, 缺省按 Q1/Q2 拼接"`
	Back            *string         `json:"back,omitempty" jsonschema:"合并后背面内容, 缺省按 Q1/Q2 拼接"`
	TopicID         json.RawMessage `json:"topic_id,omitempty" jsonschema:"目标 Topic: 省略继承来源卡, null 无 Topic, 数字指定"`
	EnableEmbedding *bool           `json:"enable_embedding,omitempty" jsonschema:"是否生成语义向量, 缺省继承来源卡"`
}

type mcpCheckCardIn struct {
	Front           string `json:"front" jsonschema:"要查重的正面内容, 必填"`
	EnableEmbedding *bool  `json:"enable_embedding,omitempty" jsonschema:"生成后是否建立向量, 缺省 true"`
	TopK            int    `json:"top_k,omitempty" jsonschema:"返回候选数量, 缺省 5, 上限 50"`
}

// --- Glossary 工具入参 ---

type mcpListGlossaryIn struct {
	Q        string `json:"q,omitempty" jsonschema:"按术语搜索的关键字"`
	Page     int    `json:"page,omitempty" jsonschema:"页码, 从 1 开始, 缺省 1"`
	PageSize int    `json:"page_size,omitempty" jsonschema:"每页数量, 1-100, 缺省 20"`
}

type mcpGetGlossaryIn struct {
	ID int64 `json:"id" jsonschema:"Glossary 词条 id"`
}

type mcpCreateGlossaryIn struct {
	idempotencyField
	Term       string `json:"term" jsonschema:"术语, 必填"`
	Definition string `json:"definition" jsonschema:"释义, 必填"`
}

type mcpUpdateGlossaryIn struct {
	idempotencyField
	ID              int64   `json:"id" jsonschema:"词条 id"`
	ExpectedVersion int64   `json:"expected_version" jsonschema:"乐观锁期望版本"`
	Term            *string `json:"term,omitempty" jsonschema:"新术语"`
	Definition      *string `json:"definition,omitempty" jsonschema:"新释义"`
}

type mcpTrashGlossaryIn struct {
	idempotencyField
	ID              int64 `json:"id" jsonschema:"词条 id"`
	ExpectedVersion int64 `json:"expected_version" jsonschema:"乐观锁期望版本"`
}

// mcpGlossaryCreateItem 是批量创建词条的单项.
// 不含 idempotency_key: 幂等键属于整个批量请求, 由外层提供.
type mcpGlossaryCreateItem struct {
	Term       string `json:"term" jsonschema:"术语, 必填"`
	Definition string `json:"definition" jsonschema:"释义, 必填"`
}

type mcpBatchCreateGlossaryIn struct {
	idempotencyField
	Items []mcpGlossaryCreateItem `json:"items" jsonschema:"要创建的词条列表, 至少一项"`
}

type mcpGlossaryItem struct {
	ID              int64 `json:"id" jsonschema:"词条 id"`
	ExpectedVersion int64 `json:"expected_version" jsonschema:"乐观锁期望版本"`
}

type mcpBatchTrashGlossaryIn struct {
	idempotencyField
	Items []mcpGlossaryItem `json:"items" jsonschema:"要回收的词条列表, 至少一项"`
}

// --- 回收站 工具入参 ---

type mcpListTrashIn struct {
	Page     int `json:"page,omitempty" jsonschema:"页码, 从 1 开始, 缺省 1"`
	PageSize int `json:"page_size,omitempty" jsonschema:"每页数量, 1-100, 缺省 20"`
}

type mcpRestoreCardIn struct {
	idempotencyField
	ID              int64  `json:"id" jsonschema:"回收站 Card id"`
	ExpectedVersion int64  `json:"expected_version" jsonschema:"乐观锁期望版本"`
	TopicID         *int64 `json:"topic_id,omitempty" jsonschema:"恢复到的目标 Topic id, 省略恢复为无 Topic"`
}

type mcpRestoreTopicIn struct {
	idempotencyField
	ID              int64 `json:"id" jsonschema:"回收站 Topic id"`
	ExpectedVersion int64 `json:"expected_version" jsonschema:"乐观锁期望版本"`
}

type mcpRestoreGlossaryIn struct {
	idempotencyField
	ID              int64 `json:"id" jsonschema:"回收站词条 id"`
	ExpectedVersion int64 `json:"expected_version" jsonschema:"乐观锁期望版本"`
}

// --- 复习 工具入参 ---

type mcpReviewDueIn struct {
	TopicID *int64 `json:"topic_id,omitempty" jsonschema:"按 Topic 过滤, 0 表示无 Topic"`
	Limit   int    `json:"limit,omitempty" jsonschema:"返回数量上限, 正整数"`
}

type mcpReviewSubmitIn struct {
	idempotencyField
	CardID                  int64  `json:"card_id" jsonschema:"Card id"`
	Rating                  string `json:"rating" jsonschema:"评分: again/hard/good/easy"`
	ExpectedCardVersion     int64  `json:"expected_card_version" jsonschema:"Card 乐观锁期望版本"`
	ExpectedScheduleVersion int64  `json:"expected_schedule_version" jsonschema:"调度乐观锁期望版本"`
}

// --- 用户画像 工具入参 ---

type mcpGetUserProfileIn struct{}

type mcpUpdateUserProfileIn struct {
	idempotencyField
	Profile         string `json:"profile" jsonschema:"完整画像文本, 允许空字符串, 但不能省略"`
	ExpectedVersion int64  `json:"expected_version" jsonschema:"乐观锁期望版本, 首次写入传 0"`
}

// --- 审批 工具入参 ---

type mcpListApprovalsIn struct {
	Status   string `json:"status,omitempty" jsonschema:"按状态过滤: pending/approved/rejected, 缺省全部"`
	Page     int    `json:"page,omitempty" jsonschema:"页码, 从 1 开始, 缺省 1"`
	PageSize int    `json:"page_size,omitempty" jsonschema:"每页数量, 1-100, 缺省 20"`
}

type mcpGetApprovalIn struct {
	ID int64 `json:"id" jsonschema:"审批单 id"`
}

// --- 系统信息 工具入参 ---

type mcpSystemInfoIn struct{}

// --- 工具注册 ---

// nullableIntSchema 描述三态整数字段 (如 topic_id) 的 JSON Schema:
// 整数或 null. json.RawMessage 会被推导成字节数组, 必须手动覆盖.
var nullableIntSchema = &jsonschema.Schema{
	AnyOf: []*jsonschema.Schema{{Type: "integer"}, {Type: "null"}},
}

// updateCardInputSchema / mergeCardsInputSchema 覆盖三态 topic_id:
// 省略不改, null 清除, 数字指定.
var (
	updateCardInputSchema = overrideSchema[mcpUpdateCardIn](
		map[string]*jsonschema.Schema{"topic_id": nullableIntSchema})
	mergeCardsInputSchema = overrideSchema[mcpMergeCardsIn](
		map[string]*jsonschema.Schema{"topic_id": nullableIntSchema})
)

// mcpToolOutputSchema 是所有工具共用的出参 schema:
// payload 是 CLI 响应信封 (成功为业务对象, 失败为 error 对象).
var mcpToolOutputSchema = func() *jsonschema.Schema {
	sch, err := jsonschema.ForType(reflect.TypeFor[mcpToolResult](), &jsonschema.ForOptions{})
	if err != nil {
		panic("mcp output schema: " + err.Error())
	}
	sch.Properties["payload"] = &jsonschema.Schema{
		Type:        "object",
		Description: "等价 CLI 端点的响应体",
	}
	return sch
}()

// overrideSchema 生成入参类型的 schema 并覆盖指定属性.
// 覆盖仅替换类型定义, 源 tag 的描述会被保留, 避免 LLM 丢失字段语义.
// forType 每工具只调用一次 (注册期), 性能不敏感.
func overrideSchema[T any](overrides map[string]*jsonschema.Schema) *jsonschema.Schema {
	sch, err := jsonschema.ForType(reflect.TypeFor[T](), &jsonschema.ForOptions{})
	if err != nil {
		// 注册期失败属于程序缺陷, 直接 panic 让测试第一时间暴露.
		panic("mcp schema: " + err.Error())
	}
	for name, s := range overrides {
		original, ok := sch.Properties[name]
		if !ok {
			panic("mcp schema: 覆盖了不存在的属性 " + name)
		}
		// 拷贝后再改写: 覆盖 schema 可能是多个工具共享的全局变量.
		merged := *s
		if merged.Description == "" && original != nil {
			merged.Description = original.Description
		}
		sch.Properties[name] = &merged
	}
	return sch
}

// registerMCPTools 向 MCP server 注册全部工具.
// 每个工具的 handler 只做三件事: 组装 CLI 请求参数, 调用 callCLITool,
// 透传结果. 业务规则一律在 CLI 链路里执行.
func (s *Server) registerMCPTools(server *mcp.Server) {
	s.registerMCPReadTools(server)
	s.registerMCPWriteTools(server)
}

// registerMCPReadTools 注册只读工具 (GET 端点), 不带幂等键.
func (s *Server) registerMCPReadTools(server *mcp.Server) {
	mcp.AddTool(server, readTool("topic_list", "分页列出 Topic, 可按名称搜索."),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpListTopicsIn) (*mcp.CallToolResult, mcpToolResult, error) {
			query := listQuery(in.Page, in.PageSize, map[string]string{"q": in.Q})
			return s.callRead(ctx, callToolHeader(req), "/api/cli/topics", query)
		})

	mcp.AddTool(server, readTool("topic_get", "按 id 获取 Topic 详情."),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpGetTopicIn) (*mcp.CallToolResult, mcpToolResult, error) {
			return s.callRead(ctx, callToolHeader(req), "/api/cli/topics/"+strconv.FormatInt(in.ID, 10), nil)
		})

	mcp.AddTool(server, readTool("card_list", "分页列出 Card, 支持按内容搜索/Topic/向量状态过滤与排序."),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpListCardsIn) (*mcp.CallToolResult, mcpToolResult, error) {
			extra := map[string]string{
				"q": in.Q, "embedding_status": in.EmbeddingStatus,
				"sort": in.Sort, "order": in.Order,
			}
			if in.TopicID != nil {
				extra["topic_id"] = strconv.FormatInt(*in.TopicID, 10)
			}
			query := listQuery(in.Page, in.PageSize, extra)
			return s.callRead(ctx, callToolHeader(req), "/api/cli/cards", query)
		})

	mcp.AddTool(server, readTool("card_get", "按 id 获取 Card 详情 (含 FSRS 调度快照)."),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpGetCardIn) (*mcp.CallToolResult, mcpToolResult, error) {
			return s.callRead(ctx, callToolHeader(req), "/api/cli/cards/"+strconv.FormatInt(in.ID, 10), nil)
		})

	mcp.AddTool(server, readTool("card_check", "查重 dry-run: 检查正面内容与已有 Card 的重复度, 不创建数据."),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpCheckCardIn) (*mcp.CallToolResult, mcpToolResult, error) {
			// check 是只读 dry-run, 走 CLI 幂等链路但不产审批.
			return s.callWrite(ctx, callToolHeader(req), http.MethodPost, "/api/cli/cards/check", toolBody(in), "")
		})

	mcp.AddTool(server, readTool("glossary_list", "分页列出 Glossary 词条, 可按术语搜索."),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpListGlossaryIn) (*mcp.CallToolResult, mcpToolResult, error) {
			query := listQuery(in.Page, in.PageSize, map[string]string{"q": in.Q})
			return s.callRead(ctx, callToolHeader(req), "/api/cli/glossary", query)
		})

	mcp.AddTool(server, readTool("glossary_get", "按 id 获取 Glossary 词条详情."),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpGetGlossaryIn) (*mcp.CallToolResult, mcpToolResult, error) {
			return s.callRead(ctx, callToolHeader(req), "/api/cli/glossary/"+strconv.FormatInt(in.ID, 10), nil)
		})

	mcp.AddTool(server, readTool("trash_cards_list", "分页列出回收站中的 Card."),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpListTrashIn) (*mcp.CallToolResult, mcpToolResult, error) {
			return s.callRead(ctx, callToolHeader(req), "/api/cli/trash/cards", listQuery(in.Page, in.PageSize, nil))
		})

	mcp.AddTool(server, readTool("trash_topics_list", "分页列出回收站中的 Topic."),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpListTrashIn) (*mcp.CallToolResult, mcpToolResult, error) {
			return s.callRead(ctx, callToolHeader(req), "/api/cli/trash/topics", listQuery(in.Page, in.PageSize, nil))
		})

	mcp.AddTool(server, readTool("trash_glossary_list", "分页列出回收站中的 Glossary 词条."),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpListTrashIn) (*mcp.CallToolResult, mcpToolResult, error) {
			return s.callRead(ctx, callToolHeader(req), "/api/cli/trash/glossary", listQuery(in.Page, in.PageSize, nil))
		})

	mcp.AddTool(server, readTool("review_due", "列出当前到期的复习卡片."),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpReviewDueIn) (*mcp.CallToolResult, mcpToolResult, error) {
			extra := map[string]string{}
			if in.TopicID != nil {
				extra["topic_id"] = strconv.FormatInt(*in.TopicID, 10)
			}
			if in.Limit > 0 {
				extra["limit"] = strconv.Itoa(in.Limit)
			}
			return s.callRead(ctx, callToolHeader(req), "/api/cli/review/due", extra)
		})

	mcp.AddTool(server, readTool("user_profile_get", "获取用户画像文本."),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpGetUserProfileIn) (*mcp.CallToolResult, mcpToolResult, error) {
			return s.callRead(ctx, callToolHeader(req), "/api/cli/user-profile", nil)
		})

	mcp.AddTool(server, readTool("approvals_list", "分页列出本 API Key 提交的审批提案, 可按状态过滤."),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpListApprovalsIn) (*mcp.CallToolResult, mcpToolResult, error) {
			query := listQuery(in.Page, in.PageSize, map[string]string{"status": in.Status})
			return s.callRead(ctx, callToolHeader(req), "/api/cli/approvals", query)
		})

	mcp.AddTool(server, readTool("approval_get", "按 id 获取本人提交的审批提案详情 (含 targets)."),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpGetApprovalIn) (*mcp.CallToolResult, mcpToolResult, error) {
			return s.callRead(ctx, callToolHeader(req), "/api/cli/approvals/"+strconv.FormatInt(in.ID, 10), nil)
		})

	mcp.AddTool(server, readTool("system_info", "获取服务版本与运行状态."),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpSystemInfoIn) (*mcp.CallToolResult, mcpToolResult, error) {
			return s.callRead(ctx, callToolHeader(req), "/api/cli/system/info", nil)
		})
}

// registerMCPWriteTools 注册写工具 (POST/PATCH/PUT 端点), 全部带幂等键.
func (s *Server) registerMCPWriteTools(server *mcp.Server) {
	// --- Topic 写 ---
	mcp.AddTool(server, writeTool("topic_create", "创建 Topic."),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpCreateTopicIn) (*mcp.CallToolResult, mcpToolResult, error) {
			return s.callWrite(ctx, callToolHeader(req), http.MethodPost, "/api/cli/topics", toolBody(in), idemKeyOf(in.idempotencyField))
		})

	mcp.AddTool(server, writeTool("topic_update", "修改 Topic 名称或描述."),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpUpdateTopicIn) (*mcp.CallToolResult, mcpToolResult, error) {
			return s.callWrite(ctx, callToolHeader(req), http.MethodPatch, "/api/cli/topics/"+strconv.FormatInt(in.ID, 10), entityBody(in), idemKeyOf(in.idempotencyField))
		})

	mcp.AddTool(server, destructiveTool("topic_trash", "把 Topic 移入回收站."),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpTrashTopicIn) (*mcp.CallToolResult, mcpToolResult, error) {
			return s.callWrite(ctx, callToolHeader(req), http.MethodPost, "/api/cli/topics/"+strconv.FormatInt(in.ID, 10)+"/trash", entityBody(in), idemKeyOf(in.idempotencyField))
		})

	mcp.AddTool(server, writeTool("topic_batch_create", "批量创建 Topic."),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpBatchCreateTopicsIn) (*mcp.CallToolResult, mcpToolResult, error) {
			return s.callWrite(ctx, callToolHeader(req), http.MethodPost, "/api/cli/topics/batch-create", batchBody(in.Items), idemKeyOf(in.idempotencyField))
		})

	mcp.AddTool(server, destructiveTool("topic_batch_trash", "批量回收 Topic."),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpBatchTrashTopicsIn) (*mcp.CallToolResult, mcpToolResult, error) {
			return s.callWrite(ctx, callToolHeader(req), http.MethodPost, "/api/cli/topics/batch-trash", toolBody(in), idemKeyOf(in.idempotencyField))
		})

	// --- Card 写 ---
	mcp.AddTool(server, writeTool("card_create", "创建 Card."),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpCreateCardIn) (*mcp.CallToolResult, mcpToolResult, error) {
			return s.callWrite(ctx, callToolHeader(req), http.MethodPost, "/api/cli/cards", toolBody(in), idemKeyOf(in.idempotencyField))
		})

	mcp.AddTool(server, toolWithInput(writeTool("card_update", "修改 Card 内容或所属 Topic."), updateCardInputSchema),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpUpdateCardIn) (*mcp.CallToolResult, mcpToolResult, error) {
			return s.callWrite(ctx, callToolHeader(req), http.MethodPatch, "/api/cli/cards/"+strconv.FormatInt(in.ID, 10), entityBody(in), idemKeyOf(in.idempotencyField))
		})

	mcp.AddTool(server, destructiveTool("card_trash", "把 Card 移入回收站."),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpTrashCardIn) (*mcp.CallToolResult, mcpToolResult, error) {
			return s.callWrite(ctx, callToolHeader(req), http.MethodPost, "/api/cli/cards/"+strconv.FormatInt(in.ID, 10)+"/trash", entityBody(in), idemKeyOf(in.idempotencyField))
		})

	mcp.AddTool(server, writeTool("card_batch_create", "批量创建 Card."),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpBatchCreateCardsIn) (*mcp.CallToolResult, mcpToolResult, error) {
			return s.callWrite(ctx, callToolHeader(req), http.MethodPost, "/api/cli/cards/batch-create", batchBody(in.Items), idemKeyOf(in.idempotencyField))
		})

	mcp.AddTool(server, destructiveTool("card_batch_trash", "批量回收 Card."),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpBatchTrashCardsIn) (*mcp.CallToolResult, mcpToolResult, error) {
			return s.callWrite(ctx, callToolHeader(req), http.MethodPost, "/api/cli/cards/batch-trash", toolBody(in), idemKeyOf(in.idempotencyField))
		})

	mcp.AddTool(server, toolWithInput(destructiveTool("card_merge", "合并两张来源 Card 为新卡, 来源卡进回收站."), mergeCardsInputSchema),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpMergeCardsIn) (*mcp.CallToolResult, mcpToolResult, error) {
			return s.callWrite(ctx, callToolHeader(req), http.MethodPost, "/api/cli/cards/merge", toolBody(in), idemKeyOf(in.idempotencyField))
		})

	// --- Glossary 写 ---
	mcp.AddTool(server, writeTool("glossary_create", "创建 Glossary 词条."),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpCreateGlossaryIn) (*mcp.CallToolResult, mcpToolResult, error) {
			return s.callWrite(ctx, callToolHeader(req), http.MethodPost, "/api/cli/glossary", toolBody(in), idemKeyOf(in.idempotencyField))
		})

	mcp.AddTool(server, writeTool("glossary_update", "修改 Glossary 词条."),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpUpdateGlossaryIn) (*mcp.CallToolResult, mcpToolResult, error) {
			return s.callWrite(ctx, callToolHeader(req), http.MethodPatch, "/api/cli/glossary/"+strconv.FormatInt(in.ID, 10), entityBody(in), idemKeyOf(in.idempotencyField))
		})

	mcp.AddTool(server, destructiveTool("glossary_trash", "把 Glossary 词条移入回收站."),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpTrashGlossaryIn) (*mcp.CallToolResult, mcpToolResult, error) {
			return s.callWrite(ctx, callToolHeader(req), http.MethodPost, "/api/cli/glossary/"+strconv.FormatInt(in.ID, 10)+"/trash", entityBody(in), idemKeyOf(in.idempotencyField))
		})

	mcp.AddTool(server, writeTool("glossary_batch_create", "批量创建 Glossary 词条."),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpBatchCreateGlossaryIn) (*mcp.CallToolResult, mcpToolResult, error) {
			return s.callWrite(ctx, callToolHeader(req), http.MethodPost, "/api/cli/glossary/batch-create", batchBody(in.Items), idemKeyOf(in.idempotencyField))
		})

	mcp.AddTool(server, destructiveTool("glossary_batch_trash", "批量回收 Glossary 词条."),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpBatchTrashGlossaryIn) (*mcp.CallToolResult, mcpToolResult, error) {
			return s.callWrite(ctx, callToolHeader(req), http.MethodPost, "/api/cli/glossary/batch-trash", toolBody(in), idemKeyOf(in.idempotencyField))
		})

	// --- 回收站恢复 ---
	mcp.AddTool(server, writeTool("trash_card_restore", "从回收站恢复 Card."),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpRestoreCardIn) (*mcp.CallToolResult, mcpToolResult, error) {
			return s.callWrite(ctx, callToolHeader(req), http.MethodPost, "/api/cli/trash/cards/"+strconv.FormatInt(in.ID, 10)+"/restore", entityBody(in), idemKeyOf(in.idempotencyField))
		})

	mcp.AddTool(server, writeTool("trash_topic_restore", "从回收站恢复 Topic."),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpRestoreTopicIn) (*mcp.CallToolResult, mcpToolResult, error) {
			return s.callWrite(ctx, callToolHeader(req), http.MethodPost, "/api/cli/trash/topics/"+strconv.FormatInt(in.ID, 10)+"/restore", entityBody(in), idemKeyOf(in.idempotencyField))
		})

	mcp.AddTool(server, writeTool("trash_glossary_restore", "从回收站恢复 Glossary 词条."),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpRestoreGlossaryIn) (*mcp.CallToolResult, mcpToolResult, error) {
			return s.callWrite(ctx, callToolHeader(req), http.MethodPost, "/api/cli/trash/glossary/"+strconv.FormatInt(in.ID, 10)+"/restore", entityBody(in), idemKeyOf(in.idempotencyField))
		})

	// --- 复习提交 ---
	mcp.AddTool(server, writeTool("review_submit", "提交一次复习评分. 复习操作不走审批, 直接生效."),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpReviewSubmitIn) (*mcp.CallToolResult, mcpToolResult, error) {
			return s.callWrite(ctx, callToolHeader(req), http.MethodPost, "/api/cli/review/"+strconv.FormatInt(in.CardID, 10)+"/submit", entityBody(in), idemKeyOf(in.idempotencyField))
		})

	// --- 用户画像 ---
	mcp.AddTool(server, writeTool("user_profile_update", "整体更新用户画像文本."),
		func(ctx context.Context, req *mcp.CallToolRequest, in mcpUpdateUserProfileIn) (*mcp.CallToolResult, mcpToolResult, error) {
			return s.callWrite(ctx, callToolHeader(req), http.MethodPut, "/api/cli/user-profile", toolBody(in), idemKeyOf(in.idempotencyField))
		})
}

// --- 入参到 CLI 请求体的转换 ---

// toolBody 把工具入参转为 CLI 请求体: 经 marshal/unmarshal 转为通用 map,
// 并剔除 idempotency_key 字段, 它是 MCP 层的传输参数, 不属于 CLI 请求体.
// json.RawMessage 字段在 marshal 时保留原始 JSON 值, 三态语义原样透传.
// 转换失败返回空 map, 让 CLI 侧的校验错误兜底.
func toolBody(v any) map[string]any {
	return stripBodyKeys(v)
}

// entityBody 用于单实体写工具: 在 toolBody 基础上再剔除路径参数字段
// (id / card_id), 它们已编入 URL 路径, 出现在请求体会被
// DisallowUnknownFields 拒绝. 批量工具的 items 内 id 是合法字段,
// 不经过这里, 见 batchBody.
func entityBody(v any) map[string]any {
	m := stripBodyKeys(v)
	delete(m, "id")
	delete(m, "card_id")
	return m
}

// stripBodyKeys 执行 marshal/unmarshal 并剔除指定键.
func stripBodyKeys(v any) map[string]any {
	b, err := json.Marshal(v)
	if err != nil {
		return map[string]any{}
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		return map[string]any{}
	}
	delete(m, "idempotency_key")
	return m
}

// batchBody 把批量入参的 items 转为 CLI 批量请求体, 逐项剔除 idempotency_key.
func batchBody[T any](items []T) map[string]any {
	list := make([]map[string]any, 0, len(items))
	for _, item := range items {
		list = append(list, toolBody(item))
	}
	return map[string]any{"items": list}
}

// listQuery 把分页字段转为查询参数, 各列表工具共用.
// page/pageSize 为 0 时表示客户端未提供, 不下发参数.
func listQuery(page, pageSize int, extra map[string]string) map[string]string {
	q := map[string]string{}
	if page > 0 {
		q["page"] = strconv.Itoa(page)
	}
	if pageSize > 0 {
		q["page_size"] = strconv.Itoa(pageSize)
	}
	for k, v := range extra {
		if v != "" {
			q[k] = v
		}
	}
	return q
}

// idemKeyOf 返回写工具入参的幂等键, 未提供时生成随机键.
func idemKeyOf(in idempotencyField) string {
	if in.IdempotencyKey != "" {
		return in.IdempotencyKey
	}
	return newMCPRandomKey()
}

// callRead 发起一次只读 CLI 调用.
func (s *Server) callRead(
	ctx context.Context, header http.Header, path string, query map[string]string,
) (*mcp.CallToolResult, mcpToolResult, error) {
	return s.callCLITool(ctx, header, http.MethodGet, path, query, nil, "")
}

// callWrite 发起一次写 CLI 调用, idemKey 为空时自动生成.
func (s *Server) callWrite(
	ctx context.Context, header http.Header, method, path string, body any, idemKey string,
) (*mcp.CallToolResult, mcpToolResult, error) {
	if idemKey == "" {
		idemKey = newMCPRandomKey()
	}
	return s.callCLITool(ctx, header, method, path, nil, body, idemKey)
}

// toolFor 组装一个标准工具定义: 名称 + 中文描述.
// toolBase 组装工具公共字段: 出参 schema 与默认 annotations.
func toolBase(name, desc string) *mcp.Tool {
	return &mcp.Tool{Name: name, Description: desc, OutputSchema: mcpToolOutputSchema}
}

// readTool 声明只读工具: 客户端可放心并行调用, 无需用户确认.
func readTool(name, desc string) *mcp.Tool {
	tool := toolBase(name, desc)
	tool.Annotations = &mcp.ToolAnnotations{ReadOnlyHint: true}
	return tool
}

// writeTool 声明新增或修改类工具 (非破坏性).
func writeTool(name, desc string) *mcp.Tool {
	return toolBase(name, desc)
}

// destructiveTool 声明会使既有数据失效的工具 (回收, 合并).
func destructiveTool(name, desc string) *mcp.Tool {
	destructive := true
	tool := toolBase(name, desc)
	tool.Annotations = &mcp.ToolAnnotations{DestructiveHint: &destructive}
	return tool
}

// toolWithInput 挂载自定义入参 schema (三态字段需要覆盖 JSON Schema).
func toolWithInput(tool *mcp.Tool, input *jsonschema.Schema) *mcp.Tool {
	tool.InputSchema = input
	return tool
}
