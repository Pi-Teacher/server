import React from 'react';
import { APPROVAL_STATUS_OPTIONS, ApprovalStatusFilter } from '../../api/approvals';

interface ApprovalFiltersProps {
  status: ApprovalStatusFilter;
  pageSize: number;
  disabled?: boolean;
  onStatusChange: (status: ApprovalStatusFilter) => void;
  onPageSizeChange: (pageSize: number) => void;
}

const controlClassName =
  'h-10 w-full rounded-xl border border-outline-variant/60 bg-surface-container-lowest px-3 text-[13px] text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60';

/**
 * 审批列表筛选: 状态 + 每页数量。
 * 后端没有搜索/排序参数, 因此不提供搜索与排序控件。
 * 状态选项只有后端会真实写入的四种, 不含 cancelled。
 */
export const ApprovalFilters: React.FC<ApprovalFiltersProps> = ({
  status,
  pageSize,
  disabled = false,
  onStatusChange,
  onPageSizeChange
}) => (
  <section
    aria-label="审批筛选"
    className="rounded-2xl border border-outline-variant/35 bg-surface-container-lowest p-4 shadow-subtle"
  >
    <div className="grid gap-3 sm:grid-cols-2 lg:max-w-md">
      <label>
        <span className="text-label-md text-on-surface">状态</span>
        <select
          aria-label="状态"
          value={status}
          disabled={disabled}
          onChange={(event) => onStatusChange(event.target.value as ApprovalStatusFilter)}
          className={`${controlClassName} mt-2`}
        >
          <option value="">全部状态</option>
          {APPROVAL_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span className="text-label-md text-on-surface">每页数量</span>
        <select
          aria-label="每页数量"
          value={String(pageSize)}
          disabled={disabled}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className={`${controlClassName} mt-2`}
        >
          <option value="20">每页 20</option>
          <option value="50">每页 50</option>
          <option value="100">每页 100</option>
        </select>
      </label>
    </div>
  </section>
);
