import React from 'react';
import { DueReviewItem } from '../api/review';
import { FSRSRating } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { RatingDock } from './RatingDock';

interface ReviewCardStageProps {
  card: DueReviewItem;
  /** 由 topics 列表 join 得到; topic_id=null 时为 undefined. */
  topicName?: string;
  isRevealed: boolean;
  isSubmitting: boolean;
  submitError?: string;
  onReveal: () => void;
  onRate: (rating: FSRSRating) => void;
}

const formatDue = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

export const ReviewCardStage: React.FC<ReviewCardStageProps> = ({
  card,
  topicName,
  isRevealed,
  isSubmitting,
  submitError,
  onReveal,
  onRate
}) => {
  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col items-center pb-4 sm:pb-0">
      <div className="w-full bg-surface-container-lowest rounded-2xl border border-outline-variant/40 shadow-card p-6 sm:p-10 transition-all duration-300">
        <div className="flex items-center justify-between border-b border-outline-variant/30 pb-4 mb-6">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-primary flex-shrink-0" />
            <span className="font-mono text-[12px] font-semibold text-on-surface truncate">
              {topicName ?? (card.topic_id === null ? '无 Topic' : `Topic #${card.topic_id}`)}
            </span>
            <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant border border-outline-variant/30">
              #{card.card_id}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <span
              title="复习次数 reps"
              className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-surface-container-low text-on-surface-variant border border-outline-variant/30"
            >
              reps <span className="font-semibold text-on-surface">{card.reps}</span>
            </span>
            <span
              title="遗忘次数 lapses"
              className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-surface-container-low text-on-surface-variant border border-outline-variant/30"
            >
              lapses <span className="font-semibold text-on-surface">{card.lapses}</span>
            </span>
            <span
              title="到期时间 due"
              className="hidden lg:inline font-mono text-[11px] px-2 py-0.5 rounded-md bg-surface-container-low text-on-surface-variant border border-outline-variant/30"
            >
              due <span className="font-semibold text-on-surface">{formatDue(card.due)}</span>
            </span>
          </div>
        </div>

        <div className="min-h-[140px] flex flex-col justify-center">
          <div className="text-on-surface text-[17px] sm:text-[19px] leading-relaxed font-medium">
            <MarkdownRenderer content={card.front} />
          </div>
        </div>

        {isRevealed ? (
          <div className="mt-8 pt-8 border-t-2 border-dashed border-outline-variant/40 animate-fadeIn">
            <div className="flex items-center gap-2 mb-3 text-primary font-mono text-[12px] font-semibold tracking-wider uppercase">
              <span className="material-symbols-outlined text-[16px]">verified</span>
              <span>Answer</span>
            </div>
            <div className="text-on-surface text-[15px] sm:text-[16px] leading-relaxed">
              <MarkdownRenderer content={card.back} />
            </div>
          </div>
        ) : (
          <div className="mt-10 pt-4 flex flex-col items-center justify-center">
            <button
              type="button"
              onClick={onReveal}
              className="w-full sm:w-auto min-w-[240px] px-8 py-3.5 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-semibold text-[15px] shadow-sm hover:shadow transition-all duration-150 flex items-center justify-center gap-2.5 cursor-pointer active:scale-[0.99]"
            >
              <span className="material-symbols-outlined text-[20px]">visibility</span>
              <span>显示答案</span>
              <kbd className="ml-2 font-mono text-[11px] px-2 py-0.5 rounded bg-white/20 text-white font-semibold">
                Space
              </kbd>
            </button>
            <span className="mt-2 text-on-surface-variant text-[12px] font-mono">
              点击按钮或按空格键展开答案
            </span>
          </div>
        )}
      </div>

      {isRevealed && (
        <div className="sticky bottom-0 z-30 w-[calc(100%+2rem)] -mx-4 mt-6 border-t border-outline-variant/30 bg-surface/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md animate-slideUp sm:static sm:w-full sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
          {submitError && (
            <div
              role="alert"
              className="mx-auto mb-3 max-w-2xl rounded-xl border border-error/30 bg-error-container px-4 py-3 text-body-md text-on-error-container"
            >
              {submitError}
            </div>
          )}
          <RatingDock onRate={onRate} disabled={isSubmitting} />
        </div>
      )}
    </div>
  );
};
