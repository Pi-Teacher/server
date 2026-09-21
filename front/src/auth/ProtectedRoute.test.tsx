import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './AuthProvider';
import { ProtectedRoute } from './ProtectedRoute';

const renderProtected = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/cards']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<div>登录页面</div>} />
            <Route element={<ProtectedRoute />}>
              <Route path="/cards" element={<div>受保护页面</div>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('ProtectedRoute', () => {
  afterEach(() => vi.restoreAllMocks());

  it('Session 有效时显示受保护页面', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ csrf_token: 'csrf', expires_at: '2030-01-01T00:00:00Z' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );
    renderProtected();
    expect(await screen.findByText('受保护页面')).toBeInTheDocument();
  });

  it('Session 无效时跳转登录页面', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'unauthorized', message: '未登录' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    );
    renderProtected();
    expect(await screen.findByText('登录页面')).toBeInTheDocument();
  });
});
