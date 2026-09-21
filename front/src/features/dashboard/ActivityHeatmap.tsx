import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getApiErrorMessage } from '../../api/client';
import { CALENDAR_HEATMAP_DAYS, calendarQueryOptions } from '../../api/calendar';
import {
  buildDayAriaLabel,
  buildDateRange,
  buildHeatmapDays,
  buildHeatmapSummaryText,
  buildHeatmapWeeks,
  HEATMAP_FILTER_LABELS,
  HEATMAP_LEVEL_LABELS,
  HeatmapEventFilter,
  heatmapLevel,
  heatmapValue
} from '../../utils/heatmap';
import { InlineEmpty, InlineError, InlineLoading } from './DashboardStates';

interface ActivityHeatmapProps {
  /** 后端 calendar_timezone 下的今天 (YYYY-MM-DD)。 */
  today: string;
}

// 单元格几何常量: 12px 方格 + 2px 间隙。
const CELL = 12;
const STEP = 14;
const PAD_LEFT = 26;
const PAD_TOP = 20;

/** 五个强度等级的空格颜色, 0 为空白。 */
const LEVEL_COLORS = ['#ebedf0', '#c6f6df', '#6ee7b7', '#10b981', '#047857'] as const;

const WEEKDAY_LABELS: { row: number; label: string }[] = [
  { row: 1, label: '一' },
  { row: 3, label: '三' },
  { row: 5, label: '五' }
];

const FILTERS: HeatmapEventFilter[] = ['all', 'reviews', 'created'];

/**
 * 学习热力图。
 *
 * 使用最多 366 天的 calendar 查询, 前端补零缺失自然日; 支持全部/仅复习/仅制卡
 * 三种切换, 只使用真实字段。以 SVG 绘制, 带 role=img 的文本摘要和每格
 * <title>, 不只依赖颜色传递信息。
 */
export const ActivityHeatmap: React.FC<ActivityHeatmapProps> = ({ today }) => {
  const [filter, setFilter] = useState<HeatmapEventFilter>('all');

  const dateRange = useMemo(() => buildDateRange(today, CALENDAR_HEATMAP_DAYS), [today]);
  const from = dateRange[0];
  const to = dateRange[dateRange.length - 1];

  const calendarQuery = useQuery(calendarQueryOptions(from, to));

  const days = useMemo(
    () => buildHeatmapDays(from, to, calendarQuery.data?.days),
    [from, to, calendarQuery.data]
  );
  const { weeks, monthLabels } = useMemo(() => buildHeatmapWeeks(days), [days]);
  const summaryText = useMemo(
    () => buildHeatmapSummaryText(days, filter, { from, to }),
    [days, filter, from, to]
  );

  const hasActivity = days.some((day) => heatmapValue(day, filter) > 0);
  const svgWidth = PAD_LEFT + weeks.length * STEP;
  const svgHeight = PAD_TOP + 7 * STEP;

  return (
    <section
      aria-label="学习热力图"
      className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card"
    >
      <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-headline-sm text-on-surface">
            <span className="material-symbols-outlined text-[22px] text-primary" aria-hidden="true">
              calendar_view_month
            </span>
            学习热力图 (Activity Heatmap)
          </h2>
          <p className="mt-1 text-body-md text-on-surface-variant">{summaryText}</p>
        </div>

        <div role="group" aria-label="热力图事件筛选" className="flex flex-wrap gap-1.5">
          {FILTERS.map((option) => {
            const active = filter === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(option)}
                className={`rounded-lg px-3 py-1.5 text-label-md transition-colors focus:outline-none focus:ring-2 focus:ring-primary/25 ${
                  active
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {HEATMAP_FILTER_LABELS[option]}
              </button>
            );
          })}
        </div>
      </header>

      {calendarQuery.isPending && (
        <div className="mt-5">
          <InlineLoading label="正在加载学习热力图" />
        </div>
      )}

      {calendarQuery.isError && (
        <div className="mt-5">
          <InlineError
            message={getApiErrorMessage(calendarQuery.error)}
            onRetry={() => void calendarQuery.refetch()}
          />
        </div>
      )}

      {calendarQuery.isSuccess && (
        <>
          {!hasActivity && (
            <div className="mt-5">
              <InlineEmpty message="最近一年暂无可统计的复习或制卡事件。" />
            </div>
          )}

          <div
            className="mt-5 overflow-x-auto pb-1 focus:outline-none focus:ring-2 focus:ring-primary/25"
            tabIndex={0}
            role="group"
            aria-label={`热力图区间 ${from} 至 ${to}, 共 ${days.length} 天, 可横向滚动查看。`}
          >
            <svg
              role="img"
              aria-label={summaryText}
              width={svgWidth}
              height={svgHeight}
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="block"
            >
              {monthLabels.map((month) => (
                <text
                  key={`${month.column}-${month.label}`}
                  x={PAD_LEFT + month.column * STEP}
                  y={12}
                  aria-hidden="true"
                  className="fill-on-surface-variant font-mono text-[10px]"
                >
                  {month.label}
                </text>
              ))}

              {WEEKDAY_LABELS.map((weekday) => (
                <text
                  key={weekday.label}
                  x={0}
                  y={PAD_TOP + weekday.row * STEP + 10}
                  aria-hidden="true"
                  className="fill-on-surface-variant font-mono text-[10px]"
                >
                  {weekday.label}
                </text>
              ))}

              {weeks.map((week, column) =>
                week.map((day, row) => {
                  if (day === null) return null;
                  const value = heatmapValue(day, filter);
                  const level = heatmapLevel(value);
                  return (
                    <rect
                      key={day.date}
                      x={PAD_LEFT + column * STEP}
                      y={PAD_TOP + row * STEP}
                      width={CELL}
                      height={CELL}
                      rx={2}
                      fill={LEVEL_COLORS[level]}
                    >
                      <title>{buildDayAriaLabel(day, filter)}</title>
                    </rect>
                  );
                })
              )}
            </svg>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-label-sm text-on-surface-variant">
            <span>图例</span>
            <ul className="flex flex-wrap items-center gap-3">
              {HEATMAP_LEVEL_LABELS.map((label, level) => (
                <li key={label} className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="inline-block h-3 w-3 rounded-sm border border-outline-variant/40"
                    style={{ backgroundColor: LEVEL_COLORS[level] }}
                  />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
};
