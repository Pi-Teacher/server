import React from 'react';

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

      <div className="border-t border-outline-variant/30 bg-surface-container-low p-3">
        <div className="flex items-center gap-3 rounded-xl p-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
            <span className="material-symbols-outlined text-[20px]">person</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-on-surface">本地用户</p>
            <p className="truncate font-mono text-[11px] text-on-surface-variant">Single-user instance</p>
          </div>
          <button type="button" title="退出登录" aria-label="退出登录" onClick={onLogout} className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container hover:text-error">
            <span className="material-symbols-outlined text-[19px]">logout</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
