import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getApiErrorMessage } from '../../api/client';
import { cardsTotalQueryOptions } from '../../api/cards';
import { calendarQueryOptions } from '../../api/calendar';
import { reviewDueTotalQueryOptions } from '../../api/review';
import { topicsTotalQueryOptions } from '../../api/topics';
import { Button } from '../../components/ui/Button';
import { InlineError, InlineLoading } from './DashboardStates';
import { MetricCaption, MetricCard, MetricValue } from './MetricCard';

interface TodayMetricsProps {
  /** 后端 calendar_timezone 下的今天 (YYYY-MM-DD)。 */
  today: string;
  onStartReview: () => void;
}

/**
 * 今日关键统计卡 + 快速开始复习入口。
 *
 * 数字全部来自服务端 total / calendar 汇总:
 * - 今日待复习: review/due?limit=1 的 total (不用截断队列长度)。
 * - 今日复习 / 今日新增: 当日 calendar 的 review_events / created_cards。
 * - 总卡片容量 / 分类数: cards、topics 的 total。
 * 每个数字使用独立查询, 单一失败不影响其他数字。
 */
export const TodayMetrics: React.FC<TodayMetricsProps> = ({ today, onStartReview }) => {
  const dueQuery = useQuery(reviewDueTotalQueryOptions());
  const calendarQuery = useQuery(calendarQueryOptions(today, today));
  const cardsQuery = useQuery(cardsTotalQueryOptions());
  const topicsQuery = useQuery(topicsTotalQueryOptions());

  const todayDay = calendarQuery.data?.days[0];

  return (
    <section aria-label="今日统计" className="grid gap-4 lg:grid-cols-3">
      <MetricCard eyebrow="今日待复习" english="Due" icon="event_upcoming">
        {dueQuery.isPending && <InlineLoading label="正在统计到期数量" />}
        {dueQuery.isError && (
          <InlineError message={getApiErrorMessage(dueQuery.error)} onRetry={() => void dueQuery.refetch()} />
        )}
        {dueQuery.isSuccess && <MetricValue>{dueQuery.data.total}</MetricValue>}
        <MetricCaption>到期卡片总数, 使用完整 total 而非截断队列长度。</MetricCaption>
        <Button className="mt-auto w-full" onClick={onStartReview}>
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            play_arrow
          </span>
          开始复习
        </Button>
      </MetricCard>

      <MetricCard eyebrow="今日复习数量" english="Reviewed" icon="task_alt">
        {calendarQuery.isPending && <InlineLoading label="正在读取复习统计" />}
        {calendarQuery.isError && (
          <InlineError
            message={getApiErrorMessage(calendarQuery.error)}
            onRetry={() => void calendarQuery.refetch()}
          />
        )}
        {calendarQuery.isSuccess && <MetricValue>{todayDay?.review_events ?? 0}</MetricValue>}
        <MetricCaption>今天完成的复习评分次数 (calendar review_events)。</MetricCaption>
      </MetricCard>

      <MetricCard eyebrow="今日新增卡片数量" english="Created" icon="note_add">
        {calendarQuery.isPending && <InlineLoading label="正在读取制卡统计" />}
        {calendarQuery.isError && (
          <InlineError
            message={getApiErrorMessage(calendarQuery.error)}
            onRetry={() => void calendarQuery.refetch()}
          />
        )}
        {calendarQuery.isSuccess && <MetricValue>{todayDay?.created_cards ?? 0}</MetricValue>}
        <MetricCaption>今天新入库的卡片数 (calendar created_cards)。</MetricCaption>
      </MetricCard>

      <dl className="flex flex-col gap-2 rounded-2xl border border-outline-variant/40 bg-surface-container-low px-5 py-4 text-body-md sm:flex-row sm:items-center sm:gap-8 lg:col-span-3">
        <div className="flex items-center gap-2">
          <dt className="text-on-surface-variant">总卡片容量:</dt>
          <dd className="font-semibold text-on-surface">
            {cardsQuery.isError ? (
              <InlineError message="读取失败" onRetry={() => void cardsQuery.refetch()} />
            ) : cardsQuery.isPending ? (
              <InlineLoading label="统计中" />
            ) : (
              `${cardsQuery.data.total} 张`
            )}
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="text-on-surface-variant">知识分类:</dt>
          <dd className="font-semibold text-on-surface">
            {topicsQuery.isError ? (
              <InlineError message="读取失败" onRetry={() => void topicsQuery.refetch()} />
            ) : topicsQuery.isPending ? (
              <InlineLoading label="统计中" />
            ) : (
              `${topicsQuery.data.total} 个`
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
};
