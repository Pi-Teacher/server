import React from 'react';
import { ApprovalListItem } from '../../api/approvals';
import { formatDateTime } from '../../utils/datetime';
import { ApprovalStatusBadge } from './ApprovalStatusBadge';
import { entityTypeLabels, operationLabels } from './approvalLabels';
import { summarizePayload } from './approvalPayload';

interface ApprovalListProps {
  approvals: ApprovalListItem[];
  /** API Key 名称映射; 缺失时回退展示 `API Key #<id>`。 */
  apiKeyNameMap: ReadonlyMap<number, string>;
  selectedIds: ReadonlySet<number>;
  /** 只有 pending 可被选中批量处理。 */
  selectable: (approval: ApprovalListItem) => boolean;
  actionsDisabled?: boolean;
  onSelectionChange: (id: number, selected: boolean) => void;
  onOpenDetail: (id: number) => void;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
}

const apiKeyLabel = (id: number | null, nameMap: ReadonlyMap<number, string>): string => {
  if (id === null) return '未记录来源';
  return nameMap.get(id) ?? `API Key #${id}`;
};

// 列轨道必须与每行的单元格数一致 (选择/提案/内容/类型/状态/来源/时间/操作 = 8 列),
// 否则多出的单元格会被挤到隐式行, 图标与表头不在同一列上。
// lg 宽度不足时隐藏“对象类型”与“来源 API Key”两列 (这两项在详情弹窗仍可查看),
// 到 xl 再加回来; 其余列用 minmax 让长内容自行收缩, 避免撑破网格。
const gridClass =
  'lg:grid-cols-[2.25rem_4.5rem_minmax(0,1fr)_6rem_minmax(0,8.5rem)_7.5rem] xl:grid-cols-[2.25rem_4.5rem_minmax(0,1fr)_5.5rem_6rem_minmax(0,9rem)_8.5rem_7.5rem]';

const ApprovalRow: React.FC<{
  approval: ApprovalListItem;
  apiKeyNameMap: ReadonlyMap<number, string>;
  selected: boolean;
  selectable: boolean;
  actionsDisabled: boolean;
  onSelectionChange: (id: number, selected: boolean) => void;
  onOpenDetail: (id: number) => void;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
}> = ({
  approval,
  apiKeyNameMap,
  selected,
  selectable,
  actionsDisabled,
  onSelectionChange,
  onOpenDetail,
  onApprove,
  onReject
}) => (
  <article
    className={`grid gap-3 px-4 py-4 transition-colors sm:px-5 lg:items-center lg:gap-3 lg:py-3 ${gridClass} ${
      selected ? 'bg-primary-fixed/35' : 'hover:bg-surface-container-low/70'
    }`}
  >
    <div className="flex items-center">
      <input
        type="checkbox"
        aria-label={`选择提案 ${approval.id}`}
        checked={selected}
        disabled={!selectable || actionsDisabled}
        onChange={(event) => onSelectionChange(approval.id, event.target.checked)}
        className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
      />
    </div>

    <div className="flex items-center justify-between gap-3 lg:block">
      <span className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant lg:hidden">提案</span>
      <span className="font-mono text-[12px] text-on-surface">#{approval.id}</span>
    </div>

    <div className="min-w-0">
      <div className="flex min-w-0 items-start gap-3">
        <span aria-hidden="true" className="material-symbols-outlined mt-0.5 shrink-0 text-[19px] text-primary">{'smart_toy'}</span>
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold leading-5 text-on-surface">
            {operationLabels[approval.operation]}
          </h2>
          <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[13px] leading-5 text-on-surface-variant lg:line-clamp-1">
            {summarizePayload(approval.operation, approval.original_payload)}
          </p>
        </div>
      </div>
    </div>

    <div className="flex items-center justify-between gap-3 lg:hidden xl:block">
      <span className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant lg:hidden">对象类型</span>
      <span className="text-[13px] text-on-surface">{entityTypeLabels[approval.entity_type]}</span>
    </div>

    <div className="flex items-center justify-between gap-3 lg:block">
      <span className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant lg:hidden">状态</span>
      <ApprovalStatusBadge status={approval.status} />
    </div>

    <div className="flex items-center justify-between gap-3 lg:hidden xl:block">
      <span className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant lg:hidden">来源 API Key</span>
      <span className="block truncate text-[13px] text-on-surface" title={apiKeyLabel(approval.requested_by_api_key_id, apiKeyNameMap)}>
        {apiKeyLabel(approval.requested_by_api_key_id, apiKeyNameMap)}
      </span>
    </div>

    <div className="flex items-center justify-between gap-3 lg:block lg:text-right">
      <span className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant lg:hidden">创建时间</span>
      <time dateTime={approval.created_at} className="font-mono text-[11px] text-on-surface-variant">
        {formatDateTime(approval.created_at)}
      </time>
    </div>

    <div className="flex justify-end gap-1">
      <button
        type="button"
        aria-label={`批准提案 ${approval.id}`}
        title={selectable ? '批准' : '仅待审批提案可批准'}
        disabled={!selectable || actionsDisabled}
        onClick={() => onApprove(approval.id)}
        className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-fsrs-good-bg hover:text-fsrs-good-text disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">check_circle</span>
      </button>
      <button
        type="button"
        aria-label={`拒绝提案 ${approval.id}`}
        title={selectable ? '拒绝' : '仅待审批提案可拒绝'}
        disabled={!selectable || actionsDisabled}
        onClick={() => onReject(approval.id)}
        className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-error-container hover:text-error disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">cancel</span>
      </button>
      <button
        type="button"
        aria-label={`查看提案 ${approval.id} 详情`}
        title="查看详情"
        onClick={() => onOpenDetail(approval.id)}
        className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
      >
        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">visibility</span>
      </button>
    </div>
  </article>
);

export const ApprovalList: React.FC<ApprovalListProps> = ({
  approvals,
  apiKeyNameMap,
  selectedIds,
  selectable,
  actionsDisabled = false,
  onSelectionChange,
  onOpenDetail,
  onApprove,
  onReject
}) => (
  <section aria-label="提案列表" className="overflow-hidden rounded-2xl border border-outline-variant/35 bg-surface-container-lowest shadow-subtle">
    <div
      className={`hidden gap-3 border-b border-outline-variant/30 bg-surface-container-low/75 px-5 py-2.5 font-mono text-[11px] uppercase tracking-wider text-on-surface-variant lg:grid ${gridClass}`}
    >
      {/* 占位单元格必须真实留在 grid 流中: sr-only 是 position:absolute,
          会被移出自动排布, 导致表头后面的列全部向左错位一格。 */}
      <span aria-hidden="true" />
      <span>提案</span>
      <span>操作 / 内容</span>
      <span aria-hidden="true" className="hidden xl:block">对象类型</span>
      <span>状态</span>
      <span aria-hidden="true" className="hidden xl:block">来源 API Key</span>
      <span className="text-right">创建时间</span>
      <span aria-hidden="true" />
    </div>
    <div className="divide-y divide-outline-variant/25">
      {approvals.map((approval) => (
        <ApprovalRow
          key={approval.id}
          approval={approval}
          apiKeyNameMap={apiKeyNameMap}
          selected={selectedIds.has(approval.id)}
          selectable={selectable(approval)}
          actionsDisabled={actionsDisabled}
          onSelectionChange={onSelectionChange}
          onOpenDetail={onOpenDetail}
          onApprove={onApprove}
          onReject={onReject}
        />
      ))}
    </div>
  </section>
);
