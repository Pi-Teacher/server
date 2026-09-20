package persistence

import (
	"context"
	"sync"

	"gorm.io/gorm"
)

// txKey 是 context 中携带事务句柄的私有键.
// 用空结构体避免与其他包的键冲突, 也不导出类型.
type txKey struct{}

// commitKey 是 context 中携带"提交后回调"集合的私有键.
type commitKey struct{}

// commitHooks 收集当前事务成功提交后要执行的回调.
// 只在 RunInTx 开启的最外层事务上存在; 并发下用互斥锁保护.
type commitHooks struct {
	mu  sync.Mutex
	fns []func()
}

// add 追加一个回调.
func (h *commitHooks) add(fn func()) {
	h.mu.Lock()
	h.fns = append(h.fns, fn)
	h.mu.Unlock()
}

// run 顺序执行全部回调. 回调在事务提交之后调用, 只做轻量副作用
// (如唤醒后台 worker), 不得再依赖事务句柄.
func (h *commitHooks) run() {
	h.mu.Lock()
	fns := h.fns
	h.fns = nil
	h.mu.Unlock()
	for _, fn := range fns {
		fn()
	}
}

// WithTx 把事务句柄放进 context, 让服务层写方法复用调用方事务.
// CLI 写请求的幂等包装用它把幂等记录、审批提案与领域修改收进同一事务.
func WithTx(ctx context.Context, tx *gorm.DB) context.Context {
	return context.WithValue(ctx, txKey{}, tx)
}

// TxFrom 返回 context 中的事务句柄, 不存在时为 nil.
func TxFrom(ctx context.Context) *gorm.DB {
	tx, _ := ctx.Value(txKey{}).(*gorm.DB)
	return tx
}

// OnCommit 登记一个"当前事务提交成功后"执行的回调.
//
// 服务层写方法常在事务内调用 (直接 HTTP 请求自开事务; CLI 幂等包装与
// 审批批准复用外层事务). 若在事务内直接通知后台 worker, 通知可能先于
// 提交到达, worker 扫描不到新行, 形成一次丢失唤醒. 用 OnCommit 把通知
// 推迟到最外层事务提交之后即可消除该窗口.
//
// ctx 不带事务时立即执行: 此时没有待提交的修改, 语义与"已经提交"一致.
func OnCommit(ctx context.Context, fn func()) {
	h, _ := ctx.Value(commitKey{}).(*commitHooks)
	if h == nil {
		fn()
		return
	}
	h.add(fn)
}

// RunInTx 在 ctx 已携带事务时直接复用该事务执行 fn, 否则新开事务执行.
//
// fn 同时拿到 tx 与一个把该 tx 注入后的 ctx: 嵌套调用下层服务方法时
// 必须传这个 ctx, 下层才能复用同一事务而不另开新事务 (另开会死锁).
// 服务层写方法统一走这里: 普通 HTTP 请求各自开事务, 而 CLI 写请求由
// 幂等包装预先开启事务放进 ctx, 使响应捕获与业务修改原子提交.
//
// 最外层事务提交成功后, 逐个执行期间通过 OnCommit 登记的回调.
func RunInTx(ctx context.Context, db *gorm.DB, fn func(ctx context.Context, tx *gorm.DB) error) error {
	if tx := TxFrom(ctx); tx != nil {
		return fn(ctx, tx)
	}
	hooks := &commitHooks{}
	txCtx := context.WithValue(ctx, commitKey{}, hooks)
	err := db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return fn(WithTx(txCtx, tx), tx)
	})
	if err == nil {
		hooks.run()
	}
	return err
}
