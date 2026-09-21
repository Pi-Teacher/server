import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Topic, TopicTrashResponse, TopicsListParams, topicDetailQueryKey, topicsListQueryOptions } from '../api/topics';
import { getApiErrorMessage } from '../api/client';
import { Button } from '../components/ui/Button';
import { ListFilters } from '../components/ui/ListFilters';
import { Pagination } from '../components/ui/Pagination';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States';
import { Toast } from '../components/ui/Toast';
import { TopicDetailModal } from '../features/topics/TopicDetailModal';
import { TopicEditorModal } from '../features/topics/TopicEditorModal';
import { TopicList } from '../features/topics/TopicList';
import { TopicTrashDialog } from '../features/topics/TopicTrashDialog';

const SEARCH_DEBOUNCE_MS = 300;

export const TopicsPage: React.FC = () => {
  const [searchValue, setSearchValue] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [detailTopicId, setDetailTopicId] = useState<number | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
  const [editingTopicId, setEditingTopicId] = useState<number | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [trashTarget, setTrashTarget] = useState<Topic | null>(null);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string>();
  const queryClient = useQueryClient();

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(searchValue), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [searchValue]);

  const queryParams = useMemo<TopicsListParams>(
    () => ({ page, pageSize, q: debouncedSearch }),
    [debouncedSearch, page, pageSize]
  );

  const topicsQuery = useQuery(topicsListQueryOptions(queryParams));

  // 后端没有排序参数, 列表固定按更新时间倒序, 因此不提供排序控件.
  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    setPage(1);
  };
  const handlePageSizeChange = (value: number) => {
    setPageSize(value);
    setPage(1);
  };
  const handlePageChange = (nextPage: number) => setPage(nextPage);

  const handleViewDetail = (topicId: number) => {
    setDetailTopicId(topicId);
    setIsDetailOpen(true);
  };

  const handleCreate = () => {
    setSuccessMessage(undefined);
    setEditorMode('create');
    setEditingTopicId(null);
    setIsEditorOpen(true);
  };

  const handleEdit = (topicId: number) => {
    setSuccessMessage(undefined);
    setEditorMode('edit');
    setEditingTopicId(topicId);
    setIsEditorOpen(true);
  };

  const handleTrash = (topicId: number) => {
    setSuccessMessage(undefined);
    const target = topicsQuery.data?.items.find((topic) => topic.id === topicId) ?? null;
    setTrashTarget(target);
    setIsTrashOpen(true);
  };

  // 回收成功后失效 topics 与 cards: include_cards 模式会改变 Card 状态,
  // topic-only 模式下 Card 的 topic_id 被置空, 两类查询都需要刷新.
  const handleTrashed = (
    response: TopicTrashResponse,
    includeCards: boolean,
    previewAffectedCards: number
  ) => {
    setIsTrashOpen(false);
    setTrashTarget(null);
    let message: string;
    if (includeCards) {
      message = `Topic #${response.trashed_topic_id} 与 ${response.affected_cards} 张关联 Card 已放入回收站`;
    } else {
      message =
        response.affected_cards > 0
          ? `Topic #${response.trashed_topic_id} 已放入回收站，${response.affected_cards} 张 Card 已变为无 Topic`
          : `Topic #${response.trashed_topic_id} 已放入回收站`;
    }
    // 预览与实际不一致时说明并发变化, 不静默吞掉差异.
    if (response.affected_cards !== previewAffectedCards) {
      message += `（与预览的 ${previewAffectedCards} 张不同，期间数据发生了变化）`;
    }
    setSuccessMessage(message);
    void queryClient.invalidateQueries({ queryKey: ['topics'] });
    void queryClient.invalidateQueries({ queryKey: ['cards'] });
  };

  // 保存成功后失效全部 topics 查询: 列表、详情以及 Cards 页复用的 Topic 筛选数据.
  const handleSaved = (topic: Topic, mode: 'create' | 'edit') => {
    setIsEditorOpen(false);
    setEditingTopicId(null);
    setSuccessMessage(
      mode === 'create'
        ? `Topic #${topic.id} 已创建`
        : `Topic #${topic.id} 已保存，当前 version 为 ${topic.version}`
    );
    queryClient.setQueryData(topicDetailQueryKey(topic.id), topic);
    void queryClient.invalidateQueries({ queryKey: ['topics'] });
  };

  const returnedCount = topicsQuery.data?.items.length ?? 0;
  const total = topicsQuery.data?.total ?? 0;
  const responsePageSize = topicsQuery.data?.page_size ?? pageSize;

  let content: React.ReactNode;
  if (topicsQuery.isPending) {
    content = <LoadingState title="正在加载 Topic" description="正在读取知识分类列表。" />;
  } else if (topicsQuery.isError) {
    content = (
      <ErrorState
        title="Topic 加载失败"
        description={getApiErrorMessage(topicsQuery.error)}
        onRetry={() => void topicsQuery.refetch()}
      />
    );
  } else if (topicsQuery.data.items.length === 0) {
    content = (
      <EmptyState
        title="没有符合条件的 Topic"
        description="可以调整搜索词后重试，或新建 Topic。"
      />
    );
  } else {
    content = (
      <>
        <TopicList
          topics={topicsQuery.data.items}
          onViewDetail={handleViewDetail}
          onEditTopic={handleEdit}
          onTrashTopic={handleTrash}
        />
        <div className="rounded-2xl border border-outline-variant/35 bg-surface-container-lowest px-4 py-4 shadow-subtle sm:px-5">
          <Pagination
            page={topicsQuery.data.page}
            pageSize={responsePageSize}
            total={topicsQuery.data.total}
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
            <h1 className="mt-1 text-headline-md text-on-surface">知识分类</h1>
            <p className="mt-2 max-w-3xl text-body-md text-on-surface-variant">
              搜索并查看 Topic 的描述、关联卡数量、版本与时间信息。
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={handleCreate}>
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">add</span>
              新建 Topic
            </Button>
            <Button
              variant="secondary"
              onClick={() => void topicsQuery.refetch()}
              disabled={topicsQuery.isFetching}
              isLoading={topicsQuery.isFetching}
            >
              {!topicsQuery.isFetching && (
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
          ariaLabel="Topic 筛选"
          searchLabel="搜索 Topic 名称"
          searchPlaceholder="搜索 Topic 名称"
          searchValue={searchValue}
          pageSize={pageSize}
          disabled={topicsQuery.isPending}
          onSearchChange={handleSearchChange}
          onPageSizeChange={handlePageSizeChange}
        />

        <div className="flex flex-wrap items-center justify-between gap-2 px-1 font-mono text-[11px] text-on-surface-variant">
          <span>
            当前页 {returnedCount} 个{topicsQuery.data !== undefined ? `，筛选结果共 ${total} 个` : ''}
          </span>
          {topicsQuery.isFetching && !topicsQuery.isPending && (
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

      <TopicDetailModal
        topicId={detailTopicId}
        open={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setDetailTopicId(null);
        }}
      />

      <TopicEditorModal
        mode={editorMode}
        topicId={editingTopicId}
        open={isEditorOpen}
        onClose={() => {
          setIsEditorOpen(false);
          setEditingTopicId(null);
        }}
        onSaved={handleSaved}
      />

      <TopicTrashDialog
        topic={trashTarget}
        open={isTrashOpen}
        onClose={() => {
          setIsTrashOpen(false);
          setTrashTarget(null);
        }}
        onTrashed={handleTrashed}
      />
    </div>
  );
};
