import { describe, expect, it } from 'vitest';
import {
  addDays,
  buildDateRange,
  buildDayAriaLabel,
  buildHeatmapDays,
  buildHeatmapSummaryText,
  buildHeatmapWeeks,
  heatmapLevel,
  heatmapValue,
  todayInTimezone
} from './heatmap';

describe('todayInTimezone', () => {
  it('按给定时区推导自然日', () => {
    // 2026-01-01T00:30:00Z 在 UTC 是 1 月 1 日, 在 Los_Angeles 仍是 12 月 31 日。
    const instant = new Date('2026-01-01T00:30:00Z');
    expect(todayInTimezone('UTC', instant)).toBe('2026-01-01');
    expect(todayInTimezone('America/Los_Angeles', instant)).toBe('2025-12-31');
  });

  it('非法时区降级为浏览器时区而不抛错', () => {
    const instant = new Date('2026-01-01T00:30:00Z');
    expect(() => todayInTimezone('Not/AZone', instant)).not.toThrow();
    expect(todayInTimezone('Not/AZone', instant)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('未提供时区时使用浏览器时区', () => {
    expect(todayInTimezone(undefined, new Date('2026-01-01T00:30:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('addDays / buildDateRange', () => {
  it('跨月跨年正确加减', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });

  it('生成闭区间升序日期且长度正确', () => {
    const range = buildDateRange('2026-01-03', 3);
    expect(range).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
    expect(buildDateRange('2026-01-03', 366)).toHaveLength(366);
  });
});

describe('buildHeatmapDays', () => {
  it('缺失自然日补零并保持升序', () => {
    const days = buildHeatmapDays('2026-01-01', '2026-01-03', [
      { date: '2026-01-03', created_cards: 2, review_events: 5 }
    ]);
    expect(days).toEqual([
      { date: '2026-01-01', created_cards: 0, review_events: 0 },
      { date: '2026-01-02', created_cards: 0, review_events: 0 },
      { date: '2026-01-03', created_cards: 2, review_events: 5 }
    ]);
  });

  it('忽略区间外与非法日期', () => {
    const days = buildHeatmapDays('2026-01-01', '2026-01-02', [
      { date: '2025-12-31', created_cards: 9, review_events: 9 },
      { date: 'not-a-date', created_cards: 9, review_events: 9 }
    ]);
    expect(days.every((day) => day.created_cards === 0 && day.review_events === 0)).toBe(true);
  });

  it('区间非法时返回空数组', () => {
    expect(buildHeatmapDays('2026-01-03', '2026-01-01', [])).toEqual([]);
  });
});

describe('heatmapValue / heatmapLevel', () => {
  const day = { date: '2026-01-01', created_cards: 3, review_events: 7 };

  it('按事件类型取值', () => {
    expect(heatmapValue(day, 'all')).toBe(10);
    expect(heatmapValue(day, 'reviews')).toBe(7);
    expect(heatmapValue(day, 'created')).toBe(3);
  });

  it('分级阈值边界', () => {
    expect(heatmapLevel(0)).toBe(0);
    expect(heatmapLevel(1)).toBe(1);
    expect(heatmapLevel(5)).toBe(1);
    expect(heatmapLevel(6)).toBe(2);
    expect(heatmapLevel(12)).toBe(2);
    expect(heatmapLevel(13)).toBe(3);
    expect(heatmapLevel(20)).toBe(3);
    expect(heatmapLevel(21)).toBe(4);
  });
});

describe('buildHeatmapWeeks', () => {
  it('首周前面按星期几补 null 并对齐 7 行', () => {
    // 2026-01-01 是星期四, 前面应有 4 个 null (日一二三)。
    const days = buildHeatmapDays('2026-01-01', '2026-01-07', []);
    const { weeks } = buildHeatmapWeeks(days);
    expect(weeks[0].slice(0, 4).every((cell) => cell === null)).toBe(true);
    expect(weeks[0][4]?.date).toBe('2026-01-01');
    expect(weeks.every((week) => week.length === 7)).toBe(true);
  });

  it('给出月份变化处的列标签', () => {
    const days = buildHeatmapDays('2026-01-25', '2026-02-05', []);
    const { monthLabels } = buildHeatmapWeeks(days);
    expect(monthLabels[0].label).toBe('1月');
    expect(monthLabels.some((month) => month.label === '2月')).toBe(true);
  });

  it('空输入返回空结构', () => {
    expect(buildHeatmapWeeks([])).toEqual({ weeks: [], monthLabels: [] });
  });
});

describe('文本摘要与可访问名称', () => {
  const days = [
    { date: '2026-01-01', created_cards: 2, review_events: 5 },
    { date: '2026-01-02', created_cards: 0, review_events: 0 }
  ];

  it('分别只包含真实字段的汇总', () => {
    expect(buildHeatmapSummaryText(days, 'reviews', { from: '2026-01-01', to: '2026-01-02' })).toContain('5 次复习');
    expect(buildHeatmapSummaryText(days, 'created', { from: '2026-01-01', to: '2026-01-02' })).toContain('2 张卡片');
    const all = buildHeatmapSummaryText(days, 'all', { from: '2026-01-01', to: '2026-01-02' });
    expect(all).toContain('5 次复习');
    expect(all).toContain('2 张卡片');
  });

  it('每格可访问名称反映日期与真实数量', () => {
    expect(buildDayAriaLabel(days[0], 'reviews')).toBe('2026-01-01: 5 次复习');
    expect(buildDayAriaLabel(days[0], 'created')).toBe('2026-01-01: 新增 2 张卡片');
    expect(buildDayAriaLabel(days[0], 'all')).toContain('5 次复习');
  });
});
