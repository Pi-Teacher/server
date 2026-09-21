import { ApprovalOperation } from '../../api/approvals';

/**
 * 审批 payload 的解析与展示辅助。
 *
 * 不同 operation 的 payload 结构不同 (见后端 appsvc 的 payload schema),
 * 这里按 operation 显式列出字段, 不做通用 JSON 猜测。未知字段不渲染,
 * 避免把后端新增内容误当成可编辑表单。
 */

export const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

export type PayloadFieldKind = 'text' | 'multiline' | 'boolean' | 'number' | 'json';

export interface PayloadFieldSpec {
  key: string;
  label: string;
  kind: PayloadFieldKind;
}

const fieldsByOperation: Record<ApprovalOperation, PayloadFieldSpec[]> = {
  card_create: [
    { key: 'front', label: 'Front', kind: 'text' },
    { key: 'back', label: 'Back', kind: 'multiline' },
    { key: 'topic_id', label: 'Topic ID', kind: 'number' },
    { key: 'enable_embedding', label: '启用 Embedding', kind: 'boolean' }
  ],
  card_update: [
    { key: 'expected_version', label: '期望版本', kind: 'number' },
    { key: 'topic_id', label: 'Topic ID', kind: 'number' },
    { key: 'front', label: 'Front', kind: 'text' },
    { key: 'back', label: 'Back', kind: 'multiline' },
    { key: 'enable_embedding', label: '启用 Embedding', kind: 'boolean' }
  ],
  card_trash: [{ key: 'expected_version', label: '期望版本', kind: 'number' }],
  card_restore: [
    { key: 'expected_version', label: '期望版本', kind: 'number' },
    { key: 'topic_id', label: 'Topic ID', kind: 'number' }
  ],
  card_merge: [
    { key: 'source_card_ids', label: '来源 Card ID', kind: 'json' },
    { key: 'front', label: 'Front', kind: 'text' },
    { key: 'back', label: 'Back', kind: 'multiline' },
    { key: 'topic_id', label: 'Topic ID', kind: 'number' },
    { key: 'enable_embedding', label: '启用 Embedding', kind: 'boolean' }
  ],
  topic_create: [
    { key: 'name', label: '名称', kind: 'text' },
    { key: 'description', label: '描述', kind: 'multiline' }
  ],
  topic_update: [
    { key: 'expected_version', label: '期望版本', kind: 'number' },
    { key: 'name', label: '名称', kind: 'text' },
    { key: 'description', label: '描述', kind: 'multiline' }
  ],
  topic_trash: [
    { key: 'expected_version', label: '期望版本', kind: 'number' },
    { key: 'include_cards', label: '连带回收关联 Card', kind: 'boolean' }
  ],
  topic_restore: [{ key: 'expected_version', label: '期望版本', kind: 'number' }],
  glossary_create: [
    { key: 'term', label: '术语', kind: 'text' },
    { key: 'definition', label: '定义', kind: 'multiline' }
  ],
  glossary_update: [
    { key: 'expected_version', label: '期望版本', kind: 'number' },
    { key: 'term', label: '术语', kind: 'text' },
    { key: 'definition', label: '定义', kind: 'multiline' }
  ],
  glossary_trash: [{ key: 'expected_version', label: '期望版本', kind: 'number' }],
  glossary_restore: [{ key: 'expected_version', label: '期望版本', kind: 'number' }]
};

export const payloadFields = (operation: ApprovalOperation): PayloadFieldSpec[] =>
  fieldsByOperation[operation] ?? [];

/** 把 payload 值渲染为一行摘要文本; 缺失或 null 返回 null。 */
export const payloadValueToText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((item) => String(item)).join(', ');
  return JSON.stringify(value);
};

/**
 * 列表行的 payload 摘要: 取该 operation 的第一个有值字段, 让用户不必
 * 展开详情也能大致判断提案内容。
 */
export const summarizePayload = (operation: ApprovalOperation, payload: unknown): string => {
  const record = asRecord(payload);
  if (record === null) return '（无 payload）';
  for (const field of payloadFields(operation)) {
    const text = payloadValueToText(record[field.key]);
    if (text !== null && text !== '') {
      return text.replace(/\s+/g, ' ').trim();
    }
  }
  return '（无 payload）';
};
