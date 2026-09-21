import React, { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, onApiUnauthorized, setApiCSRFToken } from '../api/client';
import { SessionResponse } from '../api/types';

interface AuthContextValue {
  session: SessionResponse | null;
  isAuthenticated: boolean;
  isRestoring: boolean;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  /**
   * 仅清理本地认证状态, 不调用后端 logout. 用于后端已在服务端使会话失效的场景
   * (例如修改密码成功后会吊销全部 session), 避免再发一次必然返回 401 的 logout 请求.
   */
  invalidateSession: () => void;
  loginError: unknown;
  isLoggingIn: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const sessionQueryKey = ['auth', 'session'] as const;

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({
    queryKey: sessionQueryKey,
    queryFn: () =>
      apiRequest<SessionResponse>('/api/web/auth/session', { skipUnauthorizedEvent: true }),
    retry: false,
    staleTime: 60_000
  });

  const session = sessionQuery.data ?? null;

  useEffect(() => {
    setApiCSRFToken(session?.csrf_token ?? '');
  }, [session]);

  const clearSession = useCallback(() => {
    setApiCSRFToken('');
    queryClient.setQueryData(sessionQueryKey, null);
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
  }, [queryClient]);

  useEffect(() => onApiUnauthorized(clearSession), [clearSession]);

  const loginMutation = useMutation({
    mutationFn: (password: string) =>
      apiRequest<SessionResponse>('/api/web/auth/login', {
        method: 'POST',
        body: { password },
        skipUnauthorizedEvent: true
      }),
    onSuccess: (nextSession) => {
      setApiCSRFToken(nextSession.csrf_token);
      queryClient.setQueryData(sessionQueryKey, nextSession);
    }
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest<{ ok: boolean }>('/api/web/auth/logout', { method: 'POST' }),
    onSettled: clearSession
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isAuthenticated: session !== null,
      isRestoring: sessionQuery.isPending,
      login: async (password) => {
        await loginMutation.mutateAsync(password);
      },
      logout: async () => {
        await logoutMutation.mutateAsync();
      },
      invalidateSession: clearSession,
      loginError: loginMutation.error,
      isLoggingIn: loginMutation.isPending
    }),
    [clearSession, loginMutation, logoutMutation, session, sessionQuery.isPending]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const value = useContext(AuthContext);
  if (value === null) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return value;
};
