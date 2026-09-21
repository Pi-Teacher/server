import React from 'react';
import { TrashKind, TrashedItem } from '../../api/trash';
import { Badge } from '../../components/ui/Badge';
import { formatDateTime } from '../../utils/datetime';

interface TrashRowProps {
  kind: TrashKind;
  item: TrashedItem;
  selected: boolean;
  actionsDisabled: boolean;
  onSelectionChange: (id: number, selected: boolean) => void;
  onRestore: (id: number) => void;
  onDelete: (id: number) => void;
}

const kindPresentation: Record<TrashKind, { label: string; icon: string }> = {
  cards: { label: 'Card', icon: 'style' },
  topics: { label: 'Topic', icon: 'folder_special' },
  glossary: { label: '术语', icon: 'menu_book' }
};

// 列轨道必须与表头单元格数一致 (选择/内容/Version/回收时间/创建时间/操作 = 6 列),
// 否则多出的单元格会被挤到隐式行而与表头错列。
// 较窄桌面 (lg) 隐藏“创建时间”列, 到 xl 再加回, 避免侧栏旁横向拥挤。
export const trashGridClass =
  'lg:grid-cols-[2.25rem_minmax(0,1fr)_5rem_minmax(0,10.5rem)_5.5rem] xl:grid-cols-[2.25rem_minmax(0,1fr)_5rem_minmax(0,10.5rem)_minmax(0,10.5rem)_5.5rem]';

const itemName = (kind: TrashKind, item: TrashedItem): string => {
  switch (kind) {
    case 'cards':
      return (item as { front: string }).front;
    case 'topics':
      return (item as { name: string }).name;
    case 'glossary':
      return (item as { term: string }).term;
  }
};

const itemPreview = (kind: TrashKind, item: TrashedItem): string => {
  switch (kind) {
    case 'cards':
      return (item as { back: string }).back;
    case 'topics':
      return (item as { description: string }).description;
    case 'glossary':
      return (item as { definition: string }).definition;
  }
};

export const TrashRow: React.FC<TrashRowProps> = ({
  kind,
  item,
  selected,
  actionsDisabled,
  onSelectionChange,
  onRestore,
  onDelete
}) => {
  const presentation = kindPresentation[kind];
  const name = itemName(kind, item);
  const preview = itemPreview(kind, item);
  // Topic 回收站列表恒带 card_count=0, 明确标注避免误读为真实关联。
  const topicCardCount = kind === 'topics' ? (item as { card_count: number }).card_count : undefined;

  return (
    <article
      className={`grid gap-3 px-4 py-4 transition-colors sm:px-5 lg:items-center lg:gap-3 lg:py-3 ${trashGridClass} ${
        selected ? 'bg-primary-fixed/35' : 'hover:bg-surface-container-low/70'
      }`}
    >
      <div className="flex items-center">
        <input
          type="checkbox"
          aria-label={`选择${presentation.label} ${item.id}`}
          checked={selected}
          disabled={actionsDisabled}
          onChange={(event) => onSelectionChange(item.id, event.target.checked)}
          className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      <div className="min-w-0">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden="true" className="material-symbols-outlined mt-0.5 shrink-0 text-[19px] text-primary">
            {presentation.icon}
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2
                className="min-w-0 truncate text-[14px] font-semibold leading-5 text-on-surface"
                title={name}
              >
                {name}
              </h2>
              <span className="font-mono text-[11px] text-on-surface-variant">#{item.id}</span>
              {topicCardCount !== undefined && (
                <Badge tone="neutral">card_count {topicCardCount}</Badge>
              )}
            </div>
            {preview.trim() !== '' && (
              <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[13px] leading-5 text-on-surface-variant lg:line-clamp-1">
                {preview}
              </p>
            )}
          </div>
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
          回收时间
        </span>
        <time dateTime={item.trashed_at} className="font-mono text-[11px] text-on-surface-variant">
          {formatDateTime(item.trashed_at)}
        </time>
      </div>

      <div className="flex items-center justify-between gap-3 lg:hidden xl:block lg:text-right">
        <span className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant lg:hidden">
          创建时间
        </span>
        <time dateTime={item.created_at} className="font-mono text-[11px] text-on-surface-variant">
          {formatDateTime(item.created_at)}
        </time>
      </div>

      <div className="flex justify-end gap-1">
        <button
          type="button"
          aria-label={`恢复${presentation.label} ${item.id}`}
          title="恢复"
          disabled={actionsDisabled}
          onClick={() => onRestore(item.id)}
          className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">restore_from_trash</span>
        </button>
        <button
          type="button"
          aria-label={`永久删除${presentation.label} ${item.id}`}
          title="永久删除"
          disabled={actionsDisabled}
          onClick={() => onDelete(item.id)}
          className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-error-container hover:text-error disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">delete_forever</span>
        </button>
      </div>
    </article>
  );
};
