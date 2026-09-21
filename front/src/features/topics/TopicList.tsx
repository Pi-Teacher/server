import React from 'react';
import { Topic } from '../../api/topics';
import { formatDateTime } from '../../utils/datetime';

interface TopicListProps {
  topics: Topic[];
  onViewDetail: (topicId: number) => void;
  onEditTopic: (topicId: number) => void;
  onTrashTopic: (topicId: number) => void;
}

export const TopicList: React.FC<TopicListProps> = ({
  topics,
  onViewDetail,
  onEditTopic,
  onTrashTopic
}) => (
  <section className="overflow-hidden rounded-2xl border border-outline-variant/35 bg-surface-container-lowest shadow-subtle">
    <div className="hidden grid-cols-[minmax(0,1fr)_6rem_5rem_10.5rem_10.5rem_5rem] gap-4 border-b border-outline-variant/30 bg-surface-container-low/75 px-5 py-2.5 font-mono text-[11px] uppercase tracking-wider text-on-surface-variant lg:grid">
      <span>名称 / 描述</span>
      <span>Card</span>
      <span>Version</span>
      <span>创建时间</span>
      <span>更新时间</span>
      <span className="sr-only">操作</span>
    </div>
    <div className="divide-y divide-outline-variant/25">
      {topics.map((topic) => (
        <article
          key={topic.id}
          className="grid gap-3 px-4 py-4 transition-colors hover:bg-surface-container-low/70 sm:px-5 lg:grid-cols-[minmax(0,1fr)_6rem_5rem_10.5rem_10.5rem_5rem] lg:items-center lg:gap-4 lg:py-3"
        >
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden="true"
              className="material-symbols-outlined mt-0.5 shrink-0 text-[19px] text-primary"
            >
              folder_special
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-[14px] font-semibold leading-5 text-on-surface" title={topic.name}>
                {topic.name}
              </h2>
              {topic.description !== '' && (
                <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[13px] leading-5 text-on-surface-variant">
                  {topic.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 lg:block">
            <span className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant lg:hidden">
              Card
            </span>
            <span className="font-mono text-[12px] text-on-surface">{topic.card_count}</span>
          </div>

          <div className="flex items-center justify-between gap-3 lg:block">
            <span className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant lg:hidden">
              Version
            </span>
            <span className="font-mono text-[12px] text-on-surface">v{topic.version}</span>
          </div>

          <div className="flex items-center justify-between gap-3 lg:block">
            <span className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant lg:hidden">
              创建时间
            </span>
            <time dateTime={topic.created_at} className="font-mono text-[11px] text-on-surface-variant">
              {formatDateTime(topic.created_at)}
            </time>
          </div>

          <div className="flex items-center justify-between gap-3 lg:block">
            <span className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant lg:hidden">
              更新时间
            </span>
            <time dateTime={topic.updated_at} className="font-mono text-[11px] text-on-surface-variant">
              {formatDateTime(topic.updated_at)}
            </time>
          </div>

          <div className="flex justify-end gap-1">
            <button
              type="button"
              aria-label={`查看 Topic ${topic.id} 详情`}
              title="查看详情"
              onClick={() => onViewDetail(topic.id)}
              className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">visibility</span>
            </button>
            <button
              type="button"
              aria-label={`编辑 Topic ${topic.id}`}
              title="编辑"
              onClick={() => onEditTopic(topic.id)}
              className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">edit</span>
            </button>
            <button
              type="button"
              aria-label={`将 Topic ${topic.id} 放入回收站`}
              title="放入回收站"
              onClick={() => onTrashTopic(topic.id)}
              className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-error-container hover:text-error"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">delete</span>
            </button>
          </div>
        </article>
      ))}
    </div>
  </section>
);
