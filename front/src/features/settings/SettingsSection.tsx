import React from 'react';

interface SettingsSectionProps {
  title: string;
  description?: string;
  /** 右侧操作区, 例如保存按钮或刷新。 */
  actions?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * 设置页的卡片容器。每个 API 区域各自成卡片, 视觉上明确拆分,
 * 避免让用户误以为整页是一个提交表单。
 */
export const SettingsSection: React.FC<SettingsSectionProps> = ({
  title,
  description,
  actions,
  children
}) => (
  <section className="rounded-2xl border border-outline-variant/35 bg-surface-container-lowest p-4 shadow-subtle sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-headline-sm text-on-surface">{title}</h2>
        {description && (
          <p className="mt-1 max-w-3xl text-body-sm text-on-surface-variant">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
    <div className="mt-4">{children}</div>
  </section>
);
