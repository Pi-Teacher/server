import React from 'react';
import { Button } from '../../components/ui/Button';

interface CardTrashActionsProps {
  selectedCount: number;
  allCurrentPageSelected: boolean;
  isSubmitting: boolean;
  errorMessage?: string;
  onSelectAllCurrentPage: () => void;
  onTrashSelected: () => void;
  onMergeSelected: () => void;
  onClearSelection: () => void;
}

export const CardTrashActions: React.FC<CardTrashActionsProps> = ({
  selectedCount,
  allCurrentPageSelected,
  isSubmitting,
  errorMessage,
  onSelectAllCurrentPage,
  onTrashSelected,
  onMergeSelected,
  onClearSelection
}) => (
  <div className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary-fixed/35 p-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[12px] text-on-primary-fixed">已选择 {selectedCount} 张 Card</span>
      <Button type="button" variant="ghost" onClick={onSelectAllCurrentPage} disabled={isSubmitting}>
        {allCurrentPageSelected ? '取消全选' : '全选当前页'}
      </Button>
      <Button type="button" variant="ghost" onClick={onClearSelection} disabled={isSubmitting}>
        清除选择
      </Button>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      {errorMessage !== undefined && (
        <span role="alert" className="text-[12px] text-error">{errorMessage}</span>
      )}
      {selectedCount === 2 && (
        <Button type="button" variant="secondary" onClick={onMergeSelected} disabled={isSubmitting}>
          <span aria-hidden="true" className="material-symbols-outlined text-[17px]">call_merge</span>
          合并所选
        </Button>
      )}
      <Button
        type="button"
        variant="danger"
        onClick={onTrashSelected}
        disabled={isSubmitting}
        isLoading={isSubmitting}
      >
        <span aria-hidden="true" className="material-symbols-outlined text-[17px]">delete</span>
        放入回收站
      </Button>
    </div>
  </div>
);
