package embedding_test

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Pi-Teacher/server/internal/domain/embedding"
	embeddinginfra "github.com/Pi-Teacher/server/internal/infrastructure/embedding"
)

// newClient 构造指向给定测试服务的客户端.
func newClient(server *httptest.Server, dims int) *embeddinginfra.Client {
	return embeddinginfra.NewClient(func() embedding.Config {
		return embedding.Config{
			BaseURL:    server.URL,
			APIKey:     "secret",
			Model:      "test-model",
			Dimensions: dims,
			Timeout:    2 * time.Second,
		}
	})
}

// TestClientEmbedSuccess 验证请求体最小字段、Bearer 头与响应重排+归一化.
func TestClientEmbedSuccess(t *testing.T) {
	var gotAuth string
	var gotBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		// 故意乱序返回, 验证按 index 重排.
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": []map[string]any{
				{"index": 1, "embedding": []float64{0, 1}},
				{"index": 0, "embedding": []float64{3, 4}},
			},
		})
	}))
	defer server.Close()

	vecs, err := newClient(server, 2).Embed(context.Background(), []string{"a", "b"})
	if err != nil {
		t.Fatalf("Embed error: %v", err)
	}
	if gotAuth != "Bearer secret" {
		t.Fatalf("Authorization = %q, want Bearer secret", gotAuth)
	}
	if gotBody["model"] != "test-model" || gotBody["encoding_format"] != "float" {
		t.Fatalf("request body = %+v", gotBody)
	}
	if gotBody["dimensions"].(float64) != 2 {
		t.Fatalf("dimensions = %v, want 2", gotBody["dimensions"])
	}
	// 向量已 L2 归一化: [3,4] -> [0.6,0.8].
	if math.Abs(float64(vecs[0][0])-0.6) > 1e-6 || math.Abs(float64(vecs[0][1])-0.8) > 1e-6 {
		t.Fatalf("vecs[0] = %v, want normalized [0.6 0.8]", vecs[0])
	}
}

// TestClientEmptyInputNoRequest 验证空输入不发起请求.
func TestClientEmptyInputNoRequest(t *testing.T) {
	called := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
	}))
	defer server.Close()
	vecs, err := newClient(server, 2).Embed(context.Background(), nil)
	if err != nil || len(vecs) != 0 {
		t.Fatalf("Embed(nil) = %v, %v; want empty, nil", vecs, err)
	}
	if called {
		t.Fatal("empty input must not call upstream")
	}
}

// TestClientRejectsDimensionMismatch 验证返回向量维度与配置不符时报错.
func TestClientRejectsDimensionMismatch(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": []map[string]any{{"index": 0, "embedding": []float64{1, 2, 3}}},
		})
	}))
	defer server.Close()
	_, err := newClient(server, 2).Embed(context.Background(), []string{"a"})
	if !errors.Is(err, embedding.ErrDimensionMismatch) {
		t.Fatalf("err = %v, want ErrDimensionMismatch", err)
	}
}

// TestClientRejectsNonFinite 验证 NaN/Inf 向量被拒绝.
func TestClientRejectsNonFinite(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// JSON 不能直接编码 NaN, 手工写入字面量.
		_, _ = w.Write([]byte(`{"data":[{"index":0,"embedding":[1.0,1e400]}]}`))
	}))
	defer server.Close()
	_, err := newClient(server, 2).Embed(context.Background(), []string{"a"})
	// 1e400 解析为 +Inf, ToVector 拒绝.
	if err == nil {
		t.Fatal("expected error for non-finite vector")
	}
}

// TestClientSurfacesUpstreamError 验证非 2xx 时错误文本含状态码与上游正文.
func TestClientSurfacesUpstreamError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"invalid api key"}`))
	}))
	defer server.Close()
	_, err := newClient(server, 2).Embed(context.Background(), []string{"a"})
	if err == nil {
		t.Fatal("expected error on 401")
	}
	if !strings.Contains(err.Error(), "401") || !strings.Contains(err.Error(), "invalid api key") {
		t.Fatalf("error = %q, want status and upstream body", err.Error())
	}
}

// TestClientNotConfigured 验证缺配置时不发请求直接报 ErrNotConfigured.
func TestClientNotConfigured(t *testing.T) {
	client := embeddinginfra.NewClient(func() embedding.Config { return embedding.Config{} })
	_, err := client.Embed(context.Background(), []string{"a"})
	if !errors.Is(err, embedding.ErrNotConfigured) {
		t.Fatalf("err = %v, want ErrNotConfigured", err)
	}
}
