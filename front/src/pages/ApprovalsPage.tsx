import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApprovalBatchResponse,
  ApprovalDetail,
  ApprovalListItem,
  ApprovalStatusFilter,
  ApprovalsListParams,
  approvalAPIKeyNamesQueryOptions,
  approvalsListQueryOptions,
  batchApproveApprovalsMutationOptions,
  batchRejectApprovalsMutationOptions
} from '../api/approvals';
import { getApiErrorMessage } from '../api/client';
import { Button } from '../components/ui/Button';
import { Pagination } from '../components/ui/Pagination';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States';
import { Toast } from '../components/ui/Toast';
import { ApprovalApproveDialog } from '../features/approvals/ApprovalApproveDialog';
import { ApprovalBatchActions } from '../features/approvals/ApprovalBatchActions';
import { ApprovalRejectDialog } from '../features/approvals/ApprovalRejectDialog';
import { ApprovalFilters } from '../features/approvals/ApprovalFilters';
import { ApprovalDetailModal } from '../features/approvals/ApprovalDetailModal';
import { ApprovalList } from '../features/approvals/ApprovalList';
import { BatchResultDialog } from '../features/approvals/BatchResultDialog';

/**
 * 阶段 6 审批页面: 列表/筛选/分页, 详情, 单条批准与拒绝, 批量批准/拒绝。
 */
export const ApprovalsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ApprovalStatusFilter>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [detailId, setDetailId] = useState<number | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [approveId, setApproveId] = useState<number | null>(null);
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string>();
  const [batchResult, setBatchResult] = useState<ApprovalBatchResponse | null>(null);
  const [isBatchResultOpen, setIsBatchResultOpen] = useState(false);
  const [batchLabel, setBatchLabel] = useState<'批准' | '拒绝'>('批准');
  const [batchError, setBatchError] = useState<string>();

  const batchApproveMutation = useMutation(batchApproveApprovalsMutationOptions());
  const batchRejectMutation = useMutation(batchRejectApprovalsMutationOptions());

  const queryParams = useMemo<ApprovalsListParams>(
    () => ({ page, pageSize, status }),
    [page, pageSize, status]
  );

  const approvalsQuery = useQuery(approvalsListQueryOptions(queryParams));
  const apiKeysQuery = useQuery(approvalAPIKeyNamesQueryOptions());

  const apiKeyNameMap = useMemo(() => {
    const map = new Map<number, string>();
    apiKeysQuery.data?.items.forEach((key) => map.set(key.id, key.name));
    return map;
  }, [apiKeysQuery.data]);

  const currentPageItems = approvalsQuery.data?.items ?? [];
  const isPendingApproval = (approval: ApprovalListItem) => approval.status === 'pending';
  const selectedCount = selectedIds.size;

  const handleStatusChange = (next: ApprovalStatusFilter) => {
    setStatus(next);
    setSelectedIds(new Set());
    setPage(1);
  };
  const handlePageSizeChange = (next: number) => {
    setPageSize(next);
    setSelectedIds(new Set());
    setPage(1);
  };
  const handlePageChange = (next: number) => {
    setSelectedIds(new Set());
    setPage(next);
  };
  const handleSelectionChange = (id: number, selected: boolean) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const handleOpenDetail = (id: number) => {
    setDetailId(id);
    setIsDetailOpen(true);
  };
  const handleOpenApprove = (id: number) => {
    setSuccessMessage(undefined);
    setApproveId(id);
    setIsApproveOpen(true);
  };
  const handleOpenReject = (id: number) => {
    setSuccessMessage(undefined);
    setRejectId(id);
    setIsRejectOpen(true);
  };
  const closeApprove = () => {
    setIsApproveOpen(false);
    setApproveId(null);
  };
  const closeReject = () => {
    setIsRejectOpen(false);
    setRejectId(null);
  };

  // 单条批准可能直接生效, 也可能因目标失效变为 stale; 两种都算本次请求成功。
  const handleApproveProcessed = (approval: ApprovalDetail) => {
    closeApprove();
    setSelectedIds(new Set());
    if (approval.status === 'stale') {
      setSuccessMessage(
        `提案 #${approval.id} 的目标已变化, 该提案已失效, 未执行任何修改${approval.reason !== null ? `（${approval.reason}）` : ''}`
      );
    } else {
      setSuccessMessage(`提案 #${approval.id} 已批准并生效`);
    }
  };

  const handleRejectProcessed = (approval: ApprovalDetail) => {
    closeReject();
    setSelectedIds(new Set());
    setSuccessMessage(`提案 #${approval.id} 已拒绝`);
  };

  const isBatchSubmitting = batchApproveMutation.isPending || batchRejectMutation.isPending;

  // 批量结束后按各类结果计数给出汇总提示; 逐项明细在结果弹窗查看。
  const handleBatchSuccess = (label: '批准' | '拒绝', response: ApprovalBatchResponse) => {
    setBatchLabel(label);
    setBatchResult(response);
    setBatchError(undefined);
    setIsBatchResultOpen(true);
    setSelectedIds(new Set());
    void queryClient.invalidateQueries({ queryKey: ['approvals', 'list'] });
    const success = response.results.filter((item) => item.success).length;
    const stale = response.results.filter((item) => !item.success && item.error?.code === 'stale').length;
    const parts = [`成功 ${success} 条`];
    if (stale > 0) parts.push(`已失效 ${stale} 条`);
    const failed = response.results.length - success - stale;
    if (failed > 0) parts.push(`失败 ${failed} 条`);
    setSuccessMessage(`批量${label}完成: ${parts.join('，')}。`);
  };

  const handleBatchApprove = () => {
    if (selectedIds.size === 0 || isBatchSubmitting) return;
    setSuccessMessage(undefined);
    setBatchError(undefined);
    batchApproveMutation.mutate(Array.from(selectedIds), {
      onSuccess: (response) => handleBatchSuccess('批准', response),
      onError: (error: unknown) => setBatchError(getApiErrorMessage(error))
    });
  };

  const handleBatchReject = () => {
    if (selectedIds.size === 0 || isBatchSubmitting) return;
    setSuccessMessage(undefined);
    setBatchError(undefined);
    batchRejectMutation.mutate(
      { ids: Array.from(selectedIds), reason: '' },
      {
        onSuccess: (response) => handleBatchSuccess('拒绝', response),
        onError: (error: unknown) => setBatchError(getApiErrorMessage(error))
      }
    );
  };

  const returnedCount = currentPageItems.length;
  const total = approvalsQuery.data?.total ?? 0;
  const responsePageSize = approvalsQuery.data?.page_size ?? pageSize;

  let content: React.ReactNode;
  if (approvalsQuery.isPending) {
    content = <LoadingState title="正在加载提案" description="正在读取当前筛选范围内的审批请求。" />;
  } else if (approvalsQuery.isError) {
    content = (
      <ErrorState
        title="提案加载失败"
        description={getApiErrorMessage(approvalsQuery.error)}
        onRetry={() => void approvalsQuery.refetch()}
      />
    );
  } else if (approvalsQuery.data.items.length === 0) {
    content = (
      <EmptyState
        title="没有符合条件的提案"
        description="可以切换状态筛选条件, 或通过 CLI 使用已开启审批的操作提交新的提案。"
      />
    );
  } else {
    content = (
      <>
        <ApprovalList
          approvals={approvalsQuery.data.items}
          apiKeyNameMap={apiKeyNameMap}
          selectedIds={selectedIds}
          selectable={isPendingApproval}
          actionsDisabled={isBatchSubmitting}
          onSelectionChange={handleSelectionChange}
          onOpenDetail={handleOpenDetail}
          onApprove={handleOpenApprove}
          onReject={handleOpenReject}
        />
        <div className="rounded-2xl border border-outline-variant/35 bg-surface-container-lowest px-4 py-4 shadow-subtle sm:px-5">
          <Pagination
            page={approvalsQuery.data.page}
            pageSize={responsePageSize}
            total={approvalsQuery.data.total}
            onPageChange={handlePageChange}
          />
        </div>
      </>
    );
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-surface lg:min-h-screen">
      <header className="border-b border-outline-variant/30 bg-surface-container-lowest px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-label-sm uppercase tracking-widest text-primary">阶段 6</p>
            <h1 className="mt-1 text-headline-md text-on-surface">提案审批</h1>
            <p className="mt-2 max-w-3xl text-body-md text-on-surface-variant">
              查看 CLI 提交的待审批提案, 按状态筛选并定位需要处理的变更。
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => void approvalsQuery.refetch()}
            disabled={approvalsQuery.isFetching}
            isLoading={approvalsQuery.isFetching}
          >
            {!approvalsQuery.isFetching && (
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">refresh</span>
            )}
            刷新列表
          </Button>
        </div>
      </header>

      <main className="space-y-4 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        {/* 操作反馈提到列表之上, 保证最后一堆空列表时仍能看见成功/失败提示。 */}
        {successMessage !== undefined && <Toast message={successMessage} tone="success" />}
        {batchError !== undefined && <Toast message={batchError} tone="error" />}

        <ApprovalFilters
          status={status}
          pageSize={pageSize}
          disabled={approvalsQuery.isPending}
          onStatusChange={handleStatusChange}
          onPageSizeChange={handlePageSizeChange}
        />

        {selectedIds.size > 0 && (
          <ApprovalBatchActions
            selectedCount={selectedIds.size}
            isSubmitting={isBatchSubmitting}
            onBatchApprove={handleBatchApprove}
            onBatchReject={handleBatchReject}
            onClearSelection={() => setSelectedIds(new Set())}
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 px-1 font-mono text-[11px] text-on-surface-variant">
          <span>
            当前页 {returnedCount} 条{approvalsQuery.data !== undefined ? `，筛选结果共 ${total} 条` : ''}
            {selectedCount > 0 ? `，已选 ${selectedCount} 条` : ''}
          </span>
          {approvalsQuery.isFetching && !approvalsQuery.isPending && (
            <span role="status" className="inline-flex items-center gap-1.5 text-primary">
              <span aria-hidden="true" className="material-symbols-outlined animate-spin text-[15px]">progress_activity</span>
              正在更新
            </span>
          )}
        </div>

        <div className="space-y-4">{content}</div>
      </main>

      <ApprovalDetailModal
        approvalId={detailId}
        open={isDetailOpen}
        apiKeyNameMap={apiKeyNameMap}
        onClose={() => {
          setIsDetailOpen(false);
          setDetailId(null);
        }}
      />

      <ApprovalApproveDialog
        approvalId={approveId}
        open={isApproveOpen}
        onClose={closeApprove}
        onProcessed={handleApproveProcessed}
      />

      <ApprovalRejectDialog
        approvalId={rejectId}
        open={isRejectOpen}
        onClose={closeReject}
        onProcessed={handleRejectProcessed}
      />

      <BatchResultDialog
        open={isBatchResultOpen}
        taskLabel={batchLabel}
        result={batchResult}
        onClose={() => {
          setIsBatchResultOpen(false);
          setBatchResult(null);
        }}
      />
    </div>
  );
};
