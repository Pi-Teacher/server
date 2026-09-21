import React from 'react';
import { Button } from '../../components/ui/Button';

interface ApprovalBatchActionsProps {
  selectedCount: number;
  isSubmitting: boolean;
  onBatchApprove: () => void;
  onBatchReject: () => void;
  onClearSelection: () => void;
}

/**
 * 批量操作工具栏, 在选中至少一条 pending 提案时出现。
 * 批量批准/拒绝逐条独立执行, 一条失败不回滚其他, 结果由结果弹窗逐项展示。
 */
export const ApprovalBatchActions: React.FC<ApprovalBatchActionsProps> = ({
  selectedCount,
  isSubmitting,
  onBatchApprove,
  onBatchReject,
  onClearSelection
}) => (
  <section
    aria-label="批量操作"
    className="flex flex-col gap-3 rounded-2xl border border-primary/25 bg-primary-fixed/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
  >
    <p className="text-body-sm text-on-surface">
      已选 <span className="font-mono text-on-surface">{selectedCount}</span> 条待审批提案。
      批量操作逐条独立执行, 失败项不会影响其他条目。
    </p>
    <div className="flex flex-wrap gap-2">
      <Button variant="ghost" onClick={onClearSelection} disabled={isSubmitting}>
        清除选择
      </Button>
      <Button variant="secondary" onClick={onBatchReject} disabled={isSubmitting}>
        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">cancel</span>
        批量拒绝
      </Button>
      <Button onClick={onBatchApprove} disabled={isSubmitting}>
        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">check_circle</span>
        批量批准
      </Button>
    </div>
  </section>
);
