import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { AuthProvider } from './auth/AuthProvider';
import { todayInTimezone } from './utils/heatmap';

/**
 * 路由与默认首页集成测试。
 *
 * 覆盖: 根路由进入 /dashboard、登录成功进入 /dashboard、已有路由不受影响。
 */

const TODAY = todayInTimezone('UTC');

const sessionBody = { csrf_token: 'csrf-token', expires_at: '2030-01-01T00:00:00Z' };

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

const mockApi = (sessionAuthenticated: boolean) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith('/api/web/auth/session')) {
      return sessionAuthenticated
        ? jsonResponse(sessionBody)
        : jsonResponse({ error: { code: 'unauthorized', message: '未登录' } }, 401);
    }
    if (url.startsWith('/api/web/auth/login')) return jsonResponse(sessionBody);
    if (url.startsWith('/api/web/settings')) {
      return jsonResponse({ settings: { calendar_timezone: 'UTC' } });
    }
    if (url.startsWith('/api/web/review/due')) return jsonResponse({ items: [], total: 0 });
    if (url.startsWith('/api/web/calendar')) {
      return jsonResponse({ days: [{ date: TODAY, created_cards: 0, review_events: 0 }] });
    }
    if (url.startsWith('/api/web/cards')) {
      return jsonResponse({ items: [], total: 0, page: 1, page_size: 1 });
    }
    if (url.startsWith('/api/web/topics')) {
      // Cards/Review 页面按全量 Topic 拉取, Dashboard 只取 total; 统一返回空列表。
      return jsonResponse({ items: [], total: 0, page: 1, page_size: 100 });
    }
    throw new Error(`未处理的请求: ${url}`);
  });

const renderApp = (initialEntry: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('App 路由与默认首页', () => {
  afterEach(() => vi.restoreAllMocks());

  it('已登录访问根路由进入 Dashboard', async () => {
    mockApi(true);
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '学习热力图' })).toBeInTheDocument();
  });

  it('未登录访问根路由进入登录页, 登录成功后进入 Dashboard', async () => {
    // 首次 session 无效, 登录后恢复。
    let sessionCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/web/auth/session')) {
        sessionCalls += 1;
        return sessionCalls === 1
          ? jsonResponse({ error: { code: 'unauthorized', message: '未登录' } }, 401)
          : jsonResponse(sessionBody);
      }
      if (url.startsWith('/api/web/auth/login')) return jsonResponse(sessionBody);
      if (url.startsWith('/api/web/settings')) return jsonResponse({ settings: { calendar_timezone: 'UTC' } });
      if (url.startsWith('/api/web/review/due')) return jsonResponse({ items: [], total: 0 });
      if (url.startsWith('/api/web/calendar')) return jsonResponse({ days: [] });
      if (url.startsWith('/api/web/cards')) return jsonResponse({ items: [], total: 0, page: 1, page_size: 1 });
      if (url.startsWith('/api/web/topics')) return jsonResponse({ items: [], total: 0, page: 1, page_size: 100 });
      throw new Error(`未处理的请求: ${url}`);
    });

    renderApp('/');
    expect(await screen.findByRole('heading', { name: '登录到本地实例' })).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('登录密码'), 'local-password');
    await userEvent.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('已有 /cards 路由仍可访问, 不受默认首页变更影响', async () => {
    mockApi(true);
    renderApp('/cards');
    expect(await screen.findByRole('heading', { name: '卡片管理' })).toBeInTheDocument();
  });

  it('已有 /review 路由仍可访问', async () => {
    mockApi(true);
    renderApp('/review');
    expect(await screen.findByRole('heading', { name: '暂无到期复习卡片' })).toBeInTheDocument();
  });
});
