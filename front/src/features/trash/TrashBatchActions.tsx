import React from 'react';
import { Button } from '../../components/ui/Button';

interface TrashBatchActionsProps {
  selectedCount: number;
  allCurrentPageSelected: boolean;
  isSubmitting: boolean;
  onSelectAllCurrentPage: () => void;
  onRestoreSelected: () => void;
  onDeleteSelected: () => void;
  onClearSelection: () => void;
}

/**
 * 回收站批量操作工具栏: 显示已选数量, 提供全选当前页、恢复、永久删除与清除选择。
 * 与 Cards 页的回收工具栏保持同一视觉与交互模式。
 */
export const TrashBatchActions: React.FC<TrashBatchActionsProps> = ({
  selectedCount,
  allCurrentPageSelected,
  isSubmitting,
  onSelectAllCurrentPage,
  onRestoreSelected,
  onDeleteSelected,
  onClearSelection
}) => (
  <div className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary-fixed/35 p-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[12px] text-on-primary-fixed">已选择 {selectedCount} 项</span>
      <Button type="button" variant="ghost" onClick={onSelectAllCurrentPage} disabled={isSubmitting}>
        {allCurrentPageSelected ? '取消全选' : '全选当前页'}
      </Button>
      <Button type="button" variant="ghost" onClick={onClearSelection} disabled={isSubmitting}>
        清除选择
      </Button>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        onClick={onRestoreSelected}
        disabled={isSubmitting}
      >
        <span aria-hidden="true" className="material-symbols-outlined text-[17px]">restore_from_trash</span>
        批量恢复
      </Button>
      <Button
        type="button"
        variant="danger"
        onClick={onDeleteSelected}
        disabled={isSubmitting}
      >
        <span aria-hidden="true" className="material-symbols-outlined text-[17px]">delete_forever</span>
        批量永久删除
      </Button>
    </div>
  </div>
);
