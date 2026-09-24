package appsvc

import (
	"context"
	"errors"
	"log/slog"
	"sort"
	"strconv"
	"time"

	"gorm.io/gorm"

	"github.com/Pi-Teacher/server/internal/application/apperr"
	"github.com/Pi-Teacher/server/internal/domain/card"
	"github.com/Pi-Teacher/server/internal/domain/embedding"
	"github.com/Pi-Teacher/server/internal/infrastructure/persistence"
	"github.com/Pi-Teacher/server/internal/infrastructure/persistence/repo"
	"github.com/Pi-Teacher/server/internal/platform/logging"
	"github.com/Pi-Teacher/server/internal/platform/settings"
)

// 查重 top_k 的默认值与上限.
const (
	defaultCheckTopK = 5
	maxCheckTopK     = 50
)

// EmbeddingProber 是探测 embedding 服务连通性的能力, 由 HTTP adapter 提供.
type EmbeddingProber interface {
	Probe(ctx context.Context) (int, error)
}

// EmbeddingService 编排 embedding 配置、状态、重建与查重.
//
// 配置读写走 settings.Manager (内存快照 + 数据库), 重建/重试/完成判定
// 需要同时修改状态键与 Card 行, 因此直接用设置仓库在单个事务内落库,
// 提交后再 Refresh 快照. Provider 只做单次 HTTP 调用, 事务边界由本服务
// 与 worker 共同保证: 外部调用一律在数据库事务之外.
type EmbeddingService struct {
	db      *gorm.DB
	manager *settings.Manager
	// settingsRepo 提供事务内读写状态键的能力 (重建原子性).
	settingsRepo *repo.SettingsRepository
	cards        *repo.CardRepository
	provider     embedding.Provider
	prober       EmbeddingProber
	// notify 在产生新的 pending 任务后唤醒 worker, 可为 nil.
	notify func()
	logger *slog.Logger
	now    func() time.Time
}

// NewEmbeddingService 构造 embedding 服务. notify/prober 可为 nil.
func NewEmbeddingService(
	db *gorm.DB,
	manager *settings.Manager,
	settingsRepo *repo.SettingsRepository,
	cards *repo.CardRepository,
	provider embedding.Provider,
	prober EmbeddingProber,
	notify func(),
	logger *slog.Logger,
) *EmbeddingService {
	return &EmbeddingService{
		db:           db,
		manager:      manager,
		settingsRepo: settingsRepo,
		cards:        cards,
		provider:     provider,
		prober:       prober,
		notify:       notify,
		logger:       logger,
		now:          func() time.Time { return persistence.Now() },
	}
}

// EmbeddingConfig 是 embedding 配置端点的响应视图.
type EmbeddingConfig struct {
	BaseURL                   string
	APIKey                    string
	Model                     string
	Dimensions                int64
	TimeoutSeconds            int64
	WorkerBatchSize           int64
	SimilarityMinReadyPercent int64
}

// embeddingConfigKeys 是 PATCH 允许修改的配置键, 顺序稳定便于写入排序.
var embeddingConfigKeys = []string{
	"embedding_base_url",
	"embedding_api_key",
	"embedding_model",
	"embedding_dimensions",
	"embedding_timeout",
	"embedding_worker_batch_size",
	"embedding_similarity_min_ready_percent",
}

// Config 返回当前 embedding 配置.
func (s *EmbeddingService) Config() EmbeddingConfig {
	snap := s.manager.Snapshot()
	return EmbeddingConfig{
		BaseURL:                   snap.String("embedding_base_url"),
		APIKey:                    snap.String("embedding_api_key"),
		Model:                     snap.String("embedding_model"),
		Dimensions:                snap.Int64("embedding_dimensions"),
		TimeoutSeconds:            snap.Int64("embedding_timeout"),
		WorkerBatchSize:           snap.Int64("embedding_worker_batch_size"),
		SimilarityMinReadyPercent: snap.Int64("embedding_similarity_min_ready_percent"),
	}
}

// EmbeddingConfigPatch 是配置修改的可选字段. nil 表示不修改该字段.
type EmbeddingConfigPatch struct {
	BaseURL                   *string
	APIKey                    *string
	Model                     *string
	Dimensions                *int64
	TimeoutSeconds            *int64
	WorkerBatchSize           *int64
	SimilarityMinReadyPercent *int64
}

// PatchConfig 按字段子集写入 embedding 配置.
// 重建进行中禁止修改任何字段, 返回 409 rebuilding: 最低覆盖率与批次
// 大小都参与进行中的完成判定, 中途改动会让统计口径漂移.
func (s *EmbeddingService) PatchConfig(ctx context.Context, patch EmbeddingConfigPatch) error {
	if s.rebuilding() {
		return rebuildingError()
	}
	updates := make([]settings.Update, 0, len(embeddingConfigKeys))
	add := func(key string, value *string) {
		if value != nil {
			updates = append(updates, settings.Update{Key: key, Value: *value})
		}
	}
	if patch.BaseURL != nil {
		add("embedding_base_url", patch.BaseURL)
	}
	if patch.APIKey != nil {
		add("embedding_api_key", patch.APIKey)
	}
	if patch.Model != nil {
		add("embedding_model", patch.Model)
	}
	if patch.Dimensions != nil {
		v := formatInt(*patch.Dimensions)
		add("embedding_dimensions", &v)
	}
	if patch.TimeoutSeconds != nil {
		v := formatInt(*patch.TimeoutSeconds)
		add("embedding_timeout", &v)
	}
	if patch.WorkerBatchSize != nil {
		v := formatInt(*patch.WorkerBatchSize)
		add("embedding_worker_batch_size", &v)
	}
	if patch.SimilarityMinReadyPercent != nil {
		v := formatInt(*patch.SimilarityMinReadyPercent)
		add("embedding_similarity_min_ready_percent", &v)
	}
	if len(updates) == 0 {
		return apperr.Validation("至少提供一个要修改的字段")
	}
	// 重建复核与写入之间无锁: 单实例单用户手动操作下可接受, 且写入
	// 仍然整体生效; 重建与改配置并发时最多让其中一次排在后面失败重试.
	if err := s.manager.Apply(ctx, updates); err != nil {
		return apperr.Validation(err.Error())
	}
	return nil
}

// EmbeddingCoverageInfo 是覆盖率的对外视图.
type EmbeddingCoverageInfo struct {
	TotalEnabled int64
	Ready        int64
	Pending      int64
	Processing   int64
	Failed       int64
	ReadyPercent float64
}

// EmbeddingStatus 是状态端点的响应数据.
type EmbeddingStatus struct {
	Rebuilding        bool
	SimilarityEnabled bool
	Coverage          EmbeddingCoverageInfo
}

// Status 返回重建状态, 相似度开关与覆盖率.
func (s *EmbeddingService) Status(ctx context.Context) (EmbeddingStatus, error) {
	coverage, err := s.coverage(ctx)
	if err != nil {
		return EmbeddingStatus{}, err
	}
	return EmbeddingStatus{
		Rebuilding:        s.rebuilding(),
		SimilarityEnabled: s.similarityEnabledForCoverage(coverage),
		Coverage:          coverage,
	}, nil
}

// Test 使用当前配置发送一次探测请求, 返回实际向量维度.
// 失败作为业务失败上报, 由 HTTP 层以 200 + ok=false 表达.
func (s *EmbeddingService) Test(ctx context.Context) (int, error) {
	if s.prober == nil {
		return 0, errors.New("embedding provider 未配置")
	}
	return s.prober.Probe(ctx)
}

// Rebuild 触发一次完整重建: 清空全部启用卡的向量并重置为 pending.
// 已在重建中返回 409 rebuilding. 事务提交后唤醒 worker.
func (s *EmbeddingService) Rebuild(ctx context.Context) error {
	now := s.now()
	err := persistence.RunInTx(ctx, s.db, func(innerCtx context.Context, tx *gorm.DB) error {
		if s.rebuildingTx(innerCtx, tx) {
			return errRebuilding
		}
		if err := s.settingsRepo.WithTx(tx).ApplyTx(innerCtx, []settings.Update{
			{Key: "embedding_rebuilding", Value: "true"},
			{Key: "embedding_similarity_enabled", Value: "false"},
		}); err != nil {
			return err
		}
		_, err := s.cards.WithTx(tx).ClearAllEmbedding(innerCtx, now)
		return err
	})
	if err != nil {
		if errors.Is(err, errRebuilding) {
			return rebuildingError()
		}
		return err
	}
	s.refresh()
	s.wake()
	return nil
}

// RetryFailed 重新生成全部 failed 卡. 没有失败项时直接成功且不改状态;
// 已在重建中返回 409. 不清空 ready 向量, 重试期间沿用启动前的有效查重状态.
func (s *EmbeddingService) RetryFailed(ctx context.Context) error {
	count, err := s.cards.CountFailedEmbedding(ctx)
	if err != nil {
		return err
	}
	if count == 0 {
		return nil
	}
	now := s.now()
	err = persistence.RunInTx(ctx, s.db, func(innerCtx context.Context, tx *gorm.DB) error {
		if s.rebuildingTx(innerCtx, tx) {
			return errRebuilding
		}
		// 平时查重状态是动态计算的, 重试开始时将当前结果留作进行中的开关.
		coverage, err := s.cards.WithTx(tx).EmbeddingCoverage(innerCtx)
		if err != nil {
			return err
		}
		enabled := coverage.ReadyPercent() >= float64(s.manager.Snapshot().Int64("embedding_similarity_min_ready_percent"))
		if err := s.settingsRepo.WithTx(tx).ApplyTx(innerCtx, []settings.Update{
			{Key: "embedding_rebuilding", Value: "true"},
			{Key: "embedding_similarity_enabled", Value: formatBool(enabled)},
		}); err != nil {
			return err
		}
		_, err = s.cards.WithTx(tx).ResetFailedEmbedding(innerCtx, now)
		return err
	})
	if err != nil {
		if errors.Is(err, errRebuilding) {
			return rebuildingError()
		}
		return err
	}
	s.refresh()
	s.wake()
	return nil
}

// FinalizeIfIdle 在 worker 排空后判断是否满足重建完成条件并收尾.
// 只在 rebuilding=true 且无 pending/processing 时生效: 按整体覆盖率
// 更新 similarity_enabled 并关闭 rebuilding. 幂等, 可被反复调用.
func (s *EmbeddingService) FinalizeIfIdle(ctx context.Context) {
	if !s.rebuilding() {
		return
	}
	coverage, err := s.cards.EmbeddingCoverage(ctx)
	if err != nil {
		s.warn(ctx, "embedding_finalize_failed", "统计 embedding 覆盖率失败", err)
		return
	}
	if !coverage.Idle() {
		return
	}
	minPercent := s.manager.Snapshot().Int64("embedding_similarity_min_ready_percent")
	enabled := coverage.ReadyPercent() >= float64(minPercent)
	err = persistence.RunInTx(ctx, s.db, func(innerCtx context.Context, tx *gorm.DB) error {
		return s.settingsRepo.WithTx(tx).ApplyTx(innerCtx, []settings.Update{
			{Key: "embedding_rebuilding", Value: "false"},
			{Key: "embedding_similarity_enabled", Value: formatBool(enabled)},
		})
	})
	if err != nil {
		s.warn(ctx, "embedding_finalize_failed", "收尾 embedding 重建失败", err)
		return
	}
	s.refresh()
	s.logger.InfoContext(ctx, "embedding 重建完成",
		"ready_percent", coverage.ReadyPercent(),
		"similarity_enabled", enabled,
	)
}

// --- 查重 ---

// CheckInput 是一次查重请求的已解码参数.
type CheckInput struct {
	Front           string
	EnableEmbedding bool
	// TopK 为 0 时取默认值, 上限 maxCheckTopK.
	TopK int
}

// CheckMatch 是单个查重候选.
// Similarity 只在语义分支有值; 精确分支为 nil, 表示"同 front".
type CheckMatch struct {
	ID         int64
	Front      string
	Back       string
	TopicID    *int64
	Similarity *float64
}

// CheckResult 是查重结果. MatchType 取 exact|semantic;
// Coverage 只在语义分支有值.
type CheckResult struct {
	MatchType string
	Coverage  *EmbeddingCoverageInfo
	Matches   []CheckMatch
}

// Check 执行 dry-run 查重: 不写库, 不产审批.
//
// 所有请求先按 front_fingerprint 召回全部正常 Card, 再用完整 canonical
// front 复核排除哈希碰撞. exact 命中时直接返回, 不调用 embedding provider.
// exact 未命中且 enable_embedding=false 时返回空 exact 结果;
// exact 未命中且 enable_embedding=true 时才生成查询向量, 遍历 ready 卡
// 计算 cosine top-K. 此时相似度能力未开放返回 409 similarity_disabled,
// 查询向量生成失败返回 503 embedding_unavailable.
func (s *EmbeddingService) Check(ctx context.Context, input CheckInput) (*CheckResult, error) {
	front, err := validateContent("front", input.Front)
	if err != nil {
		return nil, err
	}
	exact, err := s.checkExact(ctx, front)
	if err != nil {
		return nil, err
	}
	if len(exact.Matches) > 0 || !input.EnableEmbedding {
		return exact, nil
	}
	return s.checkSemantic(ctx, front, normalizeTopK(input.TopK))
}

// checkExact 用指纹索引跨全部正常 Card 召回, 并在 Go 中完整复核.
func (s *EmbeddingService) checkExact(ctx context.Context, front string) (*CheckResult, error) {
	canonical := card.CanonicalFront(front)
	candidates, err := s.cards.FindExactCandidates(ctx, card.FrontFingerprint(front))
	if err != nil {
		return nil, err
	}
	matches := make([]CheckMatch, 0, len(candidates))
	for _, c := range candidates {
		if card.CanonicalFront(c.Front) != canonical {
			continue
		}
		matches = append(matches, CheckMatch{
			ID: c.ID, Front: c.Front, Back: c.Back, TopicID: c.TopicID,
		})
	}
	return &CheckResult{MatchType: "exact", Matches: matches}, nil
}

// checkSemantic 生成查询向量后对 ready 卡算 cosine 取 top-K.
func (s *EmbeddingService) checkSemantic(ctx context.Context, front string, topK int) (*CheckResult, error) {
	coverage, err := s.coverage(ctx)
	if err != nil {
		return nil, err
	}
	if !s.similarityEnabledForCoverage(coverage) {
		return nil, apperr.New(apperr.CodeSimilarityDisabled,
			"语义查重能力当前未开放").
			WithDetails(map[string]any{"coverage": coverageMap(coverage)})
	}
	vectors, err := s.provider.Embed(ctx, []string{front})
	if err != nil {
		return nil, apperr.Wrap(apperr.CodeEmbeddingUnavail, "生成查询向量失败", err)
	}
	if len(vectors) != 1 {
		return nil, apperr.New(apperr.CodeEmbeddingUnavail, "生成查询向量失败: 返回数量异常")
	}
	query := vectors[0]
	candidates, err := s.cards.ListSemanticCandidates(ctx)
	if err != nil {
		return nil, err
	}
	scored := make([]CheckMatch, 0, len(candidates))
	for _, c := range candidates {
		vec, err := embedding.Decode(c.Embedding)
		if err != nil {
			// 单条向量损坏不应让整个查重失败: 跳过并继续.
			continue
		}
		score := embedding.Cosine(query, vec)
		scored = append(scored, CheckMatch{
			ID: c.ID, Front: c.Front, Back: c.Back, TopicID: c.TopicID, Similarity: &score,
		})
	}
	sort.SliceStable(scored, func(i, j int) bool {
		return *scored[i].Similarity > *scored[j].Similarity
	})
	if len(scored) > topK {
		scored = scored[:topK]
	}
	return &CheckResult{
		MatchType: "semantic",
		Coverage:  &coverage,
		Matches:   scored,
	}, nil
}

// --- 内部辅助 ---

// errRebuilding 是事务内检测到重建进行中的哨兵错误.
var errRebuilding = errors.New("embedding rebuilding in progress")

// rebuildingError 构造 409 rebuilding.
func rebuildingError() *apperr.Error {
	return apperr.New(apperr.CodeRebuilding, "embedding 重建进行中")
}

// rebuilding 读取当前重建状态 (内存快照).
func (s *EmbeddingService) rebuilding() bool {
	return s.manager.Snapshot().Bool("embedding_rebuilding")
}

// rebuildingTx 在事务内读取权威重建状态.
func (s *EmbeddingService) rebuildingTx(ctx context.Context, tx *gorm.DB) bool {
	v, ok, err := s.settingsRepo.WithTx(tx).GetOne(ctx, "embedding_rebuilding")
	if err != nil || !ok {
		// 读不到时回退内存快照, 避免因设置行缺失而误开重建.
		return s.rebuilding()
	}
	return v == "true"
}

// similarityEnabledForCoverage 在非重建期间按实时覆盖率判定是否开放.
// 完整重建期间保持关闭, 失败项重试期间沿用原开关, 避免改变进行中的查重语义.
func (s *EmbeddingService) similarityEnabledForCoverage(coverage EmbeddingCoverageInfo) bool {
	snap := s.manager.Snapshot()
	if snap.Bool("embedding_rebuilding") {
		return snap.Bool("embedding_similarity_enabled")
	}
	return coverage.ReadyPercent >= float64(snap.Int64("embedding_similarity_min_ready_percent"))
}

// refresh 重新加载设置快照, 使本服务的直接写库对后续读取即时可见.
func (s *EmbeddingService) refresh() {
	if err := s.manager.Refresh(context.Background()); err != nil {
		s.logger.Warn("刷新设置快照失败", "error", err.Error())
	}
}

// wake 唤醒 worker, notify 未注入时什么也不做.
func (s *EmbeddingService) wake() {
	if s.notify != nil {
		s.notify()
	}
}

// warn 记录一条 warn 日志.
func (s *EmbeddingService) warn(ctx context.Context, event, msg string, err error) {
	s.logger.WarnContext(logging.WithEvent(ctx, event), msg, logging.AttrError, err.Error())
}

// coverage 返回覆盖率视图.
func (s *EmbeddingService) coverage(ctx context.Context) (EmbeddingCoverageInfo, error) {
	c, err := s.cards.EmbeddingCoverage(ctx)
	if err != nil {
		return EmbeddingCoverageInfo{}, err
	}
	return EmbeddingCoverageInfo{
		TotalEnabled: c.TotalEnabled,
		Ready:        c.Ready,
		Pending:      c.Pending,
		Processing:   c.Processing,
		Failed:       c.Failed,
		ReadyPercent: c.ReadyPercent(),
	}, nil
}

// coverageMap 把覆盖率转为 errors details / 响应用的 map.
func coverageMap(c EmbeddingCoverageInfo) map[string]any {
	return map[string]any{
		"total_enabled": c.TotalEnabled,
		"ready":         c.Ready,
		"pending":       c.Pending,
		"processing":    c.Processing,
		"failed":        c.Failed,
		"ready_percent": c.ReadyPercent,
	}
}

// normalizeTopK 归一化 top_k: <=0 取默认, 超上限截断.
func normalizeTopK(topK int) int {
	if topK <= 0 {
		return defaultCheckTopK
	}
	if topK > maxCheckTopK {
		return maxCheckTopK
	}
	return topK
}

// formatInt 把 int64 编码为设置存储的十进制串.
func formatInt(v int64) string { return strconv.FormatInt(v, 10) }

// formatBool 把 bool 编码为设置存储的串.
func formatBool(v bool) string {
	if v {
		return "true"
	}
	return "false"
}
