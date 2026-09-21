import {
  ApprovalEntityType,
  ApprovalOperation,
  ApprovalStatus,
  ApprovalTargetRole
} from '../../api/approvals';

/**
 * 审批中心的展示文案映射。
 *
 * 操作/对象类型/状态的英文名严格来自后端响应, 这里只做中文化, 不新增后端
 * 不存在的字段 (例如 AI 置信度)。
 */

export const operationLabels: Record<ApprovalOperation, string> = {
  card_create: '新建 Card',
  card_update: '修改 Card',
  card_trash: '放入回收站 Card',
  card_restore: '恢复 Card',
  card_merge: '合并 Card',
  topic_create: '新建 Topic',
  topic_update: '修改 Topic',
  topic_trash: '放入回收站 Topic',
  topic_restore: '恢复 Topic',
  glossary_create: '新建 Glossary',
  glossary_update: '修改 Glossary',
  glossary_trash: '放入回收站 Glossary',
  glossary_restore: '恢复 Glossary'
};

export const entityTypeLabels: Record<ApprovalEntityType, string> = {
  topic: 'Topic',
  card: 'Card',
  glossary: 'Glossary'
};

type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

export const statusPresentation: Record<ApprovalStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: '待审批', tone: 'warning' },
  approved: { label: '已批准', tone: 'success' },
  rejected: { label: '已拒绝', tone: 'danger' },
  // stale 表示提案已因目标变更而失效, 用中性色强调"需重新检查"而非成功/失败。
  stale: { label: '已失效', tone: 'neutral' }
};

export const targetRoleLabels: Record<ApprovalTargetRole, string> = {
  target: '主对象',
  topic: '引用 Topic',
  affected_card: '连带 Card',
  source_1: '来源卡 1',
  source_2: '来源卡 2'
};

/**
 * 后端 stale 的 reason 是机器码 (在 target 校验失败时写入), 这里翻译为
 * 用户可读文案。未知码原样展示, 不臆造语义。
 */
const staleReasonLabels: Record<string, string> = {
  target_trashed: '目标对象已被放入回收站',
  target_permanently_deleted: '目标对象已被永久删除',
  target_overwritten: '目标对象已被同名内容覆盖',
  target_version_changed: '目标对象在待审批期间被修改',
  target_not_trashed: '恢复类提案的目标不在回收站中'
};

export const describeReason = (reason: string | null): string | null => {
  if (reason === null || reason === '') return null;
  return staleReasonLabels[reason] ?? reason;
};
