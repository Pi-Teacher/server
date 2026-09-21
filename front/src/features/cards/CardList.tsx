import React from 'react';
import { CardEmbeddingStatus, CardListItem } from '../../api/cards';
import { Badge } from '../../components/ui/Badge';
import { formatDateTime } from '../../utils/datetime';

interface CardListProps {
  cards: CardListItem[];
  topicNameMap: ReadonlyMap<number, string>;
  selectedCardIds: ReadonlySet<number>;
  actionsDisabled?: boolean;
  onSelectionChange: (cardId: number, selected: boolean) => void;
  onEdit: (cardId: number) => void;
  onTrash: (cardId: number) => void;
}

const statusPresentation: Record<
  CardEmbeddingStatus,
  { label: string; tone: React.ComponentProps<typeof Badge>['tone'] }
> = {
  pending: { label: '待处理', tone: 'warning' },
  processing: { label: '处理中', tone: 'primary' },
  ready: { label: '已就绪', tone: 'success' },
  failed: { label: '失败', tone: 'danger' },
  disabled: { label: '未启用', tone: 'neutral' }
};

const formatUpdatedAt = formatDateTime;

// 列轨道必须与每行的单元格数一致 (选择/内容/Topic/Embedding/Version/更新时间/操作 = 7 列),
// 否则多出的单元格会被挤到隐式行, 与表头错列。
// 较窄桌面 (lg) 隐藏 Version 与更新时间两列 (仍可在详情与编辑弹窗查看), 到 xl 再加回来;
// 其余列用 minmax 让长内容自行收缩, 避免固定宽度在侧栏旁被挤压。
const gridClass =
  'lg:grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,9rem)_7rem_5.5rem] xl:grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,9rem)_7rem_4.5rem_minmax(0,8.5rem)_5.5rem]';

const CardRow: React.FC<{
  card: CardListItem;
  topicName?: string;
  selected: boolean;
  actionsDisabled: boolean;
  onSelectionChange: (cardId: number, selected: boolean) => void;
  onEdit: (cardId: number) => void;
  onTrash: (cardId: number) => void;
}> = ({
  card,
  topicName,
  selected,
  actionsDisabled,
  onSelectionChange,
  onEdit,
  onTrash
}) => {
  const status = statusPresentation[card.embedding_status];
  return (
    <article
      className={`grid gap-3 px-4 py-4 transition-colors sm:px-5 lg:items-center lg:gap-3 lg:py-3 ${gridClass} ${
        selected ? 'bg-primary-fixed/35' : 'hover:bg-surface-container-low/70'
      }`}
    >
      <div className="flex items-center">
        <input
          type="checkbox"
          aria-label={`选择 Card ${card.id}`}
          checked={selected}
          disabled={actionsDisabled}
          onChange={(event) => onSelectionChange(card.id, event.target.checked)}
          className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      <div className="min-w-0">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden="true" className="material-symbols-outlined mt-0.5 shrink-0 text-[19px] text-primary">style</span>
          <div className="min-w-0">
            <h2 className="line-clamp-2 whitespace-pre-wrap text-[14px] font-semibold leading-5 text-on-surface lg:line-clamp-1">
              {card.front}
            </h2>
            <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[13px] leading-5 text-on-surface-variant lg:line-clamp-1">
              {card.back}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 lg:block">
        <span className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant lg:hidden">
          Topic
        </span>
        <span className="block truncate text-[13px] text-on-surface" title={topicName ?? '无 Topic'}>
          {topicName ?? '无 Topic'}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 lg:block">
        <span className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant lg:hidden">
          Embedding
        </span>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      <div className="flex items-center justify-between gap-3 lg:hidden xl:block">
        <span className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant lg:hidden">
          Version
        </span>
        <span className="font-mono text-[12px] text-on-surface">v{card.version}</span>
      </div>

      <div className="flex items-center justify-between gap-3 lg:hidden xl:block lg:text-right">
        <span className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant lg:hidden">
          更新时间
        </span>
        <time dateTime={card.updated_at} className="font-mono text-[11px] text-on-surface-variant">
          {formatUpdatedAt(card.updated_at)}
        </time>
      </div>

      <div className="flex justify-end gap-1">
        <button
          type="button"
          aria-label={`编辑 Card ${card.id}`}
          title="编辑 Card"
          disabled={actionsDisabled}
          onClick={() => onEdit(card.id)}
          className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">edit</span>
        </button>
        <button
          type="button"
          aria-label={`放入回收站 Card ${card.id}`}
          title="放入回收站"
          disabled={actionsDisabled}
          onClick={() => onTrash(card.id)}
          className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-error-container hover:text-error disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">delete</span>
        </button>
      </div>
    </article>
  );
};

export const CardList: React.FC<CardListProps> = ({
  cards,
  topicNameMap,
  selectedCardIds,
  actionsDisabled = false,
  onSelectionChange,
  onEdit,
  onTrash
}) => (
  <section aria-label="Card 列表" className="overflow-hidden rounded-2xl border border-outline-variant/35 bg-surface-container-lowest shadow-subtle">
    <div
      className={`hidden gap-3 border-b border-outline-variant/30 bg-surface-container-low/75 px-5 py-2.5 font-mono text-[11px] uppercase tracking-wider text-on-surface-variant lg:grid ${gridClass}`}
    >
      {/* 占位单元格必须真实留在 grid 流中: sr-only 是 position:absolute,
          会被移出自动排布, 导致表头后面的列全部向左错位一格。 */}
      <span aria-hidden="true" />
      <span>Front / Back</span>
      <span>Topic</span>
      <span>Embedding</span>
      <span aria-hidden="true" className="hidden xl:block">Version</span>
      <span aria-hidden="true" className="hidden text-right xl:block">更新时间</span>
      <span aria-hidden="true" />
    </div>
    <div className="divide-y divide-outline-variant/25">
      {cards.map((card) => (
        <CardRow
          key={card.id}
          card={card}
          selected={selectedCardIds.has(card.id)}
          actionsDisabled={actionsDisabled}
          topicName={card.topic_id === null ? undefined : topicNameMap.get(card.topic_id)}
          onSelectionChange={onSelectionChange}
          onEdit={onEdit}
          onTrash={onTrash}
        />
      ))}
    </div>
  </section>
);
