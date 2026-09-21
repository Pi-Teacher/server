import React from 'react';
import { TrashKind, TrashedItem } from '../../api/trash';
import { TrashRow, trashGridClass } from './TrashRow';

interface TrashListProps {
  kind: TrashKind;
  items: TrashedItem[];
  selectedIds: ReadonlySet<number>;
  actionsDisabled?: boolean;
  onSelectionChange: (id: number, selected: boolean) => void;
  onRestore: (id: number) => void;
  onDelete: (id: number) => void;
}

const kindLabel: Record<TrashKind, string> = {
  cards: 'Card',
  topics: 'Topic',
  glossary: '术语'
};

export const TrashList: React.FC<TrashListProps> = ({
  kind,
  items,
  selectedIds,
  actionsDisabled = false,
  onSelectionChange,
  onRestore,
  onDelete
}) => (
  <section
    aria-label={`回收站${kindLabel[kind]}列表`}
    className="overflow-hidden rounded-2xl border border-outline-variant/35 bg-surface-container-lowest shadow-subtle"
  >
    <div
      className={`hidden gap-3 border-b border-outline-variant/30 bg-surface-container-low/75 px-5 py-2.5 font-mono text-[11px] uppercase tracking-wider text-on-surface-variant lg:grid ${trashGridClass}`}
    >
      {/* 占位单元格必须留在 grid 流中: sr-only 是 position:absolute,
          会被移出自动排布, 导致表头后面的列全部向左错位一格。 */}
      <span aria-hidden="true" />
      <span>对象</span>
      <span>Version</span>
      <span>回收时间</span>
      <span aria-hidden="true" className="hidden text-right xl:block">创建时间</span>
      <span aria-hidden="true" />
    </div>
    <div className="divide-y divide-outline-variant/25">
      {items.map((item) => (
        <TrashRow
          key={item.id}
          kind={kind}
          item={item}
          selected={selectedIds.has(item.id)}
          actionsDisabled={actionsDisabled}
          onSelectionChange={onSelectionChange}
          onRestore={onRestore}
          onDelete={onDelete}
        />
      ))}
    </div>
  </section>
);
