import React from 'react';
import { Toast } from '../../components/ui/Toast';

interface SettingsFeedbackProps {
  validationError?: string;
  fieldError?: string;
  submitError?: string;
  successMessage?: string;
}

/** 设置页共享的反馈区: 前端校验错误、服务端字段错误、通用错误与成功提示。 */
export const SettingsFeedback: React.FC<SettingsFeedbackProps> = ({
  validationError,
  fieldError,
  submitError,
  successMessage
}) => (
  <>
    {validationError !== undefined && (
      <p role="alert" className="rounded-xl border border-error/25 bg-error-container px-3 py-2.5 text-body-sm text-on-error-container">
        {validationError}
      </p>
    )}
    {fieldError !== undefined && (
      <p role="alert" className="rounded-xl border border-error/25 bg-error-container px-3 py-2.5 text-body-sm text-on-error-container">
        {fieldError}
      </p>
    )}
    {submitError !== undefined && (
      <p role="alert" className="rounded-xl border border-error/25 bg-error-container px-3 py-2.5 text-body-sm text-on-error-container">
        {submitError}
      </p>
    )}
    {successMessage !== undefined && <Toast message={successMessage} tone="success" />}
  </>
);
