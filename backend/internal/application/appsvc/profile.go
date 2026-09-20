package appsvc

import (
	"context"

	"gorm.io/gorm"

	"github.com/Pi-Teacher/server/internal/infrastructure/persistence"
	"github.com/Pi-Teacher/server/internal/infrastructure/persistence/repo"
	"github.com/Pi-Teacher/server/internal/platform/settings"
)

// UserProfileService 读写用户画像.
//
// 画像与其他设置共用 setting_keys 表, 但需要 setting_keys.version 做乐观锁,
// 因此不经过通用 settings 端点的直接 upsert, 而是读写独立行并做条件更新.
// 写成功后刷新内存设置快照, 保持快照与行一致.
//
// 写路径统一走 RunInTx: CLI 写请求的幂等包装已在外层开启事务并把句柄放进
// ctx, 复用同一事务既保证画像写入与幂等记录原子提交, 也避免在 SQLite 上
// 另开连接去写被外层事务锁定的库.
type UserProfileService struct {
	db      *gorm.DB
	repo    *repo.UserProfileRepository
	manager *settings.Manager
}

// NewUserProfileService 构造用户画像服务.
func NewUserProfileService(db *gorm.DB, r *repo.UserProfileRepository, manager *settings.Manager) *UserProfileService {
	return &UserProfileService{db: db, repo: r, manager: manager}
}

// UserProfile 是画像的读取结果.
type UserProfile struct {
	Profile string
	Version int64
}

// Get 返回当前画像. 行缺失时返回空画像与 version=0.
func (s *UserProfileService) Get(ctx context.Context) (UserProfile, error) {
	row, err := s.repo.Get(ctx)
	if err != nil {
		return UserProfile{}, err
	}
	return UserProfile{Profile: row.Profile, Version: row.Version}, nil
}

// Update 按 expected_version 更新画像. 版本不一致返回 409 version_conflict
// 且 details.current_version 携带当前值, 让调用方重读后决定如何合并.
//
// 行缺失且 expected_version=0 时视为首次写入 (注册表已保证正常有默认行,
// 这里是兜底), 其余情况走条件更新. 写成功后刷新内存设置快照.
func (s *UserProfileService) Update(ctx context.Context, expectedVersion int64, profile string) (UserProfile, error) {
	var result UserProfile
	err := persistence.RunInTx(ctx, s.db, func(innerCtx context.Context, tx *gorm.DB) error {
		repoTx := s.repo.WithTx(tx)
		row, err := repoTx.Get(innerCtx)
		if err != nil {
			return err
		}
		now := persistence.Now()
		if !row.Exists && expectedVersion == 0 {
			if err := repoTx.Create(innerCtx, profile, now); err != nil {
				return err
			}
			result = UserProfile{Profile: profile, Version: 1}
			return nil
		}
		ok, err := repoTx.UpdateConditional(innerCtx, expectedVersion, profile, now)
		if err != nil {
			return err
		}
		if !ok {
			return versionConflict("用户画像", row.Version)
		}
		result = UserProfile{Profile: profile, Version: expectedVersion + 1}
		return nil
	})
	if err != nil {
		return UserProfile{}, err
	}
	// 刷新快照放在事务提交之后: CLI 幂等包装复用外层事务时, 若在此刻用
	// 另一连接读会被未提交写入隔离 (读到旧值), 且 SQLite 下可能遭遇写锁.
	// OnCommit 在无事务时立即执行, 有事务时排到最外层提交后, 两种路径都正确.
	persistence.OnCommit(ctx, func() { s.refresh(ctx) })
	return result, nil
}

// refresh 重新加载设置快照, 让内存快照与画像行保持一致.
// 失败不影响已提交的画像写入 (快照会在下次刷新时追上).
func (s *UserProfileService) refresh(ctx context.Context) {
	if s.manager == nil {
		return
	}
	_ = s.manager.Refresh(ctx)
}
