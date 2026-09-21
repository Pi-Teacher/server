import { CalendarDay } from '../api/calendar';

/**
 * 学习热力图纯函数。
 *
 * 后端 calendar 只返回有数据的自然日, 且按 calendar_timezone 归属日期。
 * 这里负责: 按后端时区推导"今天"、补齐缺失自然日为零、计算强度等级和文本摘要。
 * 不在此处发起请求, 也不依赖浏览器本地时区语义。
 */

export type HeatmapEventFilter = 'all' | 'reviews' | 'created';

export interface HeatmapDay {
  /** YYYY-MM-DD。 */
  date: string;
  created_cards: number;
  review_events: number;
}

const DAY_MS = 86_400_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 强度分级阈值 (次数上界); 索引即等级, 0 表示空白。 */
const LEVEL_THRESHOLDS = [0, 5, 12, 20] as const;

export const HEATMAP_FILTER_LABELS: Record<HeatmapEventFilter, string> = {
  all: '全部事件',
  reviews: '仅复习',
  created: '仅制卡'
};

export const HEATMAP_LEVEL_LABELS = ['空白', '1-5 次', '6-12 次', '13-20 次', '>20 次'] as const;

/** 指定时区下的"今天"。时区非法或解析失败时回退浏览器时区, 绝不抛错。 */
export const todayInTimezone = (timeZone?: string, now: Date = new Date()): string => {
  const format = (zone?: string) => {
    // en-CA 的短日期格式恰好是 YYYY-MM-DD。
    const formatter = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      ...(zone ? { timeZone: zone } : {})
    });
    return formatter.format(now);
  };

  if (timeZone) {
    try {
      return format(timeZone);
    } catch {
      // 非法 IANA 名或运行时不支持该时区时, 降级到浏览器时区。
    }
  }
  return format(undefined);
};

/** 以 UTC 零点为锚点做日期加减, 避免跨夏令时造成的日偏移。 */
export const addDays = (dateKey: string, delta: number): string => {
  const base = Date.parse(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(base)) return dateKey;
  return new Date(base + delta * DAY_MS).toISOString().slice(0, 10);
};

/** 生成 [endDate - (days - 1), endDate] 的升序自然日列表, 闭区间。 */
export const buildDateRange = (endDate: string, days: number): string[] => {
  const safeDays = Math.max(1, Math.trunc(days));
  const start = addDays(endDate, -(safeDays - 1));
  const result: string[] = [];
  for (let i = 0; i < safeDays; i += 1) {
    result.push(addDays(start, i));
  }
  return result;
};

export const heatmapValue = (day: HeatmapDay, filter: HeatmapEventFilter): number => {
  if (filter === 'reviews') return day.review_events;
  if (filter === 'created') return day.created_cards;
  return day.review_events + day.created_cards;
};

export const heatmapLevel = (value: number): number => {
  if (value <= LEVEL_THRESHOLDS[0]) return 0;
  if (value <= LEVEL_THRESHOLDS[1]) return 1;
  if (value <= LEVEL_THRESHOLDS[2]) return 2;
  if (value <= LEVEL_THRESHOLDS[3]) return 3;
  return 4;
};

/**
 * 按区间补齐自然日: 后端未返回的日期补零。
 * 返回顺序与区间一致 (升序), 保证热力图列/行稳定。
 */
export const buildHeatmapDays = (
  from: string,
  to: string,
  data: CalendarDay[] | undefined
): HeatmapDay[] => {
  const byDate = new Map<string, CalendarDay>();
  (data ?? []).forEach((day) => {
    if (DATE_PATTERN.test(day.date)) byDate.set(day.date, day);
  });

  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || start > end) return [];

  const totalDays = Math.trunc((end - start) / DAY_MS) + 1;
  const result: HeatmapDay[] = [];
  for (let i = 0; i < totalDays; i += 1) {
    const date = addDays(from, i);
    const source = byDate.get(date);
    result.push({
      date,
      created_cards: source?.created_cards ?? 0,
      review_events: source?.review_events ?? 0
    });
  }
  return result;
};

export const summarizeHeatmap = (
  days: HeatmapDay[]
): { reviews: number; created: number } =>
  days.reduce(
    (acc, day) => ({
      reviews: acc.reviews + day.review_events,
      created: acc.created + day.created_cards
    }),
    { reviews: 0, created: 0 }
  );

const formatCount = (value: number) => value.toLocaleString('zh-CN');

/** 热力图文本摘要, 供视觉辅助与可访问名称使用, 不依赖颜色传达信息。 */
export const buildHeatmapSummaryText = (
  days: HeatmapDay[],
  filter: HeatmapEventFilter,
  range: { from: string; to: string }
): string => {
  const { reviews, created } = summarizeHeatmap(days);
  const period = `从 ${range.from} 到 ${range.to}`;
  if (filter === 'reviews') {
    return `${period}共 ${formatCount(reviews)} 次复习。`;
  }
  if (filter === 'created') {
    return `${period}共新增 ${formatCount(created)} 张卡片。`;
  }
  return `${period}共 ${formatCount(reviews)} 次复习、新增 ${formatCount(created)} 张卡片。`;
};

/** 月名简写, 用于热力图列顶部标签。 */
const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

const utcWeekday = (dateKey: string): number => {
  const parsed = Date.parse(`${dateKey}T00:00:00Z`);
  return Number.isNaN(parsed) ? 0 : new Date(parsed).getUTCDay();
};

/**
 * 把升序自然日列表切成周列 (每周 7 行, 起始星期日)。
 * 首周前用 null 占位, 保证同一周内的星期几纵向对齐; 同时给出每列
 * 需要显示月份的列索引, 供热力图绘制顶部月份标签。
 */
export const buildHeatmapWeeks = (
  days: HeatmapDay[]
): { weeks: (HeatmapDay | null)[][]; monthLabels: { column: number; label: string }[] } => {
  if (days.length === 0) return { weeks: [], monthLabels: [] };

  const cells: (HeatmapDay | null)[] = new Array(utcWeekday(days[0].date)).fill(null);
  cells.push(...days);
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (HeatmapDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  const monthLabels: { column: number; label: string }[] = [];
  let previousMonth = '';
  weeks.forEach((week, column) => {
    const firstDay = week.find((day): day is HeatmapDay => day !== null);
    if (!firstDay) return;
    const month = firstDay.date.slice(0, 7);
    if (month !== previousMonth) {
      previousMonth = month;
      monthLabels.push({ column, label: MONTH_LABELS[Number(firstDay.date.slice(5, 7)) - 1] ?? '' });
    }
  });

  return { weeks, monthLabels };
};

/** 某天的事件摘要文本, 作为每个热力图格子的可访问名称。 */
export const buildDayAriaLabel = (day: HeatmapDay, filter: HeatmapEventFilter): string => {
  if (filter === 'reviews') {
    return `${day.date}: ${day.review_events} 次复习`;
  }
  if (filter === 'created') {
    return `${day.date}: 新增 ${day.created_cards} 张卡片`;
  }
  return `${day.date}: ${day.review_events} 次复习, 新增 ${day.created_cards} 张卡片`;
};
