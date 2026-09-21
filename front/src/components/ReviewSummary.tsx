import React from 'react';
import { ReviewSessionSummary } from '../types';

interface ReviewSummaryProps {
  summary: ReviewSessionSummary;
  onRestart: () => void;
  isReloading?: boolean;
}

export const ReviewSummary: React.FC<ReviewSummaryProps> = ({
  summary,
  onRestart,
  isReloading = false
}) => {
  const passRate =
    summary.reviewedCount > 0
      ? Math.round(((summary.goodCount + summary.easyCount) / summary.reviewedCount) * 100)
      : 0;

  return (
    <div className="w-full max-w-2xl mx-auto bg-surface-container-lowest rounded-2xl border border-outline-variant/40 shadow-card p-8 sm:p-10 text-center animate-fadeIn">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-tertiary-fixed flex items-center justify-center text-on-tertiary-fixed mb-5 shadow-sm">
        <span className="material-symbols-outlined text-[36px]">task_alt</span>
      </div>

      <h2 className="font-headline-md text-headline-md text-on-surface font-semibold tracking-tight">
        本轮复习已完成
      </h2>
      <p className="text-on-surface-variant text-body-md mt-1.5 max-w-md mx-auto">
        本次成功评分已经提交至服务端。再次开始时会重新加载到期队列，不复用旧版本。
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-8 text-left">
        <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/30 flex flex-col">
          <span className="font-mono text-label-sm text-[11px] text-on-surface-variant uppercase">复习总数</span>
          <span className="font-headline-md text-[24px] font-bold text-on-surface mt-1">
            {summary.reviewedCount}
          </span>
          <span className="font-mono text-[11px] text-tertiary mt-0.5">Confirmed</span>
        </div>

        <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/30 flex flex-col">
          <span className="font-mono text-label-sm text-[11px] text-on-surface-variant uppercase">本次通过率</span>
          <span className="font-headline-md text-[24px] font-bold text-tertiary mt-1">
            {passRate}%
          </span>
          <span className="font-mono text-[11px] text-on-surface-variant mt-0.5">Good & Easy</span>
        </div>

        <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/30 flex flex-col">
          <span className="font-mono text-label-sm text-[11px] text-on-surface-variant uppercase">平均用时</span>
          <span className="font-headline-md text-[24px] font-bold text-on-surface mt-1">
            {summary.averageTimeSeconds.toFixed(1)}s
          </span>
          <span className="font-mono text-[11px] text-on-surface-variant mt-0.5">Per Card</span>
        </div>

        <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/30 flex flex-col">
          <span className="font-mono text-label-sm text-[11px] text-on-surface-variant uppercase">总投入时间</span>
          <span className="font-headline-md text-[24px] font-bold text-primary mt-1">
            {Math.round(summary.totalTimeSeconds)}s
          </span>
          <span className="font-mono text-[11px] text-on-surface-variant mt-0.5">Total Focus</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-low p-3 font-mono text-[12px] sm:grid-cols-4">
        <span className="flex items-center justify-center gap-1.5 text-fsrs-again-text font-medium">
          <span className="w-2 h-2 rounded-full bg-fsrs-again" />
          忘记: {summary.againCount}
        </span>
        <span className="flex items-center justify-center gap-1.5 text-fsrs-hard-text font-medium">
          <span className="w-2 h-2 rounded-full bg-fsrs-hard" />
          困难: {summary.hardCount}
        </span>
        <span className="flex items-center justify-center gap-1.5 text-fsrs-good-text font-medium">
          <span className="w-2 h-2 rounded-full bg-fsrs-good" />
          良好: {summary.goodCount}
        </span>
        <span className="flex items-center justify-center gap-1.5 text-fsrs-easy-text font-medium">
          <span className="w-2 h-2 rounded-full bg-fsrs-easy" />
          简单: {summary.easyCount}
        </span>
      </div>

      <div className="mt-8 flex items-center justify-center">
        <button
          type="button"
          aria-label="再来一轮"
          onClick={onRestart}
          disabled={isReloading}
          className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-semibold text-[14px] transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className={`material-symbols-outlined text-[18px] ${isReloading ? 'animate-spin' : ''}`}>
            {isReloading ? 'progress_activity' : 'replay'}
          </span>
          <span>{isReloading ? '正在加载' : '再来一轮'}</span>
        </button>
      </div>
    </div>
  );
};
