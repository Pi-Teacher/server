import React from 'react';

interface ListFiltersProps {
  ariaLabel: string;
  searchLabel: string;
  searchPlaceholder: string;
  searchValue: string;
  pageSize: number;
  disabled?: boolean;
  onSearchChange: (value: string) => void;
  onPageSizeChange: (pageSize: number) => void;
}

// 通用列表筛选面板: 搜索 + 每页数量.
// Topics 与 Glossary 共用, 后端均无排序参数, 因此不提供排序控件.
const controlClassName =
  'h-10 rounded-xl border border-outline-variant/60 bg-surface-container-lowest px-3 text-[13px] text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60';

export const ListFilters: React.FC<ListFiltersProps> = ({
  ariaLabel,
  searchLabel,
  searchPlaceholder,
  searchValue,
  pageSize,
  disabled = false,
  onSearchChange,
  onPageSizeChange
}) => (
  <section
    aria-label={ariaLabel}
    className="rounded-2xl border border-outline-variant/35 bg-surface-container-lowest p-4 shadow-subtle"
  >
    <div className="grid gap-3 sm:grid-cols-[minmax(16rem,1.6fr)_minmax(8rem,0.8fr)]">
      <label className="relative block">
        <span className="sr-only">{searchLabel}</span>
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
          placeholder={searchPlaceholder}
          className={`${controlClassName} w-full pl-10`}
        />
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
