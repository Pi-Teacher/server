import React from 'react';
import { ApprovalOperation } from '../../api/approvals';
import { asRecord, payloadFields, PayloadFieldSpec } from './approvalPayload';

/**
 * 批准时可编辑的 payload 表单。
 *
 * 只允许编辑原 payload 中已存在的字段, 不会新增字段: 这样提交回后端的
 * 对象始终是这份 operation 的合法 payload (后端使用 DisallowUnknownFields)。
 * `expected_version` / `source_card_ids` 由后端以 target 快照为准, 只读展示。
 */
const readOnlyKeys = new Set(['expected_version', 'source_card_ids']);

export const isEditableField = (key: string): boolean => !readOnlyKeys.has(key);

const numberInputValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  return '';
};

export interface ApprovalPayloadEditorProps {
  operation: ApprovalOperation;
  /** 以原 payload 为基础的可编辑副本。 */
  value: Record<string, unknown>;
  disabled?: boolean;
  onChange: (next: Record<string, unknown>) => void;
}

export const ApprovalPayloadEditor: React.FC<ApprovalPayloadEditorProps> = ({
  operation,
  value,
  disabled = false,
  onChange
}) => {
  const fields = payloadFields(operation);
  const record = asRecord(value) ?? {};
  const presentFields = fields.filter((field) => field.key in record);

  if (presentFields.length === 0) {
    return (
      <p className="text-body-sm text-on-surface-variant">
        该操作没有可编辑字段, 将按原 payload 批准。
      </p>
    );
  }

  const setValue = (key: string, next: unknown) => {
    onChange({ ...record, [key]: next });
  };

  const inputClass =
    'mt-1 w-full rounded-xl border border-outline-variant/60 bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <div className="space-y-3">
      {presentFields.map((field: PayloadFieldSpec) => {
        const raw = record[field.key];
        const editable = isEditableField(field.key);
        const fieldId = `approval-field-${field.key}`;

        if (!editable) {
          return (
            <div key={field.key} className="rounded-xl border border-outline-variant/40 bg-surface-container-low/60 px-3 py-2">
              <p className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">
                {field.label}（只读）
              </p>
              <p className="mt-1 font-mono text-[13px] text-on-surface">
                {typeof raw === 'object' ? JSON.stringify(raw) : String(raw ?? '未提供')}
              </p>
              <p className="mt-1 text-[11px] text-on-surface-variant">
                批准时由后端以提案时的目标版本快照为准, 不接受修改。
              </p>
            </div>
          );
        }

        if (field.kind === 'boolean') {
          return (
            <label key={field.key} htmlFor={fieldId} className="flex items-center gap-3">
              <input
                id={fieldId}
                type="checkbox"
                checked={raw === true}
                disabled={disabled}
                onChange={(event) => setValue(field.key, event.target.checked)}
                className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <span className="text-label-md text-on-surface">{field.label}</span>
            </label>
          );
        }

        if (field.kind === 'number') {
          return (
            <label key={field.key} htmlFor={fieldId} className="block">
              <span className="text-label-md text-on-surface">{field.label}</span>
              <input
                id={fieldId}
                type="number"
                inputMode="numeric"
                value={numberInputValue(raw)}
                disabled={disabled}
                // 清空表示 null; card_update 的 topic_id 为空即"设为无 Topic"。
                onChange={(event) => {
                  const text = event.target.value;
                  setValue(field.key, text === '' ? null : Number(text));
                }}
                className={inputClass}
              />
            </label>
          );
        }

        if (field.kind === 'multiline') {
          return (
            <label key={field.key} htmlFor={fieldId} className="block">
              <span className="text-label-md text-on-surface">{field.label}</span>
              <textarea
                id={fieldId}
                rows={4}
                value={raw === null || raw === undefined ? '' : String(raw)}
                disabled={disabled}
                onChange={(event) => setValue(field.key, event.target.value)}
                className={`${inputClass} resize-y`}
              />
            </label>
          );
        }

        return (
          <label key={field.key} htmlFor={fieldId} className="block">
            <span className="text-label-md text-on-surface">{field.label}</span>
            <input
              id={fieldId}
              type="text"
              value={raw === null || raw === undefined ? '' : String(raw)}
              disabled={disabled}
              onChange={(event) => setValue(field.key, event.target.value)}
              className={inputClass}
            />
          </label>
        );
      })}
    </div>
  );
};

/**
 * 用编辑结果生成提交 payload: 以原始对象为键集合, 只覆盖被改动字段的值,
 * 保证不引入新键。值完全未变化时返回 null, 交由调用方发送 `{}`。
 */
export const buildApprovedPayload = (
  original: unknown,
  edited: Record<string, unknown>
): Record<string, unknown> | null => {
  const base = asRecord(original);
  if (base === null) return null;
  const next: Record<string, unknown> = {};
  Object.keys(base).forEach((key) => {
    next[key] = key in edited ? edited[key] : base[key];
  });
  return JSON.stringify(next) === JSON.stringify(base) ? null : next;
};
