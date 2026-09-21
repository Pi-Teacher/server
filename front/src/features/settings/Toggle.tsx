import React from 'react';

interface ToggleProps {
  /** 可见标签; 传入时用于 a11y, 不传则由外层容器提供文字。 */
  label?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

/**
 * 设置页专用开关。使用 role="switch" 表达开/关语义, 键盘可用,
 * 且不使用公共 ui 组件, 避免与并行阶段共享文件产生冲突。
 */
export const Toggle: React.FC<ToggleProps> = ({ label, checked, disabled = false, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60 ${
      checked ? 'border-transparent bg-primary' : 'border-outline-variant bg-surface-container-high'
    }`}
  >
    <span
      aria-hidden="true"
      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-subtle transition-transform ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
);
