import React from 'react';

/**
 * Dashboard 各区域内联状态。
 *
 * Dashboard 采用"单一区域失败不阻塞其他区域"的策略, 因此这里用轻量内联
 * 状态而不是整页的 LoadingState/ErrorState, 让每个卡片独立展示自己的
 * loading / error / empty。
 */

export const InlineLoading: React.FC<{ label: string }> = ({ label }) => (
  <span role="status" className="inline-flex items-center gap-2 text-body-md text-on-surface-variant">
    <span className="material-symbols-outlined animate-spin text-[18px] text-primary" aria-hidden="true">
      progress_activity
    </span>
    {label}
  </span>
);

export const InlineError: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <span role="alert" className="flex flex-wrap items-center gap-2 text-body-sm text-error">
    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
      error
    </span>
    <span className="flex-1">{message}</span>
    <button
      type="button"
      onClick={onRetry}
      className="rounded-lg border border-error/30 px-2 py-0.5 text-label-md text-error transition-colors hover:bg-error-container/50 focus:outline-none focus:ring-2 focus:ring-error/25"
    >
      重试
    </button>
  </span>
);

export const InlineEmpty: React.FC<{ message: string }> = ({ message }) => (
  <span className="text-body-md text-on-surface-variant">{message}</span>
);
