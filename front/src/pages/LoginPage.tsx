import React, { FormEvent, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { getApiErrorMessage } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/ui/Button';

interface LocationState {
  from?: string;
}

export const LoginPage: React.FC = () => {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const from = (location.state as LocationState | null)?.from ?? '/dashboard';

  useEffect(() => {
    setLocalError('');
  }, [password]);

  if (!auth.isRestoring && auth.isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password === '') {
      setLocalError('请输入服务端生成的登录密码');
      return;
    }
    try {
      await auth.login(password);
      navigate(from, { replace: true });
    } catch {
      // mutation 的错误由统一状态展示, 这里不清空密码便于用户检查输入.
    }
  };

  const errorMessage = localError || (auth.loginError ? getApiErrorMessage(auth.loginError) : '');

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-5 py-10">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface-container-lowest shadow-card lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden bg-primary p-12 text-on-primary lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15">
              <span className="material-symbols-outlined text-[28px]">psychology</span>
            </div>
            <p className="mt-10 font-mono text-label-md uppercase tracking-[0.18em] text-on-primary-container">Precision Cognition</p>
            <h1 className="mt-3 max-w-md text-[38px] font-semibold leading-tight">把知识整理、复习与 AI 提议放在一个可靠工作台中</h1>
          </div>
          <p className="max-w-md text-body-md text-on-primary-container">
            单用户本地实例. 登录后 Session 与 CSRF 由服务端管理, 前端不保存明文密码.
          </p>
        </section>

        <section className="p-7 sm:p-12">
          <div className="flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-on-primary">
              <span className="material-symbols-outlined">psychology</span>
            </div>
            <span className="text-headline-sm">Pi Teacher</span>
          </div>
          <p className="mt-10 font-mono text-label-sm uppercase tracking-widest text-primary lg:mt-0">Local Access</p>
          <h2 className="mt-2 text-headline-md text-on-surface">登录到本地实例</h2>
          <p className="mt-2 text-body-md text-on-surface-variant">
            首次启动后端时, 初始密码只会在服务端终端显示一次.
          </p>

          <form className="mt-8" onSubmit={handleSubmit}>
            <label htmlFor="password" className="text-label-md text-on-surface">登录密码</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={auth.isLoggingIn}
              className="mt-2 w-full rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3 text-body-md text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60"
              placeholder="请输入密码"
            />
            {errorMessage && (
              <p role="alert" className="mt-3 rounded-lg bg-error-container px-3 py-2 text-body-sm text-on-error-container">
                {errorMessage}
              </p>
            )}
            <Button type="submit" isLoading={auth.isLoggingIn} className="mt-6 w-full">
              登录
            </Button>
          </form>

          <p className="mt-6 text-body-sm text-on-surface-variant">
            忘记密码时, 请在服务端本机运行 <code className="font-mono text-primary">admin reset-password</code>.
          </p>
        </section>
      </div>
    </main>
  );
};
