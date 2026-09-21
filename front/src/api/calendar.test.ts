import { describe, expect, it } from 'vitest';
import {
  buildCalendarPath,
  calendarQueryKey,
  CALENDAR_HEATMAP_DAYS,
  CALENDAR_MAX_DAYS
} from './calendar';

describe('calendar API', () => {
  it('构造 from/to 查询路径', () => {
    const url = new URL(buildCalendarPath('2026-01-01', '2026-01-31'), 'http://localhost');
    expect(url.pathname).toBe('/api/web/calendar');
    expect(url.searchParams.get('from')).toBe('2026-01-01');
    expect(url.searchParams.get('to')).toBe('2026-01-31');
  });

  it('热力图天数不超过后端 366 天上限', () => {
    expect(CALENDAR_HEATMAP_DAYS).toBeLessThanOrEqual(CALENDAR_MAX_DAYS);
    expect(CALENDAR_HEATMAP_DAYS).toBe(366);
  });

  it('query key 覆盖 from 与 to', () => {
    expect(calendarQueryKey('2026-01-01', '2026-01-02')).not.toEqual(
      calendarQueryKey('2026-01-01', '2026-01-03')
    );
    expect(calendarQueryKey('2026-01-01', '2026-01-02')).not.toEqual(
      calendarQueryKey('2026-01-02', '2026-01-02')
    );
  });
});
