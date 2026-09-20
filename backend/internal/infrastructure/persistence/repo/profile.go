package repo

import (
	"context"
	"errors"
	"time"

	"gorm.io/gorm"

	"github.com/Pi-Teacher/server/internal/infrastructure/persistence/model"
	"github.com/Pi-Teacher/server/internal/platform/settings"
)

// UserProfileKey 是用户画像在 setting_keys 中的 key.
// 画像与其他设置共用这张表, 但读写语义不同 (带乐观锁), 因此走独立仓库.
const UserProfileKey = "user_profile"

// UserProfileRow 是用户画像行. Exists 为 false 表示 setting_keys 中
// 尚无该行 (GET 时按 version=0、空画像返回).
type UserProfileRow struct {
	Profile string
	Version int64
	Exists  bool
}

// UserProfileRepository 读写 setting_keys 中的 user_profile 行.
// 直接操作该行而不是通用设置快照, 因为需要 setting_keys.version 做条件更新.
type UserProfileRepository struct {
	db *gorm.DB
}

// NewUserProfileRepository 构造用户画像仓库.
func NewUserProfileRepository(db *gorm.DB) *UserProfileRepository {
	return &UserProfileRepository{db: db}
}

// WithTx 返回绑定到给定事务句柄的仓库副本.
func (r *UserProfileRepository) WithTx(tx *gorm.DB) *UserProfileRepository {
	return &UserProfileRepository{db: tx}
}

// Get 读取画像当前值. 行不存在时 Exists=false, 不算错误.
func (r *UserProfileRepository) Get(ctx context.Context) (UserProfileRow, error) {
	var row model.SettingKey
	err := r.db.WithContext(ctx).Where("setting_key = ?", UserProfileKey).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return UserProfileRow{Exists: false}, nil
	}
	if err != nil {
		return UserProfileRow{}, err
	}
	return UserProfileRow{Profile: row.SettingValue, Version: row.Version, Exists: true}, nil
}

// UpdateConditional 按 expected_version 条件更新画像, 同时 version 加一
// 并刷新 updated_at. 返回是否恰好命中一行; 未命中说明版本已变或行不存在.
func (r *UserProfileRepository) UpdateConditional(
	ctx context.Context, expectedVersion int64, profile string, now time.Time,
) (bool, error) {
	res := r.db.WithContext(ctx).
		Model(&model.SettingKey{}).
		Where("setting_key = ? AND version = ?", UserProfileKey, expectedVersion).
		Updates(map[string]any{
			"setting_value": profile,
			"version":       gorm.Expr("version + 1"),
			"updated_at":    now,
		})
	if res.Error != nil {
		return false, res.Error
	}
	return res.RowsAffected == 1, nil
}

// Create 在行缺失时插入画像行 (expected_version=0 的首次写入), 初始 version=1.
func (r *UserProfileRepository) Create(ctx context.Context, profile string, now time.Time) error {
	row := model.SettingKey{
		SettingKey:   UserProfileKey,
		SettingValue: profile,
		ValueType:    int16(settings.TypeString),
		Version:      1,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	return r.db.WithContext(ctx).Create(&row).Error
}
