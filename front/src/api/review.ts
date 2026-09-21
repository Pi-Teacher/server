import { mutationOptions, queryOptions } from '@tanstack/react-query';
import { apiRequest } from './client';

export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';
export type ReviewTopicFilter = number | null;
export type ReviewScheduleState = 'new' | 'learning' | 'review' | 'relearning' | 'unknown';

export interface DueReviewItem {
  card_id: number;
  front: string;
  back: string;
  /** 无 Topic 在响应中为 null; 0 只用于查询参数表达“无 Topic”. */
  topic_id: number | null;
  card_version: number;
  due: string;
  state: ReviewScheduleState;
  schedule_version: number;
  reps: number;
  lapses: number;
}

export interface DueReviewResponse {
  items: DueReviewItem[];
  total: number;
}

export interface SubmitReviewRequest {
  cardId: number;
  rating: ReviewRating;
  expectedCardVersion: number;
  expectedScheduleVersion: number;
}

export interface ReviewSchedule {
  due: string;
  state: ReviewScheduleState;
  stability: number;
  difficulty: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  last_review_at: string | null;
  version: number;
}

export interface SubmitReviewResponse {
  card_id: number;
  rating: ReviewRating;
  schedule: ReviewSchedule;
  review_log_id: number;
}

export const REVIEW_DUE_LIMIT = 100;

export const reviewDueQueryKey = (topicId: ReviewTopicFilter) =>
  ['review', 'due', topicId] as const;

export const buildReviewDuePath = (
  topicId: ReviewTopicFilter,
  limit = REVIEW_DUE_LIMIT
): string => {
  const search = new URLSearchParams({ limit: String(limit) });
  if (topicId !== null) search.set('topic_id', String(topicId));
  return `/api/web/review/due?${search.toString()}`;
};

export const fetchReviewDue = (
  topicId: ReviewTopicFilter,
  signal?: AbortSignal
): Promise<DueReviewResponse> =>
  apiRequest<DueReviewResponse>(buildReviewDuePath(topicId), { signal });

export const reviewDueQueryOptions = (topicId: ReviewTopicFilter) =>
  queryOptions({
    queryKey: reviewDueQueryKey(topicId),
    queryFn: ({ signal }) => fetchReviewDue(topicId, signal),
    // 到期项携带乐观锁版本, 离开筛选后不保留旧队列, 再次进入必须重新请求.
    staleTime: 0,
    gcTime: 0
  });

/**
 * Dashboard 用的到期总数: 只消费 total, 不推进 Review 队列。
 * 用 limit=1 取最小载荷, 避免用截断后的 items.length 冒充全局总数。
 */
export const reviewDueTotalQueryKey = ['review', 'due', 'total'] as const;

export const fetchReviewDueTotal = (signal?: AbortSignal): Promise<DueReviewResponse> =>
  apiRequest<DueReviewResponse>(buildReviewDuePath(null, 1), { signal });

export const reviewDueTotalQueryOptions = () =>
  queryOptions({
    queryKey: reviewDueTotalQueryKey,
    queryFn: ({ signal }) => fetchReviewDueTotal(signal),
    staleTime: 0
  });

export const submitReview = (request: SubmitReviewRequest): Promise<SubmitReviewResponse> =>
  apiRequest<SubmitReviewResponse>(`/api/web/review/${request.cardId}/submit`, {
    method: 'POST',
    body: {
      rating: request.rating,
      expected_card_version: request.expectedCardVersion,
      expected_schedule_version: request.expectedScheduleVersion
    }
  });

export const submitReviewMutationOptions = () =>
  mutationOptions({
    mutationFn: submitReview
  });
