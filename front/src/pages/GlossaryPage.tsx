import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Glossary,
  GlossaryListParams,
  glossaryDetailQueryKey,
  glossaryListQueryOptions,
  trashGlossaryMutationOptions
} from '../api/glossary';
import { ApiError, getApiErrorMessage } from '../api/client';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ListFilters } from '../components/ui/ListFilters';
import { Pagination } from '../components/ui/Pagination';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States';
import { Toast } from '../components/ui/Toast';
import { GlossaryDetailModal } from '../features/glossary/GlossaryDetailModal';
import { GlossaryEditorModal } from '../features/glossary/GlossaryEditorModal';
import { GlossaryList } from '../features/glossary/GlossaryList';

const SEARCH_DEBOUNCE_MS = 300;

export const GlossaryPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchValue, setSearchValue] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [detailGlossaryId, setDetailGlossaryId] = useState<number | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
  const [editingGlossaryId, setEditingGlossaryId] = useState<number | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [trashTarget, setTrashTarget] = useState<Glossary | null>(null);
  const [isTrashConfirmOpen, setIsTrashConfirmOpen] = useState(false);
  const [trashError, setTrashError] = useState<unknown>();
  const [successMessage, setSuccessMessage] = useState<string>();
  const trashMutation = useMutation(trashGlossaryMutationOptions());

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(searchValue), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [searchValue]);

  const queryParams = useMemo<GlossaryListParams>(
    () => ({ page, pageSize, q: debouncedSearch }),
    [debouncedSearch, page, pageSize]
  );

  const glossaryQuery = useQuery(glossaryListQueryOptions(queryParams));

  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    setPage(1);
  };
  const handlePageSizeChange = (value: number) => {
    setPageSize(value);
    setPage(1);
  };
  const handlePageChange = (nextPage: number) => setPage(nextPage);

  const handleViewDetail = (glossaryId: number) => {
    setDetailGlossaryId(glossaryId);
    setIsDetailOpen(true);
  };

  const handleCreate = () => {
    setSuccessMessage(undefined);
    setEditorMode('create');
    setEditingGlossaryId(null);
    setIsEditorOpen(true);
  };

  const handleEdit = (glossaryId: number) => {
    setSuccessMessage(undefined);
    setEditorMode('edit');
    setEditingGlossaryId(glossaryId);
    setIsEditorOpen(true);
  };

  // 保存成功后失效全部 glossary 查询: 列表与详情一起刷新.
  const handleSaved = (glossary: Glossary, mode: 'create' | 'edit') => {
    setIsEditorOpen(false);
    setEditingGlossaryId(null);
    setSuccessMessage(
      mode === 'create'
        ? `术语 #${glossary.id} 已创建`
        : `术语 #${glossary.id} 已保存，当前 version 为 ${glossary.version}`
    );
    queryClient.setQueryData(glossaryDetailQueryKey(glossary.id), glossary);
    void queryClient.invalidateQueries({ queryKey: ['glossary'] });
  };

  const handleTrash = (glossaryId: number) => {
    setSuccessMessage(undefined);
    setTrashError(undefined);
    setTrashTarget(glossaryQuery.data?.items.find((item) => item.id === glossaryId) ?? null);
    setIsTrashConfirmOpen(true);
  };

  const closeTrashConfirm = () => {
    if (trashMutation.isPending) return;
    setIsTrashConfirmOpen(false);
    setTrashTarget(null);
    setTrashError(undefined);
  };

  const confirmTrash = () => {
    if (trashTarget === null || trashMutation.isPending) return;
    setTrashError(undefined);
    trashMutation.mutate(
      { id: trashTarget.id, expectedVersion: trashTarget.version },
      {
        onSuccess: () => {
          setIsTrashConfirmOpen(false);
          setTrashTarget(null);
          setSuccessMessage(`术语 #${trashTarget.id} 已放入回收站`);
          void queryClient.invalidateQueries({ queryKey: ['glossary'] });
        },
        onError: (error: unknown) => {
          // 行数据已过期: 失效列表让用户重新加载后再试, 不自动重试危险写操作.
          if (error instanceof ApiError && (error.code === 'version_conflict' || error.code === 'not_found')) {
            void queryClient.invalidateQueries({ queryKey: ['glossary', 'list'] });
          }
          setTrashError(error);
        }
      }
    );
  };

  const trashErrorMessage =
    trashError === undefined
      ? undefined
      : trashError instanceof ApiError && trashError.code === 'version_conflict'
        ? `版本冲突: ${trashError.message}`
        : trashError instanceof ApiError && trashError.code === 'not_found'
          ? `术语不存在: ${trashError.message}`
          : getApiErrorMessage(trashError);

  const returnedCount = glossaryQuery.data?.items.length ?? 0;
  const total = glossaryQuery.data?.total ?? 0;
  const responsePageSize = glossaryQuery.data?.page_size ?? pageSize;

  let content: React.ReactNode;
  if (glossaryQuery.isPending) {
    content = <LoadingState title="正在加载术语" description="正在读取术语表。" />;
  } else if (glossaryQuery.isError) {
    content = (
      <ErrorState
        title="术语加载失败"
        description={getApiErrorMessage(glossaryQuery.error)}
        onRetry={() => void glossaryQuery.refetch()}
      />
    );
  } else if (glossaryQuery.data.items.length === 0) {
    content = (
      <EmptyState
        title="没有符合条件的术语"
        description="可以调整搜索词后重试，或新建术语。"
      />
    );
  } else {
    content = (
      <>
        <GlossaryList
          items={glossaryQuery.data.items}
          onViewDetail={handleViewDetail}
          onEditGlossary={handleEdit}
          onTrashGlossary={handleTrash}
        />
        <div className="rounded-2xl border border-outline-variant/35 bg-surface-container-lowest px-4 py-4 shadow-subtle sm:px-5">
          <Pagination
            page={glossaryQuery.data.page}
            pageSize={responsePageSize}
            total={glossaryQuery.data.total}
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
            <p className="font-mono text-label-sm uppercase tracking-widest text-primary">阶段 3</p>
            <h1 className="mt-1 text-headline-md text-on-surface">术语表</h1>
            <p className="mt-2 max-w-3xl text-body-md text-on-surface-variant">
              搜索并维护术语和 Markdown 定义。
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={handleCreate}>
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">add</span>
              新建术语
            </Button>
            <Button
              variant="secondary"
              onClick={() => void glossaryQuery.refetch()}
              disabled={glossaryQuery.isFetching}
              isLoading={glossaryQuery.isFetching}
            >
              {!glossaryQuery.isFetching && (
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">refresh</span>
              )}
              刷新列表
            </Button>
          </div>
        </div>
      </header>

      <main className="space-y-4 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        {successMessage !== undefined && <Toast message={successMessage} tone="success" />}
        <ListFilters
          ariaLabel="术语筛选"
          searchLabel="搜索术语名称"
          searchPlaceholder="搜索术语名称"
          searchValue={searchValue}
          pageSize={pageSize}
          disabled={glossaryQuery.isPending}
          onSearchChange={handleSearchChange}
          onPageSizeChange={handlePageSizeChange}
        />

        <div className="flex flex-wrap items-center justify-between gap-2 px-1 font-mono text-[11px] text-on-surface-variant">
          <span>
            当前页 {returnedCount} 个{glossaryQuery.data !== undefined ? `，筛选结果共 ${total} 个` : ''}
          </span>
          {glossaryQuery.isFetching && !glossaryQuery.isPending && (
            <span role="status" className="inline-flex items-center gap-1.5 text-primary">
              <span
                aria-hidden="true"
                className="material-symbols-outlined animate-spin text-[15px]"
              >
                progress_activity
              </span>
              正在更新
            </span>
          )}
        </div>

        <div className="space-y-4">{content}</div>
      </main>

      <GlossaryDetailModal
        glossaryId={detailGlossaryId}
        open={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setDetailGlossaryId(null);
        }}
      />

      <GlossaryEditorModal
        mode={editorMode}
        glossaryId={editingGlossaryId}
        open={isEditorOpen}
        onClose={() => {
          setIsEditorOpen(false);
          setEditingGlossaryId(null);
        }}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={isTrashConfirmOpen}
        title="放入回收站"
        description={`确定将术语「${trashTarget?.term ?? ''}」放入回收站吗？`}
        confirmLabel="放入回收站"
        danger
        isSubmitting={trashMutation.isPending}
        errorMessage={trashErrorMessage}
        onConfirm={confirmTrash}
        onClose={closeTrashConfirm}
      />
    </div>
  );
};
