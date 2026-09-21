import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, onApiUnauthorized, setApiCSRFToken } from './client';

describe('apiRequest', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setApiCSRFToken('');
  });

  it('为写请求附加 CSRF token 并解析 JSON', async () => {
    setApiCSRFToken('csrf-test');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    await expect(apiRequest<{ ok: boolean }>('/api/web/test', { method: 'POST', body: { value: 1 } })).resolves.toEqual({ ok: true });
    const request = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(request?.headers).get('X-CSRF-Token')).toBe('csrf-test');
    expect(request?.credentials).toBe('same-origin');
  });

  it('保留 AbortError 供 React Query 识别请求取消', async () => {
    const abortError = new DOMException('请求已取消', 'AbortError');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortError);

    await expect(apiRequest('/api/web/review/due')).rejects.toBe(abortError);
  });

  it('解析错误信封并通知未认证监听器', async () => {
    const listener = vi.fn();
    const unsubscribe = onApiUnauthorized(listener);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'unauthorized', message: '未登录' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    await expect(apiRequest('/api/web/cards')).rejects.toEqual(
      expect.objectContaining({ status: 401, code: 'unauthorized', message: '未登录' })
    );
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });
});
