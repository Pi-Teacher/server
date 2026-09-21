import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApprovalDetail,
  approvalDetailQueryKey,
  approvalDetailQueryOptions,
  rejectApprovalMutationOptions
} from '../../api/approvals';
import { getApiErrorMessage } from '../../api/client';
import { describeApprovalError } from './approvalErrors';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { ApprovalStatusBadge } from './ApprovalStatusBadge';
import { operationLabels } from './approvalLabels';

interface ApprovalRejectDialogProps {
  approvalId: number | null;
  open: boolean;
  onClose: () => void;
  onProcessed: (approval: ApprovalDetail) => void;
}

const rejectErrorMessage = (error: unknown): string => describeApprovalError(error);

/**
 * 拒绝弹窗: 填写 reason (可选)。后端 reason 会 trim, 空串表示不写原因。
 * 放弃一条待审批提案即使用拒绝, 而不是后端不存在的取消状态。
 */
export const ApprovalRejectDialog: React.FC<ApprovalRejectDialogProps> = ({
  approvalId,
  open,
  onClose,
  onProcessed
}) => {
  const queryClient = useQueryClient();
  const detailQuery = useQuery(approvalDetailQueryOptions(open ? approvalId ?? 0 : 0));
  const rejectMutation = useMutation(rejectApprovalMutationOptions());

  const [reason, setReason] = useState('');
  const [submitError, setSubmitError] = useState<string>();
  const submitLockRef = useRef(false);

  useEffect(() => {
    if (!open) {
      submitLockRef.current = false;
      setReason('');
      setSubmitError(undefined);
    }
  }, [open]);

  const isSubmitting = rejectMutation.isPending;

  const handleSubmit = () => {
    const data = detailQuery.data;
    if (data === undefined || isSubmitting || submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitError(undefined);

    rejectMutation.mutate(
      { id: data.id, reason },
      {
        onSuccess: (updated) => {
          submitLockRef.current = false;
          void queryClient.invalidateQueries({ queryKey: approvalDetailQueryKey(updated.id) });
          void queryClient.invalidateQueries({ queryKey: ['approvals', 'list'] });
          onProcessed(updated);
        },
        onError: (error: unknown) => {
          submitLockRef.current = false;
          void queryClient.invalidateQueries({ queryKey: ['approvals', 'list'] });
          setSubmitError(rejectErrorMessage(error));
        }
      }
    );
  };

  let body: React.ReactNode;
  if (detailQuery.isPending) {
    body = <LoadingState title="正在加载提案" description="正在读取提案内容。" />;
  } else if (detailQuery.isError) {
    body = (
      <ErrorState
        title="提案加载失败"
        description={getApiErrorMessage(detailQuery.error)}
        onRetry={() => void detailQuery.refetch()}
      />
    );
  } else {
    const detail = detailQuery.data;
    const nonPending = detail.status !== 'pending';
    body = (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-body-sm text-on-surface-variant">
          <span className="font-mono text-[12px] text-on-surface">#{detail.id}</span>
          <span>{operationLabels[detail.operation]}</span>
          <ApprovalStatusBadge status={detail.status} />
        </div>

        <label htmlFor="approval-reject-reason" className="block">
          <span className="text-label-md text-on-surface">拒绝原因（可选）</span>
          <textarea
            id="approval-reject-reason"
            rows={3}
            value={reason}
            disabled={isSubmitting || nonPending}
            onChange={(event) => setReason(event.target.value)}
            placeholder="例如: 内容重复, 无需新增。"
            className="mt-1 w-full resize-y rounded-xl border border-outline-variant/60 bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>

        {nonPending && (
          <p role="alert" className="rounded-xl border border-outline-variant/50 bg-surface-container-high/50 px-3 py-2 text-body-sm text-on-surface">
            该提案当前状态为「{detail.status === 'stale' ? '已失效' : detail.status}」, 无法拒绝。
          </p>
        )}

        {submitError !== undefined && (
          <p role="alert" className="rounded-xl border border-error/25 bg-error-container px-3 py-2.5 text-body-sm text-on-error-container">
            {submitError}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            取消
          </Button>
          <Button variant="danger" onClick={handleSubmit} isLoading={isSubmitting} disabled={nonPending}>
            确认拒绝
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Modal open={open} title="拒绝提案" size="md" onClose={onClose}>
      {body}
    </Modal>
  );
};
