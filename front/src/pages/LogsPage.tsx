import React from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { LogsPanel } from '../features/settings/LogsPanel';

/**
 * 日志查看独立页面 (侧栏入口 /logs)。
 * 日志相关配置已并入设置「通用」页, 此页只负责检索与展示。
 */
export const LogsPage: React.FC = () => (
  <div className="min-h-full bg-surface">
    <PageHeader
      eyebrow="运行日志"
      title="日志查看"
      description="检索写入 app_log 的关键事件。日志级别与保留策略在「系统设置 · 通用」中配置。"
    />
    <main className="space-y-4 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <LogsPanel />
    </main>
  </div>
);

export default LogsPage;
