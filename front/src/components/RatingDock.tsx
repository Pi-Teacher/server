import React from 'react';
import {
  FSRSRating,
  FSRS_RATING_META,
  FSRS_RATING_ORDER,
  getRatingShortcut
} from '../types';

interface RatingDockProps {
  onRate: (rating: FSRSRating) => void;
  disabled?: boolean;
}

/**
 * FSRS 四档评分栏. 后端只接收 rating 字符串, 当前队列接口不返回评分前间隔预览,
 * 因此这里只展示 Again、Hard、Good、Easy 及对应快捷键.
 */
export const RatingDock: React.FC<RatingDockProps> = ({ onRate, disabled = false }) => {
  return (
    <div className="w-full max-w-2xl mx-auto pt-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {FSRS_RATING_ORDER.map((type) => {
          const meta = FSRS_RATING_META[type];
          return (
            <button
              key={type}
              type="button"
              aria-label={`${getRatingShortcut(type)} ${meta.label} ${meta.english}`}
              disabled={disabled}
              onClick={() => onRate(type)}
              className={`relative flex flex-col items-center justify-center py-3.5 px-3 rounded-xl border ${meta.bgClass} ${meta.borderClass} ${meta.textClass} ${meta.hoverClass} hover:shadow-sm active:scale-[0.99] transition-all duration-150 cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100`}
            >
              <span className="absolute top-2 right-2 w-5 h-5 rounded flex items-center justify-center font-mono text-[11px] font-semibold bg-white/70 border border-outline-variant/40">
                {getRatingShortcut(type)}
              </span>

              <span className="font-headline-sm text-[16px] font-semibold tracking-tight">
                {meta.label}
              </span>

              <span className="font-mono text-[11px] uppercase tracking-wider opacity-70 mt-0.5">
                {meta.english}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-center font-mono text-[11px] text-on-surface-variant mt-3">
        {disabled ? (
          '正在提交评分，请稍候'
        ) : (
          <>
            按{' '}
            {FSRS_RATING_ORDER.map((type, index) => (
              <React.Fragment key={type}>
                {index > 0 && <span className="mx-1 text-outline-variant">·</span>}
                <kbd className="mx-0.5 px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface font-semibold border border-outline-variant/40">
                  {getRatingShortcut(type)}
                </kbd>
                {FSRS_RATING_META[type].label}
              </React.Fragment>
            ))}
          </>
        )}
      </p>
    </div>
  );
};
