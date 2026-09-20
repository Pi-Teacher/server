package embedding_test

import (
	"errors"
	"math"
	"testing"

	"github.com/Pi-Teacher/server/internal/domain/embedding"
)

// TestEncodeDecodeRoundtrip 验证 IEEE-754 little-endian 编码可无损往返,
// 且字节长度恰为 维度 * 4.
func TestEncodeDecodeRoundtrip(t *testing.T) {
	v := []float32{0.25, -1.5, 3.75, 0}
	b := embedding.Encode(v)
	if len(b) != len(v)*4 {
		t.Fatalf("encoded length = %d, want %d", len(b), len(v)*4)
	}
	// 首位小端字节序: 0.25 = 0x3E800000, 小端首字节应为 0x00.
	if b[0] != 0x00 || b[1] != 0x00 || b[2] != 0x80 || b[3] != 0x3E {
		t.Fatalf("little-endian bytes = % x, want 00 00 80 3e", b[:4])
	}
	got, err := embedding.Decode(b)
	if err != nil {
		t.Fatalf("Decode error: %v", err)
	}
	for i := range v {
		if got[i] != v[i] {
			t.Fatalf("roundtrip[%d] = %v, want %v", i, got[i], v[i])
		}
	}
}

// TestDecodeRejectsBadLength 验证长度不是 4 的整数倍时报错.
func TestDecodeRejectsBadLength(t *testing.T) {
	if _, err := embedding.Decode([]byte{1, 2, 3}); err == nil {
		t.Fatal("Decode(3 bytes) should fail")
	}
}

// TestNormalize 验证 L2 归一化后范数为 1, 零向量保持不变.
func TestNormalize(t *testing.T) {
	got := embedding.Normalize([]float32{3, 4})
	if math.Abs(float64(got[0])-0.6) > 1e-6 || math.Abs(float64(got[1])-0.8) > 1e-6 {
		t.Fatalf("normalized = %v, want [0.6 0.8]", got)
	}
	zero := embedding.Normalize([]float32{0, 0})
	if zero[0] != 0 || zero[1] != 0 {
		t.Fatalf("zero vector normalized = %v, want unchanged", zero)
	}
}

// TestCosine 验证余弦相似度: 同向为 1, 正交为 0, 反向为 -1,
// 长度不符或零向量返回 0.
func TestCosine(t *testing.T) {
	if got := embedding.Cosine([]float32{1, 0}, []float32{2, 0}); math.Abs(got-1) > 1e-9 {
		t.Fatalf("same direction cosine = %v, want 1", got)
	}
	if got := embedding.Cosine([]float32{1, 0}, []float32{0, 1}); math.Abs(got) > 1e-9 {
		t.Fatalf("orthogonal cosine = %v, want 0", got)
	}
	if got := embedding.Cosine([]float32{1, 0}, []float32{-1, 0}); math.Abs(got+1) > 1e-9 {
		t.Fatalf("opposite cosine = %v, want -1", got)
	}
	if got := embedding.Cosine([]float32{1, 0}, []float32{1}); got != 0 {
		t.Fatalf("length mismatch cosine = %v, want 0", got)
	}
	if got := embedding.Cosine([]float32{0, 0}, []float32{1, 1}); got != 0 {
		t.Fatalf("zero vector cosine = %v, want 0", got)
	}
}

// TestToVectorDimension 验证维度不符时报 ErrDimensionMismatch.
func TestToVectorDimension(t *testing.T) {
	_, err := embedding.ToVector([]float64{1, 2, 3}, 2)
	if !errors.Is(err, embedding.ErrDimensionMismatch) {
		t.Fatalf("err = %v, want ErrDimensionMismatch", err)
	}
	v, err := embedding.ToVector([]float64{1, 2}, 2)
	if err != nil {
		t.Fatalf("ToVector error: %v", err)
	}
	if len(v) != 2 {
		t.Fatalf("vector len = %d, want 2", len(v))
	}
}

// TestToVectorRejectsNonFinite 验证 NaN/Inf 被拒绝.
// 1e300 在 float64 下有限, 但转为 float32 会溢出为 +Inf, 也必须拒绝.
func TestToVectorRejectsNonFinite(t *testing.T) {
	if _, err := embedding.ToVector([]float64{math.NaN()}, 1); !errors.Is(err, embedding.ErrNonFinite) {
		t.Fatalf("NaN err = %v, want ErrNonFinite", err)
	}
	if _, err := embedding.ToVector([]float64{math.Inf(1)}, 1); !errors.Is(err, embedding.ErrNonFinite) {
		t.Fatalf("+Inf err = %v, want ErrNonFinite", err)
	}
	if _, err := embedding.ToVector([]float64{1e300}, 1); !errors.Is(err, embedding.ErrNonFinite) {
		t.Fatalf("float32 overflow err = %v, want ErrNonFinite", err)
	}
}
