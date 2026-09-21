import React from 'react';
import { TrashKind } from '../../api/trash';

interface TrashTabsProps {
  activeKind: TrashKind;
  disabled?: boolean;
  onChange: (kind: TrashKind) => void;
}

const tabs: ReadonlyArray<{ kind: TrashKind; label: string; icon: string }> = [
  { kind: 'cards', label: 'Cards', icon: 'style' },
  { kind: 'topics', label: 'Topics', icon: 'folder_special' },
  { kind: 'glossary', label: 'Glossary', icon: 'menu_book' }
];

/**
 * 回收站三 Tab (Cards / Topics / Glossary)。
 * 使用 tablist/tab/tabpanel 语义, 每个 Tab 拥有独立分页与查询状态。
 */
export const TrashTabs: React.FC<TrashTabsProps> = ({ activeKind, disabled = false, onChange }) => (
  <div
    role="tablist"
    aria-label="回收站对象类型"
    className="inline-flex flex-wrap gap-1 rounded-xl border border-outline-variant/40 bg-surface-container-low p-1"
  >
    {tabs.map((tab) => {
      const active = tab.kind === activeKind;
      return (
        <button
          key={tab.kind}
          type="button"
          role="tab"
          aria-selected={active}
          disabled={disabled}
          onClick={() => onChange(tab.kind)}
          className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-3.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            active
              ? 'bg-surface-container-lowest text-primary shadow-subtle'
              : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
          }`}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
            {tab.icon}
          </span>
          {tab.label}
        </button>
      );
    })}
  </div>
);
