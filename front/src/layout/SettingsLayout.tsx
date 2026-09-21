import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';

/** 系统设置的二级导航项。路径相对 /settings, 全部在 App 的 settings 路由下展开。日志查看已独立为侧栏 /logs。 */
const tabs = [
  { path: 'general', label: '通用' },
  { path: 'embedding', label: 'Embedding' },
  { path: 'api-keys', label: 'API Key' },
  { path: 'password', label: '修改密码' }
] as const;

/**
 * 系统设置外壳: 顶部标签条在所有屏幕尺寸下横向可滑动,
 * 内容区由各子路由渲染, 每个子页只负责自己的 API 区域。
 */
export const SettingsLayout: React.FC = () => (
  <div className="min-h-full bg-surface">
    <PageHeader
      eyebrow="阶段 7"
      title="系统设置"
      description="按区域分页管理: 通用、Embedding、API Key 与修改密码。各页独立加载与保存。"
    />
    <nav
      aria-label="设置分区"
      className="sticky top-0 z-10 border-b border-outline-variant/30 bg-surface-container-lowest/95 backdrop-blur lg:top-0"
    >
      <div className="flex gap-1 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8">
        {tabs.map((tab) => (
          <NavLink
            key={tab.path}
            to={`/settings/${tab.path}`}
            className={({ isActive }) =>
              `shrink-0 rounded-full px-4 py-2 text-body-sm transition-colors ${
                isActive
                  ? 'bg-primary-container font-semibold text-on-primary'
                  : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
    <main className="space-y-4 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <Outlet />
    </main>
  </div>
);
