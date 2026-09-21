import React from 'react';
import { Button } from './Button';

interface StateProps {
  title: string;
  description?: string;
  fullScreen?: boolean;
}

const StateFrame: React.FC<React.PropsWithChildren<{ fullScreen?: boolean }>> = ({
  fullScreen,
  children
}) => (
  <div className={fullScreen ? 'flex min-h-screen items-center justify-center bg-surface p-6' : 'flex min-h-64 items-center justify-center p-6'}>
    <div className="w-full max-w-md rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-8 text-center shadow-card">
      {children}
    </div>
  </div>
);

export const LoadingState: React.FC<StateProps> = ({ title, description, fullScreen }) => (
  <StateFrame fullScreen={fullScreen}>
    <span className="material-symbols-outlined animate-spin text-[32px] text-primary">progress_activity</span>
    <h2 className="mt-4 text-headline-sm text-on-surface">{title}</h2>
    {description && <p className="mt-2 text-body-md text-on-surface-variant">{description}</p>}
  </StateFrame>
);

interface ErrorStateProps extends StateProps {
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({ title, description, fullScreen, onRetry }) => (
  <StateFrame fullScreen={fullScreen}>
    <span className="material-symbols-outlined text-[32px] text-error">error</span>
    <h2 className="mt-4 text-headline-sm text-on-surface">{title}</h2>
    {description && <p className="mt-2 text-body-md text-on-surface-variant">{description}</p>}
    {onRetry && (
      <Button className="mt-5" onClick={onRetry}>
        重新尝试
      </Button>
    )}
  </StateFrame>
);

export const EmptyState: React.FC<StateProps> = ({ title, description }) => (
  <StateFrame>
    <span className="material-symbols-outlined text-[32px] text-primary">inbox</span>
    <h2 className="mt-4 text-headline-sm text-on-surface">{title}</h2>
    {description && <p className="mt-2 text-body-md text-on-surface-variant">{description}</p>}
  </StateFrame>
);
