import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReviewPage } from './ReviewPage';

interface MockResponse {
  status?: number;
  body: unknown;
}

const topicsResponse = {
  items: [
    {
      id: 7,
      name: 'Go',
      description: '',
      card_count: 2,
      version: 1,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z'
    }
  ],
  total: 1,
  page: 1,
  page_size: 100
};

const dueItems = [
  {
    card_id: 101,
    front: '第一张问题',
    back: '第一张答案',
    topic_id: 7,
    card_version: 3,
    due: '2026-01-01T00:00:00Z',
    state: 'review',
    schedule_version: 5,
    reps: 2,
    lapses: 1
  },
  {
    card_id: 102,
    front: '第二张问题',
    back: '第二张答案',
    topic_id: null,
    card_version: 1,
    due: '2026-01-02T00:00:00Z',
    state: 'new',
    schedule_version: 1,
    reps: 0,
    lapses: 0
  }
];

const jsonResponse = ({ status = 200, body }: MockResponse): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

const renderReviewPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false }
    }
  });
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ReviewPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...rendered, queryClient };
};

const mockTopicsAndDue = (dueResponse: MockResponse) => {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith('/api/web/topics')) return jsonResponse({ body: topicsResponse });
    if (url.startsWith('/api/web/review/due')) return jsonResponse(dueResponse);
    throw new Error(`未处理的请求: ${url}`);
  });
};

const revealAnswer = async () => {
  await userEvent.click(await screen.findByRole('button', { name: /显示答案/ }));
};

describe('ReviewPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('显示 Topic 和 Review 队列 loading 状态', async () => {
    let resolveTopics: ((value: Response) => void) | undefined;
    let resolveDue: ((value: Response) => void) | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.startsWith('/api/web/topics')) {
        return new Promise<Response>((resolve) => {
          resolveTopics = resolve;
        });
      }
      if (url.startsWith('/api/web/review/due')) {
        return new Promise<Response>((resolve) => {
          resolveDue = resolve;
        });
      }
      throw new Error(`未处理的请求: ${url}`);
    });

    renderReviewPage();
    expect(screen.getByText('正在加载 Topic')).toBeInTheDocument();

    resolveTopics?.(jsonResponse({ body: topicsResponse }));
    expect(await screen.findByText('正在加载复习队列')).toBeInTheDocument();

    resolveDue?.(jsonResponse({ body: { items: [], total: 0 } }));
    expect(await screen.findByText('暂无到期复习卡片')).toBeInTheDocument();
  });

  it('显示空队列状态', async () => {
    mockTopicsAndDue({ body: { items: [], total: 0 } });
    renderReviewPage();
    expect(await screen.findByText('暂无到期复习卡片')).toBeInTheDocument();
  });

  it('成功加载真实队列并区分 total 与 items.length', async () => {
    mockTopicsAndDue({ body: { items: [dueItems[0]], total: 42 } });
    renderReviewPage();

    expect(await screen.findByText('第一张问题')).toBeInTheDocument();
    expect(screen.getByText('已加载 1 张 / 到期共 42 张')).toBeInTheDocument();
    expect(screen.getByText('Go')).toBeInTheDocument();
  });

  it('显示请求失败状态并支持重试', async () => {
    let dueCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/web/topics')) return jsonResponse({ body: topicsResponse });
      if (url.startsWith('/api/web/review/due')) {
        dueCalls += 1;
        if (dueCalls === 1) {
          return jsonResponse({
            status: 500,
            body: { error: { code: 'internal_error', message: '队列服务不可用' } }
          });
        }
        return jsonResponse({ body: { items: [dueItems[0]], total: 1 } });
      }
      throw new Error(`未处理的请求: ${url}`);
    });

    renderReviewPage();
    expect(await screen.findByText('复习队列加载失败')).toBeInTheDocument();
    expect(screen.getByText('队列服务不可用')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '重新尝试' }));
    expect(await screen.findByText('第一张问题')).toBeInTheDocument();
  });

  it('提交期间禁用评分并防止重复提交，成功后进入下一张', async () => {
    let resolveSubmit: ((value: Response) => void) | undefined;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);
      if (url.startsWith('/api/web/topics')) return Promise.resolve(jsonResponse({ body: topicsResponse }));
      if (url.startsWith('/api/web/review/due')) {
        return Promise.resolve(jsonResponse({ body: { items: dueItems, total: 2 } }));
      }
      if (url === '/api/web/review/101/submit' && init?.method === 'POST') {
        return new Promise<Response>((resolve) => {
          resolveSubmit = resolve;
        });
      }
      throw new Error(`未处理的请求: ${url}`);
    });

    renderReviewPage();
    await revealAnswer();
    const againButton = screen.getByRole('button', { name: /忘记 Again/ });
    await userEvent.dblClick(againButton);

    expect(againButton).toBeDisabled();
    expect(screen.getByRole('button', { name: /困难 Hard/ })).toBeDisabled();
    fireEvent.keyDown(window, { key: '2' });
    const submitCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes('/review/101/submit')
    );
    expect(submitCalls).toHaveLength(1);
    expect(JSON.parse(String(submitCalls[0]?.[1]?.body))).toEqual({
      rating: 'again',
      expected_card_version: 3,
      expected_schedule_version: 5
    });

    resolveSubmit?.(
      jsonResponse({
        body: {
          card_id: 101,
          rating: 'again',
          schedule: {
            due: '2026-01-03T00:00:00Z',
            state: 'review',
            stability: 1,
            difficulty: 5,
            scheduled_days: 1,
            reps: 3,
            lapses: 2,
            last_review_at: '2026-01-02T00:00:00Z',
            version: 6
          },
          review_log_id: 9
        }
      })
    );

    expect(await screen.findByText('第二张问题')).toBeInTheDocument();
  });

  it('提交失败时不推进并保留已揭示答案', async () => {
    const fetchMock = mockTopicsAndDue({ body: { items: dueItems, total: 2 } });
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith('/api/web/topics')) return jsonResponse({ body: topicsResponse });
      if (url.startsWith('/api/web/review/due')) {
        return jsonResponse({ body: { items: dueItems, total: 2 } });
      }
      if (url === '/api/web/review/101/submit' && init?.method === 'POST') {
        return jsonResponse({
          status: 500,
          body: { error: { code: 'internal_error', message: '提交失败，请重试' } }
        });
      }
      throw new Error(`未处理的请求: ${url}`);
    });

    renderReviewPage();
    await revealAnswer();
    await userEvent.click(screen.getByRole('button', { name: /良好 Good/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('提交失败，请重试');
    expect(screen.getByText('第一张问题')).toBeInTheDocument();
    expect(screen.getByText('第一张答案')).toBeInTheDocument();
    expect(screen.queryByText('第二张问题')).not.toBeInTheDocument();
  });

  it('version_conflict 提示重新加载且不自动重试', async () => {
    let dueCalls = 0;
    let submitCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith('/api/web/topics')) return jsonResponse({ body: topicsResponse });
      if (url.startsWith('/api/web/review/due')) {
        dueCalls += 1;
        return jsonResponse({ body: { items: [dueItems[0]], total: 1 } });
      }
      if (url === '/api/web/review/101/submit' && init?.method === 'POST') {
        submitCalls += 1;
        return jsonResponse({
          status: 409,
          body: {
            error: {
              code: 'version_conflict',
              message: 'Card 或调度已被并发修改',
              details: { current_card_version: 4, current_schedule_version: 6 }
            }
          }
        });
      }
      throw new Error(`未处理的请求: ${url}`);
    });

    renderReviewPage();
    await revealAnswer();
    await userEvent.click(screen.getByRole('button', { name: /良好 Good/ }));

    expect(await screen.findByRole('dialog', { name: '复习版本冲突' })).toBeInTheDocument();
    expect(submitCalls).toBe(1);
    const conflictDialog = screen.getByRole('dialog', { name: '复习版本冲突' });
    await userEvent.click(
      conflictDialog.querySelector<HTMLButtonElement>('button:last-child') as HTMLButtonElement
    );
    await waitFor(() => expect(dueCalls).toBe(2));
    expect(submitCalls).toBe(1);
  });

  it('再来一轮重新请求服务端，不复用旧队列', async () => {
    let dueCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith('/api/web/topics')) return jsonResponse({ body: topicsResponse });
      if (url.startsWith('/api/web/review/due')) {
        dueCalls += 1;
        return jsonResponse({ body: { items: [dueItems[0]], total: 1 } });
      }
      if (url === '/api/web/review/101/submit' && init?.method === 'POST') {
        return jsonResponse({
          body: {
            card_id: 101,
            rating: 'easy',
            schedule: {
              due: '2026-02-01T00:00:00Z',
              state: 'review',
              stability: 10,
              difficulty: 3,
              scheduled_days: 30,
              reps: 3,
              lapses: 1,
              last_review_at: '2026-01-02T00:00:00Z',
              version: 6
            },
            review_log_id: 10
          }
        });
      }
      throw new Error(`未处理的请求: ${url}`);
    });

    renderReviewPage();
    await revealAnswer();
    await userEvent.click(screen.getByRole('button', { name: /简单 Easy/ }));
    expect(await screen.findByText('本轮复习已完成')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '再来一轮' }));
    await waitFor(() => expect(dueCalls).toBe(2));
  });

  it('输入区域和 contenteditable 中不会误触评分快捷键', async () => {
    let submitCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith('/api/web/topics')) return jsonResponse({ body: topicsResponse });
      if (url.startsWith('/api/web/review/due')) {
        return jsonResponse({ body: { items: [dueItems[0]], total: 1 } });
      }
      if (url.includes('/submit') && init?.method === 'POST') submitCalls += 1;
      throw new Error(`未处理的请求: ${url}`);
    });

    renderReviewPage();
    await revealAnswer();
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    document.body.appendChild(editable);
    fireEvent.keyDown(editable, { key: '1' });
    expect(submitCalls).toBe(0);
    editable.remove();
  });
});
