import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CardRestoreResult,
  TrashKind,
  TrashedCard,
  TrashedItem,
  batchDeleteTrashItemsMutationOptions,
  batchRestoreTrashItemsMutationOptions,
  deleteTrashItemMutationOptions,
  emptyTrashMutationOptions,
  restoreTrashItemMutationOptions,
  trashListQueryOptions
} from '../api/trash';
import { topicsQueryOptions } from '../api/topics';
import { getApiErrorMessage } from '../api/client';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { PageHeader } from '../components/ui/PageHeader';
import { Pagination } from '../components/ui/Pagination';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States';
import { Toast } from '../components/ui/Toast';
import { BatchRestoreDialog } from '../features/trash/BatchRestoreDialog';
import { TrashBatchActions } from '../features/trash/TrashBatchActions';
import { TrashList } from '../features/trash/TrashList';
import { CardRestoreDialog } from '../features/trash/CardRestoreDialog';
import { TrashTabs } from '../features/trash/TrashTabs';
import {
  batchTrashErrorMessage,
  trashErrorMessage,
  trashKindLabel
} from '../features/trash/trashErrors';

const kindLabel = trashKindLabel;

const toVersionedItems = (items: readonly TrashedItem[]) =>
  items.map((item) => ({ id: item.id, expectedVersion: item.version }));

export const TrashPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<TrashKind>('cards');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedMap, setSelectedMap] = useState<Map<number, TrashedItem>>(new Map());
  const [successMessage, setSuccessMessage] = useState<string>();
  // 单个恢复 (Topic/Glossary) 的失败提示。Card 恢复在弹窗内展示错误。
  const [actionError, setActionError] = useState<string>();

  const [restoreCardTarget, setRestoreCardTarget] = useState<TrashedCard | null>(null);
  const [isCardRestoreOpen, setIsCardRestoreOpen] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<TrashedItem | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<unknown>();

  const [isBatchRestoreOpen, setIsBatchRestoreOpen] = useState(false);
  const [batchRestoreItems, setBatchRestoreItems] = useState<TrashedItem[]>([]);
  const [batchRestoreError, setBatchRestoreError] = useState<unknown>();

  const [isBatchDeleteOpen, setIsBatchDeleteOpen] = useState(false);
  const [batchDeleteItems, setBatchDeleteItems] = useState<TrashedItem[]>([]);
  const [batchDeleteError, setBatchDeleteError] = useState<unknown>();

  const [isEmptyOpen, setIsEmptyOpen] = useState(false);
  const [emptyError, setEmptyError] = useState<unknown>();

  const listQuery = useQuery(trashListQueryOptions({ kind, page, pageSize }));
  // Topic 选择器数据源复用正常 Topic 第一页全量, 仅 Card Tab 需要。
  const topicsQuery = useQuery({ ...topicsQueryOptions(), enabled: kind === 'cards' });

  const restoreMutation = useMutation(restoreTrashItemMutationOptions());
  const batchRestoreMutation = useMutation(batchRestoreTrashItemsMutationOptions());
  const deleteMutation = useMutation(deleteTrashItemMutationOptions());
  const batchDeleteMutation = useMutation(batchDeleteTrashItemsMutationOptions());
  const emptyMutation = useMutation(emptyTrashMutationOptions());

  const isSubmitting =
    restoreMutation.isPending ||
    batchRestoreMutation.isPending ||
    deleteMutation.isPending ||
    batchDeleteMutation.isPending ||
    emptyMutation.isPending;

  const currentItems = listQuery.data?.items ?? [];
  const selectedIds = useMemo(() => new Set(selectedMap.keys()), [selectedMap]);
  const allCurrentPageSelected =
    currentItems.length > 0 && currentItems.every((item) => selectedMap.has(item.id));

  // 切换 Tab 或翻页时清空选择: 选择以当前页对象为准, 避免跨页批量误操作。
  useEffect(() => {
    setSelectedMap(new Map());
  }, [kind]);

  const clearSelection = () => setSelectedMap(new Map());

  const invalidateAfterRestore = () => {
    // 恢复会改变回收站与正常列表, 并让新 Card 进入复习队列。
    void queryClient.invalidateQueries({ queryKey: ['trash'] });
    void queryClient.invalidateQueries({ queryKey: ['cards'] });
    void queryClient.invalidateQueries({ queryKey: ['topics'] });
    void queryClient.invalidateQueries({ queryKey: ['glossary'] });
    void queryClient.invalidateQueries({ queryKey: ['review'] });
  };

  const invalidateAfterDelete = () => {
    void queryClient.invalidateQueries({ queryKey: ['trash'] });
    void queryClient.invalidateQueries({ queryKey: ['cards'] });
    void queryClient.invalidateQueries({ queryKey: ['topics'] });
    void queryClient.invalidateQueries({ queryKey: ['glossary'] });
  };

  const handleKindChange = (next: TrashKind) => {
    setSuccessMessage(undefined);
    setActionError(undefined);
    setKind(next);
    setPage(1);
  };
  const handlePageSizeChange = (value: number) => {
    setPageSize(value);
    setPage(1);
  };
  const handlePageChange = (next: number) => setPage(next);

  const handleSelectionChange = (id: number, selected: boolean) => {
    const item = currentItems.find((candidate) => candidate.id === id);
    if (item === undefined) return;
    setSelectedMap((previous) => {
      const next = new Map(previous);
      if (selected) next.set(id, item);
      else next.delete(id);
      return next;
    });
  };

  const handleSelectAllCurrentPage = () => {
    setSelectedMap((previous) => {
      const next = new Map(previous);
      if (allCurrentPageSelected) {
        currentItems.forEach((item) => next.delete(item.id));
      } else {
        currentItems.forEach((item) => next.set(item.id, item));
      }
      return next;
    });
  };

  // --- 恢复 ---

  const removeFromSelection = (id: number) =>
    setSelectedMap((previous) => {
      const next = new Map(previous);
      next.delete(id);
      return next;
    });

  // Topic/Glossary 无额外参数, 直接恢复; Card 恢复需要先选择目标 Topic。
  const handleRestore = (id: number) => {
    if (isSubmitting) return;
    setSuccessMessage(undefined);
    setActionError(undefined);
    const item = currentItems.find((candidate) => candidate.id === id);
    if (item === undefined) return;
    if (kind === 'cards') {
      setRestoreCardTarget(item as TrashedCard);
      setIsCardRestoreOpen(true);
      return;
    }
    restoreMutation.mutate(
      { kind, id: item.id, expectedVersion: item.version },
      {
        onSuccess: () => {
          removeFromSelection(item.id);
          setSuccessMessage(`${kindLabel[kind]} #${item.id} 已恢复`);
          invalidateAfterRestore();
        },
        // 单个恢复失败也要可见反馈, 用 Toast 错误语气而不是静默。
        onError: (error: unknown) => setActionError(trashErrorMessage(error))
      }
    );
  };

  const handleCardRestored = (result: CardRestoreResult) => {
    setSuccessMessage(`Card #${result.trash_card_id} 已恢复为新 Card #${result.new_card_id}`);
    setActionError(undefined);
    removeFromSelection(result.trash_card_id);
    invalidateAfterRestore();
  };

  // --- 批量恢复 ---

  const openBatchRestore = () => {
    if (selectedMap.size === 0 || isSubmitting) return;
    setSuccessMessage(undefined);
    setBatchRestoreError(undefined);
    setBatchRestoreItems(Array.from(selectedMap.values()));
    setIsBatchRestoreOpen(true);
  };

  const closeBatchRestore = () => {
    if (isSubmitting) return;
    setIsBatchRestoreOpen(false);
    setBatchRestoreItems([]);
    setBatchRestoreError(undefined);
  };

  const confirmBatchRestore = (topicId: number | null) => {
    if (batchRestoreItems.length === 0 || isSubmitting) return;
    setBatchRestoreError(undefined);
    const items = batchRestoreItems;
    const input =
      kind === 'cards'
        ? {
            kind: 'cards' as const,
            items: items.map((item) => ({
              id: item.id,
              expectedVersion: item.version,
              topicId
            }))
          }
        : { kind, items: toVersionedItems(items) };
    batchRestoreMutation.mutate(input, {
      onSuccess: () => {
        setIsBatchRestoreOpen(false);
        setBatchRestoreItems([]);
        clearSelection();
        setSuccessMessage(`${items.length} 个${kindLabel[kind]}已恢复`);
        invalidateAfterRestore();
      },
      onError: (error: unknown) => setBatchRestoreError(error)
    });
  };

  // --- 永久删除 ---

  const handleDelete = (id: number) => {
    if (isSubmitting) return;
    setSuccessMessage(undefined);
    const item = currentItems.find((candidate) => candidate.id === id);
    if (item === undefined) return;
    setDeleteError(undefined);
    setDeleteTarget(item);
    setIsDeleteOpen(true);
  };

  const closeDelete = () => {
    if (isSubmitting) return;
    setIsDeleteOpen(false);
    setDeleteTarget(null);
    setDeleteError(undefined);
  };

  const confirmDelete = () => {
    if (deleteTarget === null || isSubmitting) return;
    setDeleteError(undefined);
    const target = deleteTarget;
    deleteMutation.mutate(
      { kind, id: target.id, expectedVersion: target.version },
      {
        onSuccess: () => {
          setIsDeleteOpen(false);
          setDeleteTarget(null);
          removeFromSelection(target.id);
          setSuccessMessage(`${kindLabel[kind]} #${target.id} 已永久删除`);
          invalidateAfterDelete();
        },
        onError: (error: unknown) => {
          setDeleteError(error);
          // 行数据可能已过期: 失效回收站列表让用户重新加载, 不自动重试危险写操作。
          void queryClient.invalidateQueries({ queryKey: ['trash'] });
        }
      }
    );
  };

  const openBatchDelete = () => {
    if (selectedMap.size === 0 || isSubmitting) return;
    setSuccessMessage(undefined);
    setBatchDeleteError(undefined);
    setBatchDeleteItems(Array.from(selectedMap.values()));
    setIsBatchDeleteOpen(true);
  };

  const closeBatchDelete = () => {
    if (isSubmitting) return;
    setIsBatchDeleteOpen(false);
    setBatchDeleteItems([]);
    setBatchDeleteError(undefined);
  };

  const confirmBatchDelete = () => {
    if (batchDeleteItems.length === 0 || isSubmitting) return;
    setBatchDeleteError(undefined);
    const items = batchDeleteItems;
    batchDeleteMutation.mutate(
      { kind, items: toVersionedItems(items) },
      {
        onSuccess: (result) => {
          setIsBatchDeleteOpen(false);
          setBatchDeleteItems([]);
          clearSelection();
          setSuccessMessage(`${result.deleted} 个${kindLabel[kind]}已永久删除`);
          invalidateAfterDelete();
        },
        onError: (error: unknown) => setBatchDeleteError(error)
      }
    );
  };

  // --- 清空回收站 ---

  const openEmpty = () => {
    if (isSubmitting) return;
    setSuccessMessage(undefined);
    setEmptyError(undefined);
    setIsEmptyOpen(true);
  };

  const closeEmpty = () => {
    if (isSubmitting) return;
    setIsEmptyOpen(false);
    setEmptyError(undefined);
  };

  const confirmEmpty = () => {
    if (isSubmitting) return;
    setEmptyError(undefined);
    emptyMutation.mutate(undefined, {
      onSuccess: (result) => {
        setIsEmptyOpen(false);
        clearSelection();
        setSuccessMessage(
          `回收站已清空：Card ${result.cards}、Topic ${result.topics}、术语 ${result.glossary}`
        );
        invalidateAfterDelete();
      },
      onError: (error: unknown) => setEmptyError(error)
    });
  };

  const returnedCount = currentItems.length;
  const total = listQuery.data?.total ?? 0;
  const responsePageSize = listQuery.data?.page_size ?? pageSize;
  const batchRestoreIds = batchRestoreItems.map((item) => item.id);
  const batchDeleteIds = batchDeleteItems.map((item) => item.id);

  let content: React.ReactNode;
  if (listQuery.isPending) {
    content = (
      <LoadingState
        title={`正在加载回收站${kindLabel[kind]}`}
        description="正在读取回收站中的对象。"
      />
    );
  } else if (listQuery.isError) {
    content = (
      <ErrorState
        title={`回收站${kindLabel[kind]}加载失败`}
        description={getApiErrorMessage(listQuery.error)}
        onRetry={() => void listQuery.refetch()}
      />
    );
  } else if (currentItems.length === 0) {
    content = (
      <EmptyState
        title={`回收站中没有${kindLabel[kind]}`}
        description="该类型当前没有可恢复或永久删除的对象。"
      />
    );
  } else {
    content = (
      <>
        <TrashList
          kind={kind}
          items={currentItems}
          selectedIds={selectedIds}
          actionsDisabled={isSubmitting}
          onSelectionChange={handleSelectionChange}
          onRestore={handleRestore}
          onDelete={handleDelete}
        />
        <div className="rounded-2xl border border-outline-variant/35 bg-surface-container-lowest px-4 py-4 shadow-subtle sm:px-5">
          <Pagination
            page={listQuery.data.page}
            pageSize={responsePageSize}
            total={listQuery.data.total}
            onPageChange={handlePageChange}
          />
        </div>
      </>
    );
  }

  return (
    <div className="min-h-full bg-surface">
      <PageHeader
        title="回收站"
        description="按类型恢复或永久删除已放入回收站的 Card、Topic 与术语。恢复 Card 时需指定目标 Topic 或选择无 Topic。"
      />

      <main className="space-y-4 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TrashTabs activeKind={kind} disabled={isSubmitting} onChange={handleKindChange} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="secondary"
              onClick={() => void listQuery.refetch()}
              disabled={listQuery.isFetching || isSubmitting}
              isLoading={listQuery.isFetching}
            >
              {!listQuery.isFetching && (
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">refresh</span>
              )}
              刷新列表
            </Button>
            <Button variant="danger" onClick={openEmpty} disabled={isSubmitting}>
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">delete_sweep</span>
              清空回收站
            </Button>
          </div>
        </div>

        {successMessage !== undefined && <Toast message={successMessage} tone="success" />}
        {actionError !== undefined && (
          <Toast message={actionError} tone="error" />
        )}

        {selectedMap.size > 0 && (
          <TrashBatchActions
            selectedCount={selectedMap.size}
            allCurrentPageSelected={allCurrentPageSelected}
            isSubmitting={isSubmitting}
            onSelectAllCurrentPage={handleSelectAllCurrentPage}
            onRestoreSelected={openBatchRestore}
            onDeleteSelected={openBatchDelete}
            onClearSelection={clearSelection}
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <span className="font-mono text-[11px] text-on-surface-variant">
            当前页 {returnedCount} 项{listQuery.data !== undefined ? `，共 ${total} 项` : ''}
          </span>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 font-mono text-[11px] text-on-surface-variant">
              每页数量
              <select
                aria-label="每页数量"
                value={String(pageSize)}
                disabled={listQuery.isPending || isSubmitting}
                onChange={(event) => handlePageSizeChange(Number(event.target.value))}
                className="h-9 rounded-lg border border-outline-variant/60 bg-surface-container-lowest px-2 text-[12px] text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </label>
            {listQuery.isFetching && !listQuery.isPending && (
              <span role="status" className="inline-flex items-center gap-1.5 font-mono text-[11px] text-primary">
                <span aria-hidden="true" className="material-symbols-outlined animate-spin text-[15px]">progress_activity</span>
                正在更新
              </span>
            )}
          </div>
        </div>

        <div className="space-y-4">{content}</div>
      </main>

      <CardRestoreDialog
        open={isCardRestoreOpen}
        card={restoreCardTarget}
        topics={topicsQuery.data?.items ?? []}
        onClose={() => {
          setIsCardRestoreOpen(false);
          setRestoreCardTarget(null);
        }}
        onRestored={handleCardRestored}
      />

      <BatchRestoreDialog
        open={isBatchRestoreOpen}
        kind={kind}
        count={batchRestoreItems.length}
        topics={topicsQuery.data?.items ?? []}
        isSubmitting={batchRestoreMutation.isPending}
        errorMessage={batchTrashErrorMessage(batchRestoreError, batchRestoreIds, kind)}
        onClose={closeBatchRestore}
        onConfirm={confirmBatchRestore}
      />

      <ConfirmDialog
        open={isDeleteOpen}
        title="永久删除"
        description={
          deleteTarget === null
            ? ''
            : `确定永久删除 ${kindLabel[kind]} #${deleteTarget.id} 吗？该操作不可恢复，将从回收站中彻底移除。`
        }
        confirmLabel="永久删除"
        danger
        isSubmitting={deleteMutation.isPending}
        errorMessage={trashErrorMessage(deleteError)}
        onConfirm={confirmDelete}
        onClose={closeDelete}
      />

      <ConfirmDialog
        open={isBatchDeleteOpen}
        title="批量永久删除"
        description={
          batchDeleteItems.length === 0
            ? ''
            : `确定永久删除选中的 ${batchDeleteItems.length} 个${kindLabel[kind]}吗？该操作不可恢复，整批执行，任一项失败会整批回滚。`
        }
        confirmLabel="批量永久删除"
        danger
        isSubmitting={batchDeleteMutation.isPending}
        errorMessage={batchTrashErrorMessage(batchDeleteError, batchDeleteIds, kind)}
        onConfirm={confirmBatchDelete}
        onClose={closeBatchDelete}
      />

      <ConfirmDialog
        open={isEmptyOpen}
        title="清空回收站"
        description="确定清空整个回收站吗？将永久删除全部 Card、Topic 与术语，该操作不可恢复。"
        confirmLabel="清空回收站"
        danger
        isSubmitting={emptyMutation.isPending}
        errorMessage={trashErrorMessage(emptyError)}
        onConfirm={confirmEmpty}
        onClose={closeEmpty}
      />
    </div>
  );
};
