import React from 'react';
import { Glossary } from '../../api/glossary';
import { formatDateTime } from '../../utils/datetime';

interface GlossaryListProps {
  items: Glossary[];
  onViewDetail: (glossaryId: number) => void;
  onEditGlossary: (glossaryId: number) => void;
  onTrashGlossary: (glossaryId: number) => void;
}

export const GlossaryList: React.FC<GlossaryListProps> = ({
  items,
  onViewDetail,
  onEditGlossary,
  onTrashGlossary
}) => (
  <section className="overflow-hidden rounded-2xl border border-outline-variant/35 bg-surface-container-lowest shadow-subtle">
    <div className="hidden grid-cols-[minmax(0,1fr)_5rem_10.5rem_10.5rem_5rem] gap-4 border-b border-outline-variant/30 bg-surface-container-low/75 px-5 py-2.5 font-mono text-[11px] uppercase tracking-wider text-on-surface-variant lg:grid">
      <span>术语 / 定义</span>
      <span>Version</span>
      <span>创建时间</span>
      <span>更新时间</span>
      <span className="sr-only">操作</span>
    </div>
    <div className="divide-y divide-outline-variant/25">
      {items.map((item) => (
        <article
          key={item.id}
          className="grid gap-3 px-4 py-4 transition-colors hover:bg-surface-container-low/70 sm:px-5 lg:grid-cols-[minmax(0,1fr)_5rem_10.5rem_10.5rem_5rem] lg:items-center lg:gap-4 lg:py-3"
        >
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden="true"
              className="material-symbols-outlined mt-0.5 shrink-0 text-[19px] text-primary"
            >
              menu_book
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-[14px] font-semibold leading-5 text-on-surface" title={item.term}>
                {item.term}
              </h2>
              <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[13px] leading-5 text-on-surface-variant">
                {item.definition}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 lg:block">
            <span className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant lg:hidden">
              Version
            </span>
            <span className="font-mono text-[12px] text-on-surface">v{item.version}</span>
          </div>

          <div className="flex items-center justify-between gap-3 lg:block">
            <span className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant lg:hidden">
              创建时间
            </span>
            <time dateTime={item.created_at} className="font-mono text-[11px] text-on-surface-variant">
              {formatDateTime(item.created_at)}
            </time>
          </div>

          <div className="flex items-center justify-between gap-3 lg:block">
            <span className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant lg:hidden">
              更新时间
            </span>
            <time dateTime={item.updated_at} className="font-mono text-[11px] text-on-surface-variant">
              {formatDateTime(item.updated_at)}
            </time>
          </div>

          <div className="flex justify-end gap-1">
            <button
              type="button"
              aria-label={`查看术语 ${item.id} 详情`}
              title="查看详情"
              onClick={() => onViewDetail(item.id)}
              className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">visibility</span>
            </button>
            <button
              type="button"
              aria-label={`编辑术语 ${item.id}`}
              title="编辑"
              onClick={() => onEditGlossary(item.id)}
              className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">edit</span>
            </button>
            <button
              type="button"
              aria-label={`将术语 ${item.id} 放入回收站`}
              title="放入回收站"
              onClick={() => onTrashGlossary(item.id)}
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
