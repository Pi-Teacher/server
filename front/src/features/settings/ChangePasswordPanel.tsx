import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ApiError, getApiErrorMessage } from '../../api/client';
import { changePasswordMutationOptions } from '../../api/password';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Input } from '../../components/ui/FormControls';
import { Toast } from '../../components/ui/Toast';
import { SettingsSection } from './SettingsSection';

/**
 * 修改密码。成功后后端会吊销全部 session (含当前), 因此这里调用
 * AuthProvider 的统一作废方法清理本地认证状态, 再返回登录页。
 */
export const ChangePasswordPanel: React.FC = () => {
  const navigate = useNavigate();
  const { invalidateSession } = useAuth();
  const changeMutation = useMutation(changePasswordMutationOptions());

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [submitError, setSubmitError] = useState<string>();
  const [successMessage, setSuccessMessage] = useState<string>();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const isSubmitting = changeMutation.isPending;

  const validate = (): boolean => {
    const errors: typeof fieldErrors = {};
    if (currentPassword.trim() === '') errors.current = '请输入当前密码';
    if (newPassword.trim() === '') errors.next = '新密码不能为空';
    if (newPassword !== confirmPassword) errors.confirm = '两次输入的新密码不一致';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    setSubmitError(undefined);
    setSuccessMessage(undefined);
    setIsConfirmOpen(true);
  };

  const handleConfirm = () => {
    setSubmitError(undefined);
    changeMutation.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          setIsConfirmOpen(false);
          setSuccessMessage('密码已修改，请使用新密码重新登录。');
          // 后端已吊销全部 session, 这里只清理本地状态并回登录页。
          invalidateSession();
          navigate('/login', { replace: true });
        },
        onError: (error: unknown) => {
          setIsConfirmOpen(false);
          if (error instanceof ApiError && error.code === 'validation_error') {
            const field = error.details?.field;
            if (field === 'current_password') {
              setFieldErrors({ current: '当前密码不正确' });
              return;
            }
            if (field === 'new_password') {
              setFieldErrors({ next: error.message });
              return;
            }
            setSubmitError(error.message);
            return;
          }
          setSubmitError(getApiErrorMessage(error));
        }
      }
    );
  };

  return (
    <SettingsSection
      title="修改密码"
      description="修改成功后会注销全部已登录会话（包括当前浏览器），需要重新登录。"
      actions={
        <Button type="button" isLoading={isSubmitting} disabled={isSubmitting} onClick={handleSubmit}>
          修改密码
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <Input
          label="当前密码"
          name="current_password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          disabled={isSubmitting}
          error={fieldErrors.current}
          onChange={(event) => {
            setCurrentPassword(event.target.value);
            setFieldErrors((previous) => ({ ...previous, current: undefined }));
            setSuccessMessage(undefined);
          }}
        />
        <Input
          label="新密码"
          name="new_password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          disabled={isSubmitting}
          error={fieldErrors.next}
          onChange={(event) => {
            setNewPassword(event.target.value);
            setFieldErrors((previous) => ({ ...previous, next: undefined }));
            setSuccessMessage(undefined);
          }}
        />
        <Input
          label="确认新密码"
          name="confirm_password"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          disabled={isSubmitting}
          error={fieldErrors.confirm}
          onChange={(event) => {
            setConfirmPassword(event.target.value);
            setFieldErrors((previous) => ({ ...previous, confirm: undefined }));
          }}
        />
      </div>

      {submitError !== undefined && (
        <p role="alert" className="mt-4 rounded-xl border border-error/25 bg-error-container px-3 py-2.5 text-body-sm text-on-error-container">
          {submitError}
        </p>
      )}
      {successMessage !== undefined && <div className="mt-4"><Toast message={successMessage} tone="success" /></div>}

      <ConfirmDialog
        open={isConfirmOpen}
        title="确认修改密码"
        description="修改后所有已登录会话都会失效，包括当前浏览器，需要重新登录。确定继续吗？"
        confirmLabel="确认修改"
        isSubmitting={isSubmitting}
        onConfirm={handleConfirm}
        onClose={() => {
          if (isSubmitting) return;
          setIsConfirmOpen(false);
        }}
      />
    </SettingsSection>
  );
};
