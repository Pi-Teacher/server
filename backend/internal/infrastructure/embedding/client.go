// Package embedding 是 domain/embedding.Provider 的两个实现:
// OpenAI-compatible HTTP 客户端与进程内后台 worker.
//
// 本包是唯一出现 embedding HTTP 协议、请求头与 JSON 字段的地方;
// 上层只依赖 domain/embedding 的接口与纯向量函数, 不感知 URL、
// Authorization 或响应结构. 连接参数每次调用前从设置快照读取,
// 修改配置后无需重启即生效.
package embedding

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/Pi-Teacher/server/internal/domain/embedding"
)

// maxResponseBytes 限制读取的上游响应体, 防御异常服务端.
const maxResponseBytes = 8 << 20 // 8 MiB

// ConfigFunc 返回当前 embedding 连接参数快照.
type ConfigFunc func() embedding.Config

// Client 实现 OpenAI-compatible Embeddings API.
type Client struct {
	config ConfigFunc
	// httpClient 是底层客户端; 超时按每次请求的 context 控制,
	// 因此这里不设全局 Timeout, 允许不同请求用不同超时.
	httpClient *http.Client
}

// NewClient 构造 HTTP 客户端. config 为 nil 时按未配置处理.
func NewClient(config ConfigFunc) *Client {
	if config == nil {
		config = func() embedding.Config { return embedding.Config{} }
	}
	return &Client{config: config, httpClient: &http.Client{}}
}

var _ embedding.Provider = (*Client)(nil)

// embeddingsRequest 是 OpenAI-compatible 请求体的最小公共字段集.
type embeddingsRequest struct {
	Model          string   `json:"model"`
	Input          []string `json:"input"`
	EncodingFormat string   `json:"encoding_format"`
	Dimensions     int      `json:"dimensions"`
}

// embeddingsResponse 是响应体的最小依赖: 只读 data[].index 与 data[].embedding.
// 上游可能返回 object/usage 等额外字段, 这里全部忽略.
type embeddingsResponse struct {
	Data []struct {
		Index     int       `json:"index"`
		Embedding []float64 `json:"embedding"`
	} `json:"data"`
	Error *struct {
		Message string `json:"message"`
		Type    string `json:"type"`
	} `json:"error"`
}

// Embed 调用 POST {base_url}/embeddings 并返回与 inputs 等长、顺序一致的向量.
// 空 inputs 直接返回空切片, 不发起请求. 任一向量维度不符或含非有限值时
// 整体失败 (返回 nil), 由调用方按单卡失败处理.
func (c *Client) Embed(ctx context.Context, inputs []string) ([][]float32, error) {
	if len(inputs) == 0 {
		return [][]float32{}, nil
	}
	cfg := c.config()
	if !cfg.Configured() {
		return nil, embedding.ErrNotConfigured
	}
	body, err := json.Marshal(embeddingsRequest{
		Model:          cfg.Model,
		Input:          inputs,
		EncodingFormat: "float",
		Dimensions:     cfg.Dimensions,
	})
	if err != nil {
		return nil, fmt.Errorf("编码 embedding 请求体: %w", err)
	}
	endpoint := strings.TrimRight(cfg.BaseURL, "/") + "/embeddings"
	if cfg.Timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, cfg.Timeout)
		defer cancel()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("构造 embedding 请求: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if cfg.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+cfg.APIKey)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		// 不拼接请求头/凭据, 只保留底层错误文本.
		return nil, fmt.Errorf("调用 embedding 服务: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes))
	if err != nil {
		return nil, fmt.Errorf("读取 embedding 响应: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		// 原样带回状态码与上游正文, 不做脱敏也不截断.
		return nil, fmt.Errorf("embedding 服务返回 HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}
	var parsed embeddingsResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, fmt.Errorf("解析 embedding 响应: %w", err)
	}
	if parsed.Error != nil && parsed.Error.Message != "" {
		return nil, fmt.Errorf("embedding 服务返回错误: %s", parsed.Error.Message)
	}
	if len(parsed.Data) != len(inputs) {
		return nil, fmt.Errorf("embedding 返回条目数 %d 与请求 %d 不一致", len(parsed.Data), len(inputs))
	}
	vectors := make([][]float32, len(inputs))
	seen := make([]bool, len(inputs))
	for _, item := range parsed.Data {
		if item.Index < 0 || item.Index >= len(inputs) {
			return nil, fmt.Errorf("embedding 返回越界 index %d", item.Index)
		}
		v, err := embedding.ToVector(item.Embedding, cfg.Dimensions)
		if err != nil {
			return nil, err
		}
		vectors[item.Index] = embedding.Normalize(v)
		seen[item.Index] = true
	}
	for i, ok := range seen {
		if !ok {
			return nil, fmt.Errorf("embedding 返回缺少 index %d", i)
		}
	}
	return vectors, nil
}

// Probe 用一段固定文本发起一次探测调用, 成功时返回实际向量维度.
// 供 POST /embedding/test 使用: 任何失败都作为业务失败上报, 不算 HTTP 错误.
func (c *Client) Probe(ctx context.Context) (int, error) {
	vectors, err := c.Embed(ctx, []string{"ping"})
	if err != nil {
		return 0, err
	}
	if len(vectors) == 0 {
		return 0, fmt.Errorf("embedding 服务未返回向量")
	}
	return len(vectors[0]), nil
}

// nowUTC 返回当前 UTC 时间, 集中一处便于测试替换 worker 内时间语义.
func nowUTC() time.Time { return time.Now().UTC() }
