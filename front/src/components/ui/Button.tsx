import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  isLoading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-container border-transparent',
  secondary: 'bg-surface-container-lowest text-on-surface hover:bg-surface-container-high border-outline-variant/60',
  danger: 'bg-error text-on-error hover:bg-on-error-container border-transparent',
  ghost: 'bg-transparent text-on-surface-variant hover:bg-surface-container-high border-transparent'
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  isLoading = false,
  disabled,
  className = '',
  children,
  ...props
}) => (
  <button
    {...props}
    disabled={disabled || isLoading}
    className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-[14px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60 ${variantClasses[variant]} ${className}`}
  >
    {isLoading && <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>}
    {children}
  </button>
);
