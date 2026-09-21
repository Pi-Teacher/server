import React from 'react';
import { ApprovalOperation } from '../../api/approvals';
import { asRecord, payloadFields, payloadValueToText } from './approvalPayload';

interface ApprovalPayloadFieldsProps {
  operation: ApprovalOperation;
  payload: unknown;
  /** 值相对另一份 payload 发生变化时高亮, 用于对比 original/approved。 */
  changedKeys?: ReadonlySet<string>;
  emptyHint?: string;
}

const valueNode = (value: unknown): React.ReactNode => {
  if (value === undefined || value === null) {
    return <span className="text-on-surface-variant">未提供</span>;
  }
  if (typeof value === 'boolean') {
    return <span>{value ? '是' : '否'}</span>;
  }
  if (typeof value === 'object') {
    return (
      <pre className="overflow-x-auto rounded-lg bg-surface-container-high/50 px-3 py-2 font-mono text-[12px] text-on-surface">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  const text = payloadValueToText(value) ?? '';
  if (text.includes('\n')) {
    return <span className="whitespace-pre-wrap break-words">{text}</span>;
  }
  return <span className="break-words">{text}</span>;
};

/**
 * 按 operation 显式列出的 payload 字段渲染为可读表单。
 * 不假设所有 payload 结构相同; 未知字段不渲染, 结构异常时回退为原始 JSON。
 */
export const ApprovalPayloadFields: React.FC<ApprovalPayloadFieldsProps> = ({
  operation,
  payload,
  changedKeys,
  emptyHint = '（无 payload）'
}) => {
  const record = asRecord(payload);
  if (record === null) {
    return <p className="text-body-sm text-on-surface-variant">{emptyHint}</p>;
  }

  const fields = payloadFields(operation);
  const knownKeys = new Set(fields.map((field) => field.key));
  // operation 未登记或 payload 含未登记字段时, 完整回退展示原始 JSON, 不丢信息。
  const extraKeys = Object.keys(record).filter((key) => !knownKeys.has(key));

  return (
    <div className="space-y-3">
      {fields.length > 0 && (
        <dl className="divide-y divide-outline-variant/25 overflow-hidden rounded-xl border border-outline-variant/40">
          {fields.map((field) => {
            const changed = changedKeys?.has(field.key) ?? false;
            return (
              <div key={field.key} className="grid gap-1 px-3.5 py-2.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-start sm:gap-4">
                <dt className="flex items-center gap-2 font-mono text-[12px] text-on-surface-variant">
                  {field.label}
                  {changed && (
                    <span className="rounded-full bg-ai-proposal-bg px-2 py-0.5 font-mono text-[10px] text-ai-proposal-text">已修改</span>
                  )}
                </dt>
                <dd className="text-body-md text-on-surface">{valueNode(record[field.key])}</dd>
              </div>
            );
          })}
        </dl>
      )}

      {extraKeys.length > 0 && (
        <div>
          <p className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">其他字段</p>
          <pre className="mt-1 overflow-x-auto rounded-lg bg-surface-container-high/50 px-3 py-2 font-mono text-[12px] text-on-surface">
            {JSON.stringify(
              extraKeys.reduce<Record<string, unknown>>((acc, key) => {
                acc[key] = record[key];
                return acc;
              }, {}),
              null,
              2
            )}
          </pre>
        </div>
      )}
    </div>
  );
};
