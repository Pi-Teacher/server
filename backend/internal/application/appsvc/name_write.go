package appsvc

import (
	"context"
	"sync"
)

// knowledgeNameWriteMu 串行化单实例内 Topic.name 与 Glossary.term 的关键写操作.
// 数据库不使用名称唯一索引, 因此必须让“检查名称—覆盖同名回收站记录—写入”
// 在进程内按顺序执行, 避免并发请求同时通过存在性检查.
var knowledgeNameWriteMu sync.Mutex

type knowledgeNameWriteKey struct{}

// SerializeKnowledgeNameWrite 在单实例内串行执行名称关键写操作.
// context 标记使审批、CLI 幂等中间件和领域服务可以嵌套调用而不重复加锁.
// 最外层应在开启数据库事务前调用, 保持锁顺序始终为“进程锁 -> 数据库事务”.
func SerializeKnowledgeNameWrite(ctx context.Context, fn func(context.Context) error) error {
	if held, _ := ctx.Value(knowledgeNameWriteKey{}).(bool); held {
		return fn(ctx)
	}
	knowledgeNameWriteMu.Lock()
	defer knowledgeNameWriteMu.Unlock()
	return fn(context.WithValue(ctx, knowledgeNameWriteKey{}, true))
}
