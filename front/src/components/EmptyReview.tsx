import React from 'react';

interface EmptyReviewProps {
  onGoCards: () => void;
  onReload: () => void;
  isReloading?: boolean;
}

export const EmptyReview: React.FC<EmptyReviewProps> = ({
  onGoCards,
  onReload,
  isReloading = false
}) => {
  return (
    <div className="w-full max-w-xl mx-auto bg-surface-container-lowest rounded-2xl border border-outline-variant/40 shadow-card p-8 sm:p-12 text-center animate-fadeIn">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-surface-container-high flex items-center justify-center text-primary mb-5">
        <span className="material-symbols-outlined text-[32px]">self_improvement</span>
      </div>

      <h2 className="font-headline-md text-headline-md text-on-surface font-semibold tracking-tight">
        暂无到期复习卡片
      </h2>
      <p className="text-on-surface-variant text-body-md mt-2 max-w-sm mx-auto">
        当前所选范围没有 <code className="font-mono text-[13px]">due &lt;= now</code> 的卡片。
        你可以稍后重新加载，或前往卡片库查看内容。
      </p>

      <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
        <button
          type="button"
          onClick={onGoCards}
          className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-semibold text-[14px] transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]">library_books</span>
          <span>前往卡片库</span>
        </button>

        <button
          type="button"
          onClick={onReload}
          disabled={isReloading}
          className="w-full sm:w-auto px-6 py-2.5 rounded-xl border border-outline-variant hover:bg-surface-container-high text-on-surface font-medium text-[14px] transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className={`material-symbols-outlined text-[18px] ${isReloading ? 'animate-spin' : ''}`}>
            {isReloading ? 'progress_activity' : 'refresh'}
          </span>
          <span>{isReloading ? '正在加载' : '重新加载队列'}</span>
        </button>
      </div>
    </div>
  );
};
