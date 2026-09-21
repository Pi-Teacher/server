import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CardDetail,
  CardEmbeddingFilter,
  CardListItem,
  CardSort,
  CardTopicFilter,
  CardsListParams,
  SortOrder,
  batchTrashCardsMutationOptions,
  cardsListQueryOptions,
  mergeCardsMutationOptions,
  trashCardMutationOptions
} from '../api/cards';
import { ApiError, getApiErrorMessage } from '../api/client';
import { topicsQueryOptions } from '../api/topics';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Pagination } from '../components/ui/Pagination';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States';
import { Toast } from '../components/ui/Toast';
import { CardEditorModal } from '../features/cards/CardEditorModal';
import { CardList } from '../features/cards/CardList';
import { CardMergeDialog } from '../features/cards/CardMergeDialog';
import { CardTrashActions } from '../features/cards/CardTrashActions';
import { CardFilters } from '../features/cards/CardFilters';

const SEARCH_DEBOUNCE_MS = 300;

const actionErrorMessage = (error: unknown, batch = false): string | undefined => {
  if (!(error instanceof ApiError)) return error === undefined ? undefined : getApiErrorMessage(error);
  const index = error.details?.index;
  const location = batch && typeof index === 'number' ? `（批量项目 ${index + 1}）` : '';
  if (error.code === 'version_conflict') return `版本冲突: ${error.message}${location}`;
  if (error.code === 'not_found') return `Card 不存在: ${error.message}${location}`;
  if (error.code === 'validation_error') return `请求校验失败: ${error.message}${location}`;
  return `${error.message}${location}`;
};

export const CardsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchValue, setSearchValue] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [topicId, setTopicId] = useState<CardTopicFilter>(null);
  const [embeddingStatus, setEmbeddingStatus] = useState<CardEmbeddingFilter>('');
  const [sort, setSort] = useState<CardSort>('created_at');
  const [order, setOrder] = useState<SortOrder>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
  const [editingCardId, setEditingCardId] = useState<number | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string>();
  const [selectedCards, setSelectedCards] = useState<Map<number, CardListItem>>(new Map());
  const [pendingTrashItems, setPendingTrashItems] = useState<CardListItem[]>([]);
  const [isTrashConfirmOpen, setIsTrashConfirmOpen] = useState(false);
  const [trashError, setTrashError] = useState<unknown>();
  const [mergeCardIds, setMergeCardIds] = useState<[number, number] | null>(null);
  const [isMergeOpen, setIsMergeOpen] = useState(false);

  const trashMutation = useMutation(trashCardMutationOptions());
  const batchTrashMutation = useMutation(batchTrashCardsMutationOptions());
  const mergeMutation = useMutation(mergeCardsMutationOptions());

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(searchValue), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [searchValue]);

  const queryParams = useMemo<CardsListParams>(
    () => ({
      page,
      pageSize,
      topicId,
      q: debouncedSearch,
      embeddingStatus,
      sort,
      order
    }),
    [debouncedSearch, embeddingStatus, order, page, pageSize, sort, topicId]
  );

  const topicsQuery = useQuery(topicsQueryOptions());
  const cardsQuery = useQuery(cardsListQueryOptions(queryParams));

  const topicNameMap = useMemo(() => {
    const names = new Map<number, string>();
    topicsQuery.data?.items.forEach((topic) => names.set(topic.id, topic.name));
    return names;
  }, [topicsQuery.data]);

  const currentPageCards = cardsQuery.data?.items ?? [];
  const selectedCardIds = useMemo(() => new Set(selectedCards.keys()), [selectedCards]);
  const allCurrentPageSelected =
    currentPageCards.length > 0 && currentPageCards.every((card) => selectedCards.has(card.id));
  const isActionSubmitting =
    trashMutation.isPending || batchTrashMutation.isPending || mergeMutation.isPending;

  const clearSelection = () => setSelectedCards(new Map());
  const resetToFirstPage = () => {
    clearSelection();
    setPage(1);
  };
  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    resetToFirstPage();
  };
  const handleTopicChange = (value: CardTopicFilter) => {
    setTopicId(value);
    resetToFirstPage();
  };
  const handleEmbeddingStatusChange = (value: CardEmbeddingFilter) => {
    setEmbeddingStatus(value);
    resetToFirstPage();
  };
  const handleSortChange = (value: CardSort) => {
    setSort(value);
    resetToFirstPage();
  };
  const handleOrderChange = (value: SortOrder) => {
    setOrder(value);
    resetToFirstPage();
  };
  const handlePageSizeChange = (value: number) => {
    setPageSize(value);
    resetToFirstPage();
  };
  const handlePageChange = (nextPage: number) => {
    clearSelection();
    setPage(nextPage);
  };

  const handleCreate = () => {
    setSuccessMessage(undefined);
    setEditorMode('create');
    setEditingCardId(null);
    setIsEditorOpen(true);
  };
  const handleEdit = (cardId: number) => {
    setSuccessMessage(undefined);
    setEditorMode('edit');
    setEditingCardId(cardId);
    setIsEditorOpen(true);
  };
  const handleSaved = (card: CardDetail, mode: 'create' | 'edit') => {
    setIsEditorOpen(false);
    setEditingCardId(null);
    setSuccessMessage(
      mode === 'create'
        ? `Card #${card.id} 已创建`
        : `Card #${card.id} 已保存，当前 version 为 ${card.version}`
    );
    void queryClient.invalidateQueries({ queryKey: ['cards', 'list'] });
    void queryClient.invalidateQueries({ queryKey: ['topics', 'list'] });
  };

  const handleSelectionChange = (cardId: number, selected: boolean) => {
    const card = currentPageCards.find((item) => item.id === cardId);
    if (card === undefined) return;
    setSelectedCards((previous) => {
      const next = new Map(previous);
      if (selected) next.set(cardId, card);
      else next.delete(cardId);
      return next;
    });
  };

  const handleSelectAllCurrentPage = () => {
    setSelectedCards((previous) => {
      const next = new Map(previous);
      if (allCurrentPageSelected) {
        currentPageCards.forEach((card) => next.delete(card.id));
      } else {
        currentPageCards.forEach((card) => next.set(card.id, card));
      }
      return next;
    });
  };

  const openTrashConfirm = (items: CardListItem[]) => {
    if (items.length === 0) return;
    trashMutation.reset();
    batchTrashMutation.reset();
    setTrashError(undefined);
    setPendingTrashItems(items);
    setIsTrashConfirmOpen(true);
  };

  const handleSingleTrash = (cardId: number) => {
    const card = currentPageCards.find((item) => item.id === cardId) ?? selectedCards.get(cardId);
    if (card !== undefined) openTrashConfirm([card]);
  };

  const handleBatchTrash = () => openTrashConfirm(Array.from(selectedCards.values()));

  const closeTrashConfirm = () => {
    if (isActionSubmitting) return;
    setIsTrashConfirmOpen(false);
    setPendingTrashItems([]);
    setTrashError(undefined);
  };

  const handleTrashSuccess = (count: number) => {
    setIsTrashConfirmOpen(false);
    setPendingTrashItems([]);
    setTrashError(undefined);
    clearSelection();
    setSuccessMessage(`${count} 张 Card 已放入回收站`);
    void queryClient.invalidateQueries({ queryKey: ['cards', 'list'] });
    void queryClient.invalidateQueries({ queryKey: ['topics', 'list'] });
  };

  const confirmTrash = () => {
    if (pendingTrashItems.length === 0 || isActionSubmitting) return;
    setTrashError(undefined);
    if (pendingTrashItems.length === 1) {
      const item = pendingTrashItems[0];
      trashMutation.mutate(
        { id: item.id, expectedVersion: item.version },
        {
          onSuccess: () => handleTrashSuccess(1),
          onError: (error: unknown) => setTrashError(error)
        }
      );
      return;
    }
    batchTrashMutation.mutate(
      pendingTrashItems.map((item) => ({ id: item.id, expectedVersion: item.version })),
      {
        onSuccess: (result) => handleTrashSuccess(result.trashed_cards),
        onError: (error: unknown) => setTrashError(error)
      }
    );
  };

  const openMergeDialog = () => {
    const ids = Array.from(selectedCards.keys());
    if (ids.length !== 2) return;
    setMergeCardIds([ids[0], ids[1]]);
    setIsMergeOpen(true);
  };

  const handleMerged = (card: CardDetail) => {
    setIsMergeOpen(false);
    setMergeCardIds(null);
    clearSelection();
    setSuccessMessage(`Card #${card.id} 已创建，来源 Card 已放入回收站`);
    void queryClient.invalidateQueries({ queryKey: ['cards', 'list'] });
    void queryClient.invalidateQueries({ queryKey: ['topics', 'list'] });
  };

  const returnedCount = cardsQuery.data?.items.length ?? 0;
  const total = cardsQuery.data?.total ?? 0;
  const responsePageSize = cardsQuery.data?.page_size ?? pageSize;
  const trashErrorMessage = actionErrorMessage(
    trashError,
    pendingTrashItems.length > 1
  );

  let content: React.ReactNode;
  if (topicsQuery.isPending) {
    content = <LoadingState title="正在加载 Topic" description="正在准备卡片筛选条件。" />;
  } else if (topicsQuery.isError) {
    content = (
      <ErrorState
        title="Topic 加载失败"
        description={getApiErrorMessage(topicsQuery.error)}
        onRetry={() => void topicsQuery.refetch()}
      />
    );
  } else if (cardsQuery.isPending) {
    content = <LoadingState title="正在加载卡片" description="正在读取当前筛选范围内的 Card。" />;
  } else if (cardsQuery.isError) {
    content = (
      <ErrorState
        title="卡片加载失败"
        description={getApiErrorMessage(cardsQuery.error)}
        onRetry={() => void cardsQuery.refetch()}
      />
    );
  } else if (cardsQuery.data.items.length === 0) {
    content = (
      <EmptyState
        title="没有符合条件的卡片"
        description="可以调整搜索词、Topic、Embedding 状态或排序条件后重试。"
      />
    );
  } else {
    content = (
      <>
        <CardList
          cards={cardsQuery.data.items}
          topicNameMap={topicNameMap}
          selectedCardIds={selectedCardIds}
          actionsDisabled={isActionSubmitting}
          onSelectionChange={handleSelectionChange}
          onEdit={handleEdit}
          onTrash={handleSingleTrash}
        />
        <div className="rounded-2xl border border-outline-variant/35 bg-surface-container-lowest px-4 py-4 shadow-subtle sm:px-5">
          <Pagination
            page={cardsQuery.data.page}
            pageSize={responsePageSize}
            total={cardsQuery.data.total}
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
            <p className="font-mono text-label-sm uppercase tracking-widest text-primary">阶段 2</p>
            <h1 className="mt-1 text-headline-md text-on-surface">卡片管理</h1>
            <p className="mt-2 max-w-3xl text-body-md text-on-surface-variant">
              搜索并筛选正常 Card，查看 Topic、Embedding 状态、版本与更新时间。
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="secondary"
              onClick={() => void cardsQuery.refetch()}
              disabled={cardsQuery.isFetching || isActionSubmitting}
              isLoading={cardsQuery.isFetching}
            >
              {!cardsQuery.isFetching && <span aria-hidden="true" className="material-symbols-outlined text-[18px]">refresh</span>}
              刷新列表
            </Button>
            <Button onClick={handleCreate} disabled={isActionSubmitting}>
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">add</span>
              新建 Card
            </Button>
          </div>
        </div>
      </header>

      <main className="space-y-4 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        {successMessage !== undefined && <Toast message={successMessage} tone="success" />}

        <CardFilters
          searchValue={searchValue}
          topicId={topicId}
          embeddingStatus={embeddingStatus}
          sort={sort}
          order={order}
          pageSize={pageSize}
          topics={topicsQuery.data?.items ?? []}
          disabled={topicsQuery.isPending || isActionSubmitting}
          onSearchChange={handleSearchChange}
          onTopicChange={handleTopicChange}
          onEmbeddingStatusChange={handleEmbeddingStatusChange}
          onSortChange={handleSortChange}
          onOrderChange={handleOrderChange}
          onPageSizeChange={handlePageSizeChange}
        />

        {selectedCards.size > 0 && (
          <CardTrashActions
            selectedCount={selectedCards.size}
            allCurrentPageSelected={allCurrentPageSelected}
            isSubmitting={isActionSubmitting}
            errorMessage={trashErrorMessage}
            onSelectAllCurrentPage={handleSelectAllCurrentPage}
            onTrashSelected={handleBatchTrash}
            onMergeSelected={openMergeDialog}
            onClearSelection={clearSelection}
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 px-1 font-mono text-[11px] text-on-surface-variant">
          <span>
            当前页 {returnedCount} 张{cardsQuery.data !== undefined ? `，筛选结果共 ${total} 张` : ''}
          </span>
          {cardsQuery.isFetching && !cardsQuery.isPending && (
            <span role="status" className="inline-flex items-center gap-1.5 text-primary">
              <span aria-hidden="true" className="material-symbols-outlined animate-spin text-[15px]">progress_activity</span>
              正在更新
            </span>
          )}
        </div>

        <div className="space-y-4">{content}</div>
      </main>

      <CardEditorModal
        mode={editorMode}
        cardId={editingCardId}
        open={isEditorOpen}
        topics={topicsQuery.data?.items ?? []}
        onClose={() => {
          setIsEditorOpen(false);
          setEditingCardId(null);
        }}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={isTrashConfirmOpen}
        title="放入回收站"
        description={
          pendingTrashItems.length === 1
            ? `确定将 Card #${pendingTrashItems[0]?.id} 放入回收站吗？该操作会移除正常列表中的 Card。`
            : `确定将选中的 ${pendingTrashItems.length} 张 Card 放入回收站吗？该批量操作会整批成功或失败。`
        }
        confirmLabel="放入回收站"
        danger
        isSubmitting={isActionSubmitting}
        errorMessage={trashErrorMessage}
        onConfirm={confirmTrash}
        onClose={closeTrashConfirm}
      />

      <CardMergeDialog
        open={isMergeOpen}
        sourceCardIds={mergeCardIds}
        topics={topicsQuery.data?.items ?? []}
        onClose={() => {
          if (mergeMutation.isPending) return;
          setIsMergeOpen(false);
          setMergeCardIds(null);
        }}
        onMerged={handleMerged}
      />
    </div>
  );
};
