import React from 'react';
import { ApprovalBatchResponse } from '../../api/approvals';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { describeApprovalErrorCode } from './approvalErrors';

interface BatchResultDialogProps {
  open: boolean;
  taskLabel: '批准' | '拒绝';
  result: ApprovalBatchResponse | null;
  onClose: () => void;
}

/**
 * 批量结果弹窗: 逐项展示每条提案的结果。
 * success=false 时按 error.code 区分“已失效 (stale)”“已处理 (approval_not_pending)”
 * 等其他错误码, 不把整批结果模糊成单一“失败”。
 */
export const BatchResultDialog: React.FC<BatchResultDialogProps> = ({
  open,
  taskLabel,
  result,
  onClose
}) => {
  const results = result?.results ?? [];
  const successCount = results.filter((item) => item.success).length;
  // stale 单独计数: 它表示“请求成功但业务未生效”, 与真正的错误不同。
  const staleCount = results.filter((item) => !item.success && item.error?.code === 'stale').length;
  const failureCount = results.length - successCount - staleCount;

  return (
    <Modal open={open} title={`批量${taskLabel}结果`} size="lg" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-body-md text-on-surface-variant">
          共 {results.length} 条: <span className="text-on-surface">成功 {successCount}</span>
          {staleCount > 0 && <>，已失效 {staleCount}</>}
          {failureCount > 0 && <>，失败 {failureCount}</>}。批量操作逐条独立执行, 失败项不影响其他条目。
        </p>

        <ul className="divide-y divide-outline-variant/25 overflow-hidden rounded-xl border border-outline-variant/40">
          {results.map((item) => {
            const error = item.error;
            const isStale = !item.success && error?.code === 'stale';
            return (
              <li key={item.id} className="grid gap-1 px-3.5 py-2.5 sm:grid-cols-[6rem_minmax(0,1fr)] sm:items-start sm:gap-4">
                <span className="font-mono text-[12px] text-on-surface">#{item.id}</span>
                <div className="flex flex-wrap items-center gap-2">
                  {item.success ? (
                    <Badge tone="success">成功</Badge>
                  ) : isStale ? (
                    <Badge tone="warning">已失效</Badge>
                  ) : (
                    <Badge tone="danger">失败</Badge>
                  )}
                  {error !== undefined && (
                    <span className="text-body-sm text-on-surface-variant">
                      {describeApprovalErrorCode(error.code, error.message)}
                      <span className="ml-1 font-mono text-[11px] text-on-surface-variant">({error.code})</span>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex justify-end">
          <Button onClick={onClose}>关闭</Button>
        </div>
      </div>
    </Modal>
  );
};
