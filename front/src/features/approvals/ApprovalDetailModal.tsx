import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApprovalDetail, ApprovalTarget, approvalDetailQueryOptions } from '../../api/approvals';
import { getApiErrorMessage } from '../../api/client';
import { Modal } from '../../components/ui/Modal';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { formatDateTime } from '../../utils/datetime';
import { ApprovalPayloadFields } from './ApprovalPayloadFields';
import { ApprovalStatusBadge } from './ApprovalStatusBadge';
import { describeReason, entityTypeLabels, operationLabels, targetRoleLabels } from './approvalLabels';
import { asRecord } from './approvalPayload';

interface ApprovalDetailModalProps {
  approvalId: number | null;
  open: boolean;
  apiKeyNameMap: ReadonlyMap<number, string>;
  onClose: () => void;
}

const isIncludeCards = (payload: unknown): boolean => {
  const record = asRecord(payload);
  return record !== null && record.include_cards === true;
};

/** 计算 approved_payload 相对 original_payload 顶层值变化的 key, 用于高亮。 */
const changedKeysBetween = (original: unknown, approved: unknown): ReadonlySet<string> => {
  const before = asRecord(original);
  const after = asRecord(approved);
  const changed = new Set<string>();
  if (before === null || after === null) return changed;
  new Set([...Object.keys(before), ...Object.keys(after)]).forEach((key) => {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) changed.add(key);
  });
  return changed;
};

// targets 键在列表响应中不存在, 详情里才返回; 缺省按空数组处理。
const targetsOf = (detail: ApprovalDetail): ApprovalTarget[] => detail.targets ?? [];

/**
 * 审批详情弹窗。打开时重新请求 /approvals/{id}, 不复用列表快照,
 * 保证 targets 与 payload 是最新状态。只展示后端返回的字段。
 */
export const ApprovalDetailModal: React.FC<ApprovalDetailModalProps> = ({
  approvalId,
  open,
  apiKeyNameMap,
  onClose
}) => {
  const detailQuery = useQuery(approvalDetailQueryOptions(open ? approvalId ?? 0 : 0));

  let body: React.ReactNode;
  if (detailQuery.isPending) {
    body = <LoadingState title="正在加载提案详情" description="正在读取最新 payload、targets 与 reason。" />;
  } else if (detailQuery.isError) {
    body = (
      <ErrorState
        title="提案详情加载失败"
        description={getApiErrorMessage(detailQuery.error)}
        onRetry={() => void detailQuery.refetch()}
      />
    );
  } else {
    body = <ApprovalDetailBody detail={detailQuery.data} apiKeyNameMap={apiKeyNameMap} />;
  }

  return (
    <Modal open={open} title="提案详情" size="xl" onClose={onClose}>
      <div className="space-y-5">{body}</div>
    </Modal>
  );
};

interface ApprovalDetailBodyProps {
  detail: ApprovalDetail;
  apiKeyNameMap: ReadonlyMap<number, string>;
}

export const ApprovalDetailBody: React.FC<ApprovalDetailBodyProps> = ({ detail, apiKeyNameMap }) => {
  const reason = describeReason(detail.reason);
  const changedKeys = useMemo(
    () => changedKeysBetween(detail.original_payload, detail.approved_payload),
    [detail.approved_payload, detail.original_payload]
  );
  const targets = targetsOf(detail);

  return (
    <>
      <dl className="grid grid-cols-2 gap-3 rounded-xl border border-outline-variant/40 bg-surface-container-low p-4 font-mono text-[12px] sm:grid-cols-4">
        <div>
          <dt className="text-label-sm uppercase tracking-wider text-on-surface-variant">提案</dt>
          <dd className="mt-1 text-[14px] text-on-surface">#{detail.id}</dd>
        </div>
        <div>
          <dt className="text-label-sm uppercase tracking-wider text-on-surface-variant">操作</dt>
          <dd className="mt-1 text-[13px] text-on-surface">{operationLabels[detail.operation]}</dd>
        </div>
        <div>
          <dt className="text-label-sm uppercase tracking-wider text-on-surface-variant">对象类型</dt>
          <dd className="mt-1 text-[13px] text-on-surface">{entityTypeLabels[detail.entity_type]}</dd>
        </div>
        <div>
          <dt className="text-label-sm uppercase tracking-wider text-on-surface-variant">状态</dt>
          <dd className="mt-1">
            <ApprovalStatusBadge status={detail.status} />
          </dd>
        </div>
        <div>
          <dt className="text-label-sm uppercase tracking-wider text-on-surface-variant">来源 API Key</dt>
          <dd className="mt-1 text-[13px] text-on-surface">
            {detail.requested_by_api_key_id === null
              ? '未记录来源'
              : apiKeyNameMap.get(detail.requested_by_api_key_id) ?? `API Key #${detail.requested_by_api_key_id}`}
          </dd>
        </div>
        <div>
          <dt className="text-label-sm uppercase tracking-wider text-on-surface-variant">创建时间</dt>
          <dd className="mt-1 text-[12px] text-on-surface-variant">{formatDateTime(detail.created_at)}</dd>
        </div>
        <div>
          <dt className="text-label-sm uppercase tracking-wider text-on-surface-variant">处理时间</dt>
          <dd className="mt-1 text-[12px] text-on-surface-variant">
            {detail.processed_at === null ? '尚未处理' : formatDateTime(detail.processed_at)}
          </dd>
        </div>
      </dl>

      {detail.status === 'stale' && detail.reason !== null && (
        <div role="alert" className="rounded-xl border border-outline-variant/50 bg-surface-container-high/50 px-4 py-3">
          <p className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">已失效原因</p>
          <p className="mt-1 text-body-md text-on-surface">{reason}</p>
          <p className="mt-1 font-mono text-[11px] text-on-surface-variant">原始 reason: {detail.reason}</p>
        </div>
      )}

      {detail.status === 'rejected' && detail.reason !== null && detail.reason !== '' && (
        <section>
          <h3 className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">拒绝原因</h3>
          <p className="mt-2 whitespace-pre-wrap rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-4 text-body-md text-on-surface">
            {detail.reason}
          </p>
        </section>
      )}

      <section>
        <h3 className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">
          原始 payload (original_payload)
        </h3>
        <div className="mt-2 rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-4">
          <ApprovalPayloadFields operation={detail.operation} payload={detail.original_payload} />
        </div>
      </section>

      {detail.approved_payload !== null && (
        <section>
          <h3 className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">
            生效 payload (approved_payload)
          </h3>
          <div className="mt-2 rounded-xl border border-ai-proposal-border bg-ai-proposal-bg/40 p-4">
            <ApprovalPayloadFields
              operation={detail.operation}
              payload={detail.approved_payload}
              changedKeys={changedKeys}
            />
          </div>
        </section>
      )}

      <section>
        <h3 className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">
          目标 targets（{targets.length}）
        </h3>
        {targets.length === 0 ? (
          <p className="mt-2 text-body-sm text-on-surface-variant">该提案没有登记目标对象。</p>
        ) : (
          <ul className="mt-2 divide-y divide-outline-variant/25 overflow-hidden rounded-xl border border-outline-variant/40">
            {targets.map((target, index) => (
              <li
                key={`${target.role}-${target.entity_type}-${target.entity_id}-${index}`}
                className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5"
              >
                <span className="flex items-center gap-2 text-body-md text-on-surface">
                  <span className="rounded-full bg-surface-container-high px-2 py-0.5 font-mono text-[11px] text-on-surface-variant">
                    {targetRoleLabels[target.role] ?? target.role}
                  </span>
                  {entityTypeLabels[target.entity_type]} #{target.entity_id}
                </span>
                <span className="font-mono text-[11px] text-on-surface-variant">base_version v{target.base_version}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {detail.operation === 'topic_trash' && isIncludeCards(detail.original_payload) && (
        <div
          role="note"
          className="rounded-xl border border-fsrs-hard-border bg-fsrs-hard-bg px-4 py-3 text-body-sm text-fsrs-hard-text"
        >
          include_cards=true 表示连带回收该 Topic 下的 Card。实际影响范围以批准时当前关联内容为准,
          待审批期间新增的 Card 也会一并回收。
        </div>
      )}
    </>
  );
};
