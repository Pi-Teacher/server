import React from 'react';
import { Button } from './Button';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({ page, pageSize, total, onPageChange }) => {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav aria-label="分页" className="flex items-center justify-between gap-4">
      <span className="font-mono text-label-sm text-on-surface-variant">
        第 {page} / {pageCount} 页, 共 {total} 项
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          上一页
        </Button>
        <Button variant="secondary" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
          下一页
        </Button>
      </div>
    </nav>
  );
};
