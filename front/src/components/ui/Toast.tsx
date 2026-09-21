import React from 'react';

export type ToastTone = 'success' | 'error' | 'info';

interface ToastProps {
  message: string;
  tone?: ToastTone;
}

const toneClasses: Record<ToastTone, string> = {
  success: 'border-tertiary/30 bg-tertiary-fixed text-on-tertiary-fixed',
  error: 'border-error/30 bg-error-container text-on-error-container',
  info: 'border-primary/30 bg-primary-fixed text-on-primary-fixed'
};

export const Toast: React.FC<ToastProps> = ({ message, tone = 'info' }) => (
  <div role="status" className={`rounded-xl border px-4 py-3 text-body-md shadow-card ${toneClasses[tone]}`}>
    {message}
  </div>
);
