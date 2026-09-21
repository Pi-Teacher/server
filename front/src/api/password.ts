import { mutationOptions } from '@tanstack/react-query';
import { apiRequest } from './client';

/**
 * 修改密码 (/api/web/auth/password)。
 * 成功后后端吊销全部 session (含当前), 因此调用方必须清理本地认证状态并返回登录页。
 * 确认新密码由前端校验, 不发送给后端。
 */
export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export const changePassword = (
  input: ChangePasswordInput
): Promise<{ ok: boolean }> =>
  apiRequest<{ ok: boolean }>('/api/web/auth/password', {
    method: 'PATCH',
    body: {
      current_password: input.currentPassword,
      new_password: input.newPassword
    }
  });

export const changePasswordMutationOptions = () =>
  mutationOptions({
    mutationFn: changePassword
  });
