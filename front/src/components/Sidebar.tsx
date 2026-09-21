import React, { useEffect, useState } from 'react';
import { ConceptHelpModal } from './ConceptHelpModal';

const REPOSITORY_URL = 'https://github.com/Pi-Teacher';

interface SidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  onLogout: () => void;
  badges?: Partial<Record<'review' | 'cards' | 'topics' | 'glossary' | 'approvals', number>>;
}

const mainItems = [
  { path: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { path: 'review', label: '卡片复习', icon: 'repeat' },
  { path: 'cards', label: '卡片管理', icon: 'style' },
  { path: 'topics', label: '知识分类', icon: 'folder_special' },
  { path: 'glossary', label: '术语表', icon: 'menu_book' },
  { path: 'approval-switches', label: '审批开关控制', icon: 'rule_settings' },
  { path: 'approvals', label: '提案审批', icon: 'smart_toy' }
] as const;

const secondaryItems = [
  { path: 'profile', label: '个人信息与偏好', icon: 'manage_accounts' },
  { path: 'settings', label: '系统设置', icon: 'settings' },
  { path: 'logs', label: '日志查看', icon: 'receipt_long' },
  { path: 'trash', label: '回收站', icon: 'delete' }
] as const;

export const Sidebar: React.FC<SidebarProps> = ({ currentPath, onNavigate, onLogout, badges = {} }) => {
  const [helpOpen, setHelpOpen] = useState(false);

  // 页面切换时关闭弹窗: 移动端抽屉随导航关闭, 避免弹窗遗留。
  useEffect(() => {
    setHelpOpen(false);
  }, [currentPath]);
  const renderItem = (item: (typeof mainItems)[number] | (typeof secondaryItems)[number]) => {
    const active = currentPath === item.path;
    const badge = item.path in badges ? badges[item.path as keyof typeof badges] : undefined;
    return (
      <button
        key={item.path}
        type="button"
        onClick={() => onNavigate(item.path)}
        className={`group flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left transition-colors ${
          active
            ? 'bg-primary-container font-semibold text-on-primary shadow-sm'
            : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
        }`}
      >
        <span className="flex items-center gap-3">
          <span className={`material-symbols-outlined text-[20px] ${active ? 'text-on-primary' : 'group-hover:text-primary'}`}>
            {item.icon}
          </span>
          <span className="text-[14px]">{item.label}</span>
        </span>
        {badge !== undefined && (
          <span className={`rounded-full px-2 py-0.5 font-mono text-[11px] ${active ? 'bg-white/15' : 'bg-surface-container-high'}`}>
            {badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside className="flex h-full min-h-screen w-72 flex-col border-r border-outline-variant/30 bg-surface-container-lowest shadow-subtle lg:fixed lg:left-0 lg:top-0 lg:z-50">
      <div className="flex h-16 items-center gap-2 border-b border-outline-variant/20 px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-on-primary">
          <span className="material-symbols-outlined text-[20px]">psychology</span>
        </div>
        <div className="min-w-0">
          <p className="truncate text-[16px] font-semibold text-on-surface">Pi Teacher</p>
          <p className="truncate font-mono text-[11px] text-on-surface-variant">FSRS Spaced Repetition</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {mainItems.map(renderItem)}
        <div className="my-3 h-px bg-surface-container-high" />
        {secondaryItems.map(renderItem)}
      </nav>

      <div className="flex flex-col gap-2 border-t border-outline-variant/30 bg-surface-container-low p-3">
        <button
          type="button"
          onClick={onLogout}
          title="退出登录"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-outline-variant/50 px-3 py-2 text-[13px] font-medium text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-error"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            logout
          </span>
          退出登录
        </button>
        <div className="flex gap-2">
          <a
            href={REPOSITORY_URL}
            target="_blank"
            rel="noreferrer"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-outline-variant/50 px-2 py-2 text-[13px] font-medium text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              code
            </span>
            项目仓库
          </a>
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-outline-variant/50 px-2 py-2 text-[13px] font-medium text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              help
            </span>
            使用说明
          </button>
        </div>
      </div>

      <ConceptHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </aside>
  );
};
