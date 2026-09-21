import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApprovalDetail,
  approveApprovalMutationOptions,
  approvalDetailQueryKey,
  approvalDetailQueryOptions
} from '../../api/approvals';
import { getApiErrorMessage } from '../../api/client';
import { describeApprovalError } from './approvalErrors';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { ApprovalPayloadEditor, buildApprovedPayload } from './ApprovalPayloadEditor';
import { ApprovalStatusBadge } from './ApprovalStatusBadge';
import { operationLabels } from './approvalLabels';
import { asRecord } from './approvalPayload';

interface ApprovalApproveDialogProps {
  approvalId: number | null;
  open: boolean;
  onClose: () => void;
  /** 提交成功 (含变为 stale) 后通知页面刷新列表与提示。 */
  onProcessed: (approval: ApprovalDetail) => void;
}

// 错误文案由 approvalErrors 统一提供, 与批量结果保持同一套码到文案的映射。
const approveErrorMessage = (error: unknown): string => describeApprovalError(error);

/**
 * 批准弹窗: 允许编辑 payload 后提交; 不做修改时发送 `{}` 表示按原 payload 批准。
 * 后端要求请求体必须是合法 JSON, 因此绝不发送真正的空 body。
 */
export const ApprovalApproveDialog: React.FC<ApprovalApproveDialogProps> = ({
  approvalId,
  open,
  onClose,
  onProcessed
}) => {
  const queryClient = useQueryClient();
  const detailQuery = useQuery(approvalDetailQueryOptions(open ? approvalId ?? 0 : 0));
  const approveMutation = useMutation(approveApprovalMutationOptions());

  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const [submitError, setSubmitError] = useState<string>();
  // 防止同一帧内重复提交 (React Query 的 isPending 需要一帧才反映)。
  const submitLockRef = useRef(false);
  // 只在首次拿到详情或 id 变化时初始化草稿, 避免 refetch 覆盖用户编辑。
  const loadedIdRef = useRef<number | null>(null);

  useEffect(() => {
    const data = detailQuery.data;
    if (data === undefined || !open) return;
    if (loadedIdRef.current === data.id) return;
    loadedIdRef.current = data.id;
    const base = asRecord(data.original_payload);
    setDraft(base === null ? {} : { ...base });
    setSubmitError(undefined);
  }, [detailQuery.data, open]);

  useEffect(() => {
    if (!open) {
      loadedIdRef.current = null;
      submitLockRef.current = false;
      setSubmitError(undefined);
    }
  }, [open]);

  const isSubmitting = approveMutation.isPending;
  const editableDraft = useMemo(() => draft ?? {}, [draft]);

  const handleSubmit = () => {
    const data = detailQuery.data;
    if (data === undefined || isSubmitting) return;
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitError(undefined);

    const payload = buildApprovedPayload(data.original_payload, editableDraft);
    approveMutation.mutate(
      payload === null ? { id: data.id } : { id: data.id, payload },
      {
        onSuccess: (updated) => {
          submitLockRef.current = false;
          void queryClient.invalidateQueries({ queryKey: approvalDetailQueryKey(updated.id) });
          void queryClient.invalidateQueries({ queryKey: ['approvals', 'list'] });
          onProcessed(updated);
        },
        onError: (error: unknown) => {
          submitLockRef.current = false;
          // 业务失败 (含 422 已处理) 刷新列表, 保留弹窗上下文供用户阅读。
          void queryClient.invalidateQueries({ queryKey: ['approvals', 'list'] });
          setSubmitError(approveErrorMessage(error));
        }
      }
    );
  };

  let body: React.ReactNode;
  if (detailQuery.isPending) {
    body = <LoadingState title="正在加载待批准 payload" description="正在读取 original_payload。" />;
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

        <p className="text-body-sm text-on-surface-variant">
          可直接批准原始 payload, 也可修改下方字段后再批准。未做修改时按 original_payload 生效。
        </p>

        <ApprovalPayloadEditor
          operation={detail.operation}
          value={editableDraft}
          disabled={isSubmitting || nonPending}
          onChange={setDraft}
        />

        {nonPending && (
          <p role="alert" className="rounded-xl border border-outline-variant/50 bg-surface-container-high/50 px-3 py-2 text-body-sm text-on-surface">
            该提案当前状态为「{detail.status === 'stale' ? '已失效' : detail.status}」, 无法再次批准。
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
          <Button onClick={handleSubmit} isLoading={isSubmitting} disabled={nonPending}>
            确认批准
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Modal open={open} title="批准提案" size="lg" onClose={onClose}>
      {body}
    </Modal>
  );
};
