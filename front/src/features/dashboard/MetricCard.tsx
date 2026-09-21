import React from 'react';

interface MetricCardProps {
  eyebrow: string;
  english: string;
  icon: string;
  children: React.ReactNode;
}

/**
 * Dashboard 统计卡外壳: 统一的 eyebrow / 英文标签 / 图标 / 内容结构。
 * 只负责视觉呈现, 不感知任何业务 API, 便于各统计项复用。
 */
export const MetricCard: React.FC<MetricCardProps> = ({ eyebrow, english, icon, children }) => (
  <article className="flex flex-col gap-4 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card">
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-headline-sm text-on-surface">{eyebrow}</h3>
        <p className="mt-0.5 font-mono text-label-sm uppercase tracking-widest text-on-surface-variant">
          {english}
        </p>
      </div>
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-fixed text-on-primary-fixed"
        aria-hidden="true"
      >
        <span className="material-symbols-outlined text-[22px]">{icon}</span>
      </span>
    </header>
    {children}
  </article>
);

export const MetricValue: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[40px] font-semibold leading-none text-on-surface">{children}</p>
);

export const MetricCaption: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-body-sm text-on-surface-variant">{children}</p>
);
