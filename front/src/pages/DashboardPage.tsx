import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { generalSettingsQueryOptions } from '../api/settings';
import { PageHeader } from '../components/ui/PageHeader';
import { todayInTimezone } from '../utils/heatmap';
import { ActivityHeatmap } from '../features/dashboard/ActivityHeatmap';
import { ProposalEntry } from '../features/dashboard/ProposalEntry';
import { RandomQuoteBanner } from '../features/dashboard/RandomQuoteBanner';
import { TodayMetrics } from '../features/dashboard/TodayMetrics';

/**
 * Dashboard 首页 (只读)。
 *
 * 组合各独立数据区域, 每个区域使用自己的 React Query 状态, 单一区域失败
 * 不会阻塞其他区域。不创建或修改任何业务对象。
 *
 * "今天" 按后端 calendar_timezone 推导: 复用通用设置查询, 设置缺失或非法时
 * 在 todayInTimezone 内降级为浏览器时区, 不硬编码时区。
 */
export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const settingsQuery = useQuery(generalSettingsQueryOptions());

  const today = useMemo(
    () => todayInTimezone(settingsQuery.data?.calendar_timezone),
    [settingsQuery.data]
  );

  return (
    <div className="min-h-full bg-surface">
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="今日复习与制卡概览、学习热力图, 以及快速开始复习入口。全部数据来自服务端, 页面只读。"
      />

      <main className="p-4 sm:p-6 lg:p-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          <RandomQuoteBanner />
          <TodayMetrics today={today} onStartReview={() => navigate('/review')} />
          <ActivityHeatmap today={today} />
          <ProposalEntry onOpenApprovals={() => navigate('/approvals')} />
        </div>
      </main>
    </div>
  );
};

export default DashboardPage;
