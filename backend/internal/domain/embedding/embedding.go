// Package embedding 定义向量嵌入的领域接口与纯向量数学.
//
// 本包只表达"给定文本得到向量"的能力和向量本身的运算规则, 不依赖
// 任何 HTTP/JSON/数据库类型: OpenAI-compatible 协议的接线在
// infrastructure/embedding 的 adapter, 编排在 application/appsvc.
// 上层 (Card/Review/HTTP/仓储) 只依赖这里的 Provider 接口与编码函数,
// 不感知 URL、请求头、字节序或三方库.
package embedding

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"math"
	"time"
)

// Config 是一次嵌入调用所需的连接参数快照.
// 连接参数全部来自运行期设置, 每次调用前取一次, 修改后无需重启即生效.
type Config struct {
	// BaseURL 是 OpenAI 风格 API 根地址, 已包含版本前缀
	// (如 http://localhost:11434/v1); 端点在其后拼接 /embeddings.
	BaseURL string
	// APIKey 明文保存, 通过 Authorization: Bearer 发送.
	APIKey string
	// Model 是嵌入模型名.
	Model string
	// Dimensions 是期望向量维度, 返回向量长度必须与之严格相等.
	Dimensions int
	// Timeout 是单次 HTTP 请求的超时.
	Timeout time.Duration
}

// Configured 判断连接参数是否足以发起一次真实调用.
func (c Config) Configured() bool {
	return c.BaseURL != "" && c.Model != "" && c.Dimensions > 0
}

// Provider 抽象"把一批文本编码为向量"的能力.
//
// 契约:
//   - 返回切片与 inputs 一一对应且顺序一致;
//   - 每个向量长度等于配置的 Dimensions, 且所有分量均为有限值
//     (不含 NaN/Inf), 否则返回错误;
//   - 长度为 0 的 inputs 返回空切片且不发起网络请求.
//
// 向量是否归一化由调用方用 Normalize 决定, Provider 不隐式归一.
type Provider interface {
	Embed(ctx context.Context, inputs []string) ([][]float32, error)
}

// 向量校验的哨兵错误, 便于调用方用 errors.Is 分支处理.
var (
	// ErrDimensionMismatch 表示返回向量长度与配置维度不一致.
	ErrDimensionMismatch = errors.New("embedding 向量维度不一致")
	// ErrNonFinite 表示向量包含 NaN 或 Inf.
	ErrNonFinite = errors.New("embedding 向量含 NaN/Inf")
	// ErrNotConfigured 表示连接参数不完整, 无法发起调用.
	ErrNotConfigured = errors.New("embedding 未配置")
)

// ToVector 校验原始 float64 向量并转为 float32.
//
// 长度必须等于 dimensions; 转换后再次检查有限性: float64 的有限值
// 仍可能在转为 float32 时溢出为 Inf (如 1e300), 因此只检查 float64
// 是不够的. 任一不过返回 nil 与可 errors.Is 的错误.
func ToVector(v []float64, dimensions int) ([]float32, error) {
	if dimensions <= 0 {
		return nil, fmt.Errorf("%w: dimensions=%d", ErrNotConfigured, dimensions)
	}
	if len(v) != dimensions {
		return nil, fmt.Errorf("%w: got %d, want %d", ErrDimensionMismatch, len(v), dimensions)
	}
	out := make([]float32, len(v))
	for i, x := range v {
		f := float32(x)
		if math.IsNaN(float64(f)) || math.IsInf(float64(f), 0) {
			return nil, fmt.Errorf("%w: index %d", ErrNonFinite, i)
		}
		out[i] = f
	}
	return out, nil
}

// Normalize 返回向量的 L2 归一化副本.
// 零向量 (范数为 0) 原样返回, 避免除零产生 NaN.
func Normalize(v []float32) []float32 {
	var sum float64
	for _, x := range v {
		sum += float64(x) * float64(x)
	}
	out := make([]float32, len(v))
	if sum == 0 {
		copy(out, v)
		return out
	}
	inv := 1 / math.Sqrt(sum)
	for i, x := range v {
		out[i] = float32(float64(x) * inv)
	}
	return out
}

// Encode 把向量按 IEEE-754 little-endian float32 连续编码为字节.
// 三种数据库统一以该字节串存入 BLOB/BYTEA 列.
func Encode(v []float32) []byte {
	b := make([]byte, len(v)*4)
	for i, x := range v {
		binary.LittleEndian.PutUint32(b[i*4:], math.Float32bits(x))
	}
	return b
}

// Decode 把 Encode 产生的字节解码回 float32 向量.
// 长度不是 4 的整数倍时返回错误 (数据损坏).
func Decode(b []byte) ([]float32, error) {
	if len(b)%4 != 0 {
		return nil, fmt.Errorf("embedding BLOB 长度 %d 不是 4 的整数倍", len(b))
	}
	out := make([]float32, len(b)/4)
	for i := range out {
		out[i] = math.Float32frombits(binary.LittleEndian.Uint32(b[i*4:]))
	}
	return out, nil
}

// Cosine 返回两个向量的余弦相似度, 取值 [-1, 1].
// 长度不一致、任一为空或任一为零向量时返回 0, 保证调用方得到有限值.
func Cosine(a, b []float32) float64 {
	if len(a) == 0 || len(a) != len(b) {
		return 0
	}
	var dot, na, nb float64
	for i := range a {
		av, bv := float64(a[i]), float64(b[i])
		dot += av * bv
		na += av * av
		nb += bv * bv
	}
	if na == 0 || nb == 0 {
		return 0
	}
	return dot / (math.Sqrt(na) * math.Sqrt(nb))
}
