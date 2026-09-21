import React from 'react';

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
}

export const Input: React.FC<FieldProps & React.InputHTMLAttributes<HTMLInputElement>> = ({
  label,
  hint,
  error,
  id,
  className = '',
  ...props
}) => {
  const inputID = id ?? props.name;
  return (
    <label htmlFor={inputID} className="block">
      <span className="text-label-md text-on-surface">{label}</span>
      <input
        {...props}
        id={inputID}
        className={`mt-2 w-full rounded-xl border bg-surface-container-lowest px-3.5 py-2.5 text-body-md text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 ${error ? 'border-error' : 'border-outline-variant'} ${className}`}
      />
      {error ? <span className="mt-1 block text-body-sm text-error">{error}</span> : hint ? <span className="mt-1 block text-body-sm text-on-surface-variant">{hint}</span> : null}
    </label>
  );
};

export const Select: React.FC<FieldProps & React.SelectHTMLAttributes<HTMLSelectElement>> = ({
  label,
  hint,
  error,
  id,
  className = '',
  children,
  ...props
}) => {
  const selectID = id ?? props.name;
  return (
    <label htmlFor={selectID} className="block">
      <span className="text-label-md text-on-surface">{label}</span>
      <select
        {...props}
        id={selectID}
        className={`mt-2 w-full rounded-xl border bg-surface-container-lowest px-3.5 py-2.5 text-body-md text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 ${error ? 'border-error' : 'border-outline-variant'} ${className}`}
      >
        {children}
      </select>
      {error ? <span className="mt-1 block text-body-sm text-error">{error}</span> : hint ? <span className="mt-1 block text-body-sm text-on-surface-variant">{hint}</span> : null}
    </label>
  );
};
