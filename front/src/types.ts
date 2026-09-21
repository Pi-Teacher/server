import { ReviewRating } from './api/review';

export type FSRSRating = ReviewRating;

/** 复习会话本地统计, 只累计服务端确认成功的评分. */
export interface ReviewSessionSummary {
  reviewedCount: number;
  againCount: number;
  hardCount: number;
  goodCount: number;
  easyCount: number;
  averageTimeSeconds: number;
  totalTimeSeconds: number;
}

/**
 * 评分顺序与后端领域枚举和常见复习习惯一致:
 * 1 = Again, 2 = Hard, 3 = Good, 4 = Easy.
 * RatingDock 与键盘监听都从此处派生, 避免展示与快捷键不一致.
 */
export const FSRS_RATING_ORDER: FSRSRating[] = ['again', 'hard', 'good', 'easy'];

/** 由展示顺序派生的快捷键映射. */
export const RATING_SHORTCUT_MAP: Record<string, FSRSRating> = FSRS_RATING_ORDER.reduce(
  (acc, rating, index) => {
    acc[String(index + 1)] = rating;
    return acc;
  },
  {} as Record<string, FSRSRating>
);

export const getRatingShortcut = (rating: FSRSRating): string =>
  String(FSRS_RATING_ORDER.indexOf(rating) + 1);

export const FSRS_RATING_META: Record<
  FSRSRating,
  {
    label: string;
    english: string;
    bgClass: string;
    textClass: string;
    borderClass: string;
    hoverClass: string;
  }
> = {
  again: {
    label: '忘记',
    english: 'Again',
    bgClass: 'bg-fsrs-again-bg',
    textClass: 'text-fsrs-again-text',
    borderClass: 'border-fsrs-again-border',
    hoverClass: 'hover:border-fsrs-again'
  },
  hard: {
    label: '困难',
    english: 'Hard',
    bgClass: 'bg-fsrs-hard-bg',
    textClass: 'text-fsrs-hard-text',
    borderClass: 'border-fsrs-hard-border',
    hoverClass: 'hover:border-fsrs-hard'
  },
  good: {
    label: '良好',
    english: 'Good',
    bgClass: 'bg-fsrs-good-bg',
    textClass: 'text-fsrs-good-text',
    borderClass: 'border-fsrs-good-border',
    hoverClass: 'hover:border-fsrs-good'
  },
  easy: {
    label: '简单',
    english: 'Easy',
    bgClass: 'bg-fsrs-easy-bg',
    textClass: 'text-fsrs-easy-text',
    borderClass: 'border-fsrs-easy-border',
    hoverClass: 'hover:border-fsrs-easy'
  }
};
