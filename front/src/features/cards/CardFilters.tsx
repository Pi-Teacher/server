import React from 'react';
import {
  CardEmbeddingFilter,
  CardSort,
  CardTopicFilter,
  SortOrder
} from '../../api/cards';
import { Topic } from '../../api/topics';

interface CardFiltersProps {
  searchValue: string;
  topicId: CardTopicFilter;
  embeddingStatus: CardEmbeddingFilter;
  sort: CardSort;
  order: SortOrder;
  pageSize: number;
  topics: Topic[];
  disabled?: boolean;
  onSearchChange: (value: string) => void;
  onTopicChange: (topicId: CardTopicFilter) => void;
  onEmbeddingStatusChange: (status: CardEmbeddingFilter) => void;
  onSortChange: (sort: CardSort) => void;
  onOrderChange: (order: SortOrder) => void;
  onPageSizeChange: (pageSize: number) => void;
}

const controlClassName =
  'h-10 rounded-xl border border-outline-variant/60 bg-surface-container-lowest px-3 text-[13px] text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60';

export const CardFilters: React.FC<CardFiltersProps> = ({
  searchValue,
  topicId,
  embeddingStatus,
  sort,
  order,
  pageSize,
  topics,
  disabled = false,
  onSearchChange,
  onTopicChange,
  onEmbeddingStatusChange,
  onSortChange,
  onOrderChange,
  onPageSizeChange
}) => (
  <section
    aria-label="卡片筛选"
    className="rounded-2xl border border-outline-variant/35 bg-surface-container-lowest p-4 shadow-subtle"
  >
    <div className="grid gap-3 xl:grid-cols-[minmax(16rem,1.6fr)_repeat(5,minmax(8rem,0.8fr))]">
      <label className="relative block">
        <span className="sr-only">搜索 Front 或 Back</span>
        <span
          aria-hidden="true"
          className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[19px] text-on-surface-variant"
        >
          search
        </span>
        <input
          type="search"
          value={searchValue}
          disabled={disabled}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="搜索 Front 或 Back"
          className={`${controlClassName} w-full pl-10`}
        />
      </label>

      <label>
        <span className="sr-only">Topic 筛选</span>
        <select
          aria-label="Topic 筛选"
          value={topicId === null ? '' : String(topicId)}
          disabled={disabled}
          onChange={(event) => {
            const value = event.target.value;
            onTopicChange(value === '' ? null : Number(value));
          }}
          className={`${controlClassName} w-full`}
        >
          <option value="">全部 Topic</option>
          {topics.map((topic) => (
            <option key={topic.id} value={String(topic.id)}>
              {topic.name}
            </option>
          ))}
          <option value="0">无 Topic</option>
        </select>
      </label>

      <label>
        <span className="sr-only">Embedding 状态</span>
        <select
          aria-label="Embedding 状态"
          value={embeddingStatus}
          disabled={disabled}
          onChange={(event) => onEmbeddingStatusChange(event.target.value as CardEmbeddingFilter)}
          className={`${controlClassName} w-full`}
        >
          <option value="">全部状态</option>
          <option value="pending">待处理</option>
          <option value="processing">处理中</option>
          <option value="ready">已就绪</option>
          <option value="failed">失败</option>
          <option value="disabled">未启用</option>
        </select>
      </label>

      <label>
        <span className="sr-only">排序字段</span>
        <select
          aria-label="排序字段"
          value={sort}
          disabled={disabled}
          onChange={(event) => onSortChange(event.target.value as CardSort)}
          className={`${controlClassName} w-full`}
        >
          <option value="created_at">创建时间</option>
          <option value="updated_at">更新时间</option>
        </select>
      </label>

      <label>
        <span className="sr-only">排序方向</span>
        <select
          aria-label="排序方向"
          value={order}
          disabled={disabled}
          onChange={(event) => onOrderChange(event.target.value as SortOrder)}
          className={`${controlClassName} w-full`}
        >
          <option value="desc">降序</option>
          <option value="asc">升序</option>
        </select>
      </label>

      <label>
        <span className="sr-only">每页数量</span>
        <select
          aria-label="每页数量"
          value={String(pageSize)}
          disabled={disabled}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className={`${controlClassName} w-full`}
        >
          <option value="20">每页 20</option>
          <option value="50">每页 50</option>
          <option value="100">每页 100</option>
        </select>
      </label>
    </div>
  </section>
);
