import React from 'react';

type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-surface-container-high text-on-surface-variant',
  primary: 'bg-primary-fixed text-on-primary-fixed',
  success: 'bg-tertiary-fixed text-on-tertiary-fixed',
  warning: 'bg-fsrs-hard-bg text-fsrs-hard-text',
  danger: 'bg-error-container text-on-error-container'
};

export const Badge: React.FC<React.PropsWithChildren<{ tone?: BadgeTone }>> = ({ children, tone = 'neutral' }) => (
  <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-label-sm ${toneClasses[tone]}`}>
    {children}
  </span>
);
