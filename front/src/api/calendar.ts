import { queryOptions } from '@tanstack/react-query';
import { apiRequest } from './client';

/**
 * 学习日历 (/api/web/calendar)。
 *
 * 后端按 calendar_timezone 归属自然日累计, 只返回 [from, to] 闭区间内
 * 有数据的自然日; 响应中缺失的自然日由前端补零, 不臆造数据。
 */
export interface CalendarDay {
  /** YYYY-MM-DD, 归属时区由 /api/web/settings 的 calendar_timezone 决定。 */
  date: string;
  created_cards: number;
  review_events: number;
}

interface CalendarResponse {
  days: CalendarDay[];
}

/** 单次查询允许的最大自然日跨度 (闭区间), 与后端 366 天上限一致。 */
export const CALENDAR_MAX_DAYS = 366;

/** 热力图默认展示的最近天数 (含今天), 恰好等于后端上限。 */
export const CALENDAR_HEATMAP_DAYS = 366;

export const calendarQueryKey = (from: string, to: string) =>
  ['calendar', 'range', { from, to }] as const;

export const buildCalendarPath = (from: string, to: string): string => {
  const search = new URLSearchParams({ from, to });
  return `/api/web/calendar?${search.toString()}`;
};

export const fetchCalendar = (
  from: string,
  to: string,
  signal?: AbortSignal
): Promise<CalendarResponse> =>
  apiRequest<CalendarResponse>(buildCalendarPath(from, to), { signal });

export const calendarQueryOptions = (from: string, to: string) =>
  queryOptions({
    queryKey: calendarQueryKey(from, to),
    queryFn: ({ signal }) => fetchCalendar(from, to, signal),
    // 日历是当日累计统计, 进入页面即需最新值。
    staleTime: 0
  });
