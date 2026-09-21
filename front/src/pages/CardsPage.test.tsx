import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CardsPage } from './CardsPage';

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

const cardItems = [
  {
    id: 101,
    topic_id: 7,
    front: 'Go slice 的底层结构是什么?',
    back: 'slice header 包含指针、长度和容量。',
    enable_embedding: true,
    embedding_status: 'ready',
    version: 3,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-03T08:30:00Z'
  },
  {
    id: 102,
    topic_id: null,
    front: '没有 Topic 的卡片如何筛选?',
    back: '使用 topic_id=0。',
    enable_embedding: false,
    embedding_status: 'disabled',
    version: 1,
    created_at: '2026-01-02T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z'
  }
];

const cardsResponse = {
  items: cardItems,
  total: 42,
  page: 1,
  page_size: 20
};

const cardDetail = {
  ...cardItems[0],
  embedding_error: null,
  schedule: {
    due: '2026-01-04T00:00:00Z',
    state: 'review',
    stability: 4.2,
    difficulty: 5.1,
    scheduled_days: 3,
    reps: 2,
    lapses: 0,
    last_review_at: '2026-01-01T00:00:00Z',
    version: 2
  }
};

const jsonResponse = ({ status = 200, body }: MockResponse): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

const renderCardsPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false }
    }
  });
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CardsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...rendered, queryClient };
};

const mockTopicsAndCards = (response: MockResponse = { body: cardsResponse }) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith('/api/web/topics')) return jsonResponse({ body: topicsResponse });
    if (url.startsWith('/api/web/cards')) return jsonResponse(response);
    throw new Error(`未处理的请求: ${url}`);
  });

const cardRequestURLs = () =>
  vi.mocked(globalThis.fetch).mock.calls
    .map(([input]) => String(input))
    .filter((url: string) => url.startsWith('/api/web/cards'));

const lastCardRequest = () => {
  const urls = cardRequestURLs();
  return new URL(urls[urls.length - 1] ?? '', 'http://localhost');
};

describe('CardsPage', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('显示 Topic 和 Card loading 状态', async () => {
    let resolveTopics: ((value: Response) => void) | undefined;
    let resolveCards: ((value: Response) => void) | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.startsWith('/api/web/topics')) {
        return new Promise<Response>((resolve) => {
          resolveTopics = resolve;
        });
      }
      if (url.startsWith('/api/web/cards')) {
        return new Promise<Response>((resolve) => {
          resolveCards = resolve;
        });
      }
      throw new Error(`未处理的请求: ${url}`);
    });

    renderCardsPage();
    expect(screen.getByText('正在加载 Topic')).toBeInTheDocument();

    resolveTopics?.(jsonResponse({ body: topicsResponse }));
    expect(await screen.findByText('正在加载卡片')).toBeInTheDocument();

    resolveCards?.(jsonResponse({ body: { items: [], total: 0, page: 1, page_size: 20 } }));
    expect(await screen.findByText('没有符合条件的卡片')).toBeInTheDocument();
  });

  it('显示列表并区分当前页数量、total 和 page_size', async () => {
    mockTopicsAndCards();
    renderCardsPage();

    expect(await screen.findByText('Go slice 的底层结构是什么?')).toBeInTheDocument();
    expect(screen.getByText('当前页 2 张，筛选结果共 42 张')).toBeInTheDocument();
    expect(screen.getByText('第 1 / 3 页, 共 42 项')).toBeInTheDocument();
    expect(screen.getAllByText('Go')).toHaveLength(2);
    expect(screen.getAllByText('无 Topic')).toHaveLength(2);
    expect(screen.getAllByText('已就绪')).toHaveLength(2);
    expect(screen.getAllByText('未启用')).toHaveLength(2);
    expect(screen.getByText('v3')).toBeInTheDocument();
    expect(screen.queryByText(/scheduled_days/i)).not.toBeInTheDocument();
  });

  it('显示空状态', async () => {
    mockTopicsAndCards({ body: { items: [], total: 0, page: 1, page_size: 20 } });
    renderCardsPage();
    expect(await screen.findByText('没有符合条件的卡片')).toBeInTheDocument();
  });

  it('表头列数与数据行单元格数一致, 且不使用会被移出 grid 的 sr-only 占位', async () => {
    mockTopicsAndCards();
    renderCardsPage();
    await screen.findByText('Go slice 的底层结构是什么?');

    const list = screen.getByRole('region', { name: 'Card 列表' });
    const header = list.querySelector('.lg\\:grid');
    const row = list.querySelector('article');
    expect(header).not.toBeNull();
    expect(row).not.toBeNull();
    const headerCells = Array.from(header?.children ?? []) as HTMLElement[];
    // sr-only 是 position:absolute, 会把表头标签移出自动排布, 导致整体错列。
    expect(headerCells.some((cell) => cell.className.includes('sr-only'))).toBe(false);
    expect(row?.childElementCount).toBe(header?.childElementCount);
    // 最宽断点的网格轨道数必须等于单元格数。
    const templates = (header?.className ?? '').match(/grid-cols-\[([^\]]+)\]/g) ?? [];
    const trackCounts = templates.map((t) => /\[([^\]]+)\]/.exec(t)?.[1].split('_').length ?? 0);
    expect(Math.max(...trackCounts)).toBe(row?.childElementCount);
  });

  it('显示错误并支持重新加载', async () => {
    let cardsCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/web/topics')) return jsonResponse({ body: topicsResponse });
      if (url.startsWith('/api/web/cards')) {
        cardsCalls += 1;
        if (cardsCalls === 1) {
          return jsonResponse({
            status: 500,
            body: { error: { code: 'internal_error', message: '卡片服务不可用' } }
          });
        }
        return jsonResponse({ body: cardsResponse });
      }
      throw new Error(`未处理的请求: ${url}`);
    });

    renderCardsPage();
    expect(await screen.findByText('卡片加载失败')).toBeInTheDocument();
    expect(screen.getByText('卡片服务不可用')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '重新尝试' }));
    expect(await screen.findByText('Go slice 的底层结构是什么?')).toBeInTheDocument();
  });

  it('映射全部、具体和无 Topic 查询参数', async () => {
    mockTopicsAndCards();
    renderCardsPage();
    await screen.findByText('Go slice 的底层结构是什么?');

    expect(lastCardRequest().searchParams.has('topic_id')).toBe(false);

    await userEvent.selectOptions(screen.getByLabelText('Topic 筛选'), '7');
    await waitFor(() => expect(lastCardRequest().searchParams.get('topic_id')).toBe('7'));

    await userEvent.selectOptions(screen.getByLabelText('Topic 筛选'), '0');
    await waitFor(() => expect(lastCardRequest().searchParams.get('topic_id')).toBe('0'));

    await userEvent.selectOptions(screen.getByLabelText('Topic 筛选'), '');
    await waitFor(() => expect(lastCardRequest().searchParams.has('topic_id')).toBe(false));
  });

  it('提交搜索、Embedding 状态、排序、方向和每页数量参数', async () => {
    mockTopicsAndCards();
    renderCardsPage();
    await screen.findByText('Go slice 的底层结构是什么?');

    await userEvent.selectOptions(screen.getByLabelText('Embedding 状态'), 'failed');
    await userEvent.selectOptions(screen.getByLabelText('排序字段'), 'updated_at');
    await userEvent.selectOptions(screen.getByLabelText('排序方向'), 'asc');
    await userEvent.selectOptions(screen.getByLabelText('每页数量'), '50');
    await userEvent.type(screen.getByRole('searchbox', { name: '搜索 Front 或 Back' }), 'slice');

    await waitFor(() => {
      const request = lastCardRequest();
      expect(request.searchParams.get('q')).toBe('slice');
      expect(request.searchParams.get('embedding_status')).toBe('failed');
      expect(request.searchParams.get('sort')).toBe('updated_at');
      expect(request.searchParams.get('order')).toBe('asc');
      expect(request.searchParams.get('page_size')).toBe('50');
      expect(request.searchParams.get('page')).toBe('1');
    });
  });

  it('翻页后任一筛选变化都会回到第一页', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/web/topics')) return jsonResponse({ body: topicsResponse });
      if (url.startsWith('/api/web/cards')) {
        const requestPage = Number(new URL(url, 'http://localhost').searchParams.get('page'));
        return jsonResponse({ body: { ...cardsResponse, page: requestPage } });
      }
      throw new Error(`未处理的请求: ${url}`);
    });
    renderCardsPage();
    await screen.findByText('Go slice 的底层结构是什么?');

    await userEvent.click(screen.getByRole('button', { name: '下一页' }));
    await waitFor(() => expect(lastCardRequest().searchParams.get('page')).toBe('2'));

    await userEvent.selectOptions(screen.getByLabelText('Embedding 状态'), 'ready');
    await waitFor(() => expect(lastCardRequest().searchParams.get('page')).toBe('1'));
  });

  it('创建 Card 显式发送无 Topic 和关闭 Embedding，并防止重复提交', async () => {
    let resolveCreate: ((value: Response) => void) | undefined;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);
      if (url.startsWith('/api/web/topics')) {
        return Promise.resolve(jsonResponse({ body: topicsResponse }));
      }
      if (url.startsWith('/api/web/cards?')) {
        return Promise.resolve(jsonResponse({ body: cardsResponse }));
      }
      if (url === '/api/web/cards' && init?.method === 'POST') {
        return new Promise<Response>((resolve) => {
          resolveCreate = resolve;
        });
      }
      throw new Error(`未处理的请求: ${url}`);
    });

    renderCardsPage();
    await screen.findByText('Go slice 的底层结构是什么?');
    await userEvent.click(screen.getByRole('button', { name: /新建 Card/ }));
    const drawer = screen.getByRole('dialog', { name: '新建 Card' });
    fireEvent.change(screen.getByLabelText('Front'), { target: { value: '**新卡问题**' } });
    fireEvent.change(screen.getByLabelText('Back'), { target: { value: '新卡答案' } });
    expect(await screen.findByText('新卡问题')).toBeInTheDocument();

    const submitButton = screen.getByRole('button', { name: '创建 Card' });
    await userEvent.dblClick(submitButton);
    expect(submitButton).toBeDisabled();

    const createCalls = fetchMock.mock.calls.filter(
      ([input, init]) => String(input) === '/api/web/cards' && init?.method === 'POST'
    );
    expect(createCalls).toHaveLength(1);
    expect(JSON.parse(String(createCalls[0]?.[1]?.body))).toEqual({
      topic_id: null,
      front: '**新卡问题**',
      back: '新卡答案',
      enable_embedding: false
    });

    resolveCreate?.(
      jsonResponse({
        status: 201,
        body: {
          ...cardDetail,
          id: 103,
          topic_id: null,
          front: '**新卡问题**',
          back: '新卡答案',
          enable_embedding: false,
          embedding_status: 'disabled',
          version: 1
        }
      })
    );

    expect(await screen.findByText('Card #103 已创建')).toBeInTheDocument();
    expect(drawer).not.toBeInTheDocument();
  });

  it('编辑先读取详情，并只提交实际修改字段和服务端 version', async () => {
    let patchBody: unknown;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith('/api/web/topics')) return jsonResponse({ body: topicsResponse });
      if (url.startsWith('/api/web/cards?')) return jsonResponse({ body: cardsResponse });
      if (url === '/api/web/cards/101' && init?.method === 'GET') {
        return jsonResponse({ body: cardDetail });
      }
      if (url === '/api/web/cards/101' && init?.method === 'PATCH') {
        patchBody = JSON.parse(String(init.body));
        return jsonResponse({
          body: { ...cardDetail, back: '更新后的答案', version: 4 }
        });
      }
      throw new Error(`未处理的请求: ${url}`);
    });

    renderCardsPage();
    await screen.findByText('Go slice 的底层结构是什么?');
    await userEvent.click(screen.getByRole('button', { name: '编辑 Card 101' }));
    expect(await screen.findByDisplayValue('slice header 包含指针、长度和容量。')).toBeInTheDocument();

    const back = screen.getByLabelText('Back');
    fireEvent.change(back, { target: { value: '更新后的答案' } });
    await userEvent.click(screen.getByRole('button', { name: '保存修改' }));

    await waitFor(() =>
      expect(patchBody).toEqual({
        expected_version: 3,
        back: '更新后的答案'
      })
    );
    expect(await screen.findByText('Card #101 已保存，当前 version 为 4')).toBeInTheDocument();
  });

  it('编辑可以显式发送 topic_id null', async () => {
    let patchBody: unknown;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith('/api/web/topics')) return jsonResponse({ body: topicsResponse });
      if (url.startsWith('/api/web/cards?')) return jsonResponse({ body: cardsResponse });
      if (url === '/api/web/cards/101' && init?.method === 'GET') {
        return jsonResponse({ body: cardDetail });
      }
      if (url === '/api/web/cards/101' && init?.method === 'PATCH') {
        patchBody = JSON.parse(String(init.body));
        return jsonResponse({ body: { ...cardDetail, topic_id: null, version: 4 } });
      }
      throw new Error(`未处理的请求: ${url}`);
    });

    renderCardsPage();
    await screen.findByText('Go slice 的底层结构是什么?');
    await userEvent.click(screen.getByRole('button', { name: '编辑 Card 101' }));
    await screen.findByDisplayValue('Go slice 的底层结构是什么?');
    await userEvent.selectOptions(screen.getByLabelText('Topic'), '');
    await userEvent.click(screen.getByRole('button', { name: '保存修改' }));

    await waitFor(() =>
      expect(patchBody).toEqual({
        expected_version: 3,
        topic_id: null
      })
    );
  });

  it('保存失败保留输入，version_conflict 提供复制与重新加载且不自动重试', async () => {
    let detailCalls = 0;
    let patchCalls = 0;
    const clipboardWrite = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWrite }
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith('/api/web/topics')) return jsonResponse({ body: topicsResponse });
      if (url.startsWith('/api/web/cards?')) return jsonResponse({ body: cardsResponse });
      if (url === '/api/web/cards/101' && init?.method === 'GET') {
        detailCalls += 1;
        return jsonResponse({
          body: detailCalls === 1 ? cardDetail : { ...cardDetail, back: '服务端新答案', version: 4 }
        });
      }
      if (url === '/api/web/cards/101' && init?.method === 'PATCH') {
        patchCalls += 1;
        return jsonResponse({
          status: 409,
          body: {
            error: {
              code: 'version_conflict',
              message: 'Card 已被修改',
              details: { current_version: 4 }
            }
          }
        });
      }
      throw new Error(`未处理的请求: ${url}`);
    });

    renderCardsPage();
    await screen.findByText('Go slice 的底层结构是什么?');
    await userEvent.click(screen.getByRole('button', { name: '编辑 Card 101' }));
    const back = await screen.findByDisplayValue('slice header 包含指针、长度和容量。');
    fireEvent.change(back, { target: { value: '我的未保存答案' } });
    await userEvent.click(screen.getByRole('button', { name: '保存修改' }));

    const conflict = await screen.findByRole('dialog', { name: 'Card 版本冲突' });
    expect(screen.getByDisplayValue('我的未保存答案')).toBeInTheDocument();
    expect(patchCalls).toBe(1);
    await userEvent.click(screen.getByRole('button', { name: '复制当前内容' }));
    expect(clipboardWrite).toHaveBeenCalledWith(expect.stringContaining('我的未保存答案'));

    const reloadButton = conflict.querySelector<HTMLButtonElement>('button:last-child');
    expect(reloadButton).not.toBeNull();
    await userEvent.click(reloadButton as HTMLButtonElement);
    expect(await screen.findByDisplayValue('服务端新答案')).toBeInTheDocument();
    expect(detailCalls).toBe(2);
    expect(patchCalls).toBe(1);
  });

  it('exact 命中不显示 similarity，且查重不修改 Card', async () => {
    let checkBody: unknown;
    let checkCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith('/api/web/topics')) return jsonResponse({ body: topicsResponse });
      if (url.startsWith('/api/web/cards?')) return jsonResponse({ body: cardsResponse });
      if (url === '/api/web/cards/101' && init?.method === 'GET') return jsonResponse({ body: cardDetail });
      if (url === '/api/web/cards/check' && init?.method === 'POST') {
        checkCalls += 1;
        checkBody = JSON.parse(String(init.body));
        return jsonResponse({
          body: {
            match_type: 'exact',
            matches: [
              {
                id: 55,
                front: '相同问题',
                back: '相同答案',
                topic_id: null
              }
            ]
          }
        });
      }
      throw new Error(`未处理的请求: ${url}`);
    });

    renderCardsPage();
    await screen.findByText('Go slice 的底层结构是什么?');
    await userEvent.click(screen.getByRole('button', { name: '编辑 Card 101' }));
    await screen.findByDisplayValue('Go slice 的底层结构是什么?');
    await userEvent.click(screen.getByRole('button', { name: '开始查重' }));

    expect(await screen.findByText('完全重复，已停止继续查重')).toBeInTheDocument();
    expect(screen.getByText('相同问题')).toBeInTheDocument();
    expect(screen.queryByText(/相似度/)).not.toBeInTheDocument();
    expect(screen.queryByText(/95\.0%/)).not.toBeInTheDocument();
    expect(checkCalls).toBe(1);
    expect(checkBody).toEqual({
      front: 'Go slice 的底层结构是什么?',
      enable_embedding: true,
      top_k: 5
    });
    expect(screen.getByDisplayValue('Go slice 的底层结构是什么?')).toBeInTheDocument();
  });

  it('semantic 查重显示 similarity 和 coverage', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith('/api/web/topics')) return jsonResponse({ body: topicsResponse });
      if (url.startsWith('/api/web/cards?')) return jsonResponse({ body: cardsResponse });
      if (url === '/api/web/cards/101' && init?.method === 'GET') return jsonResponse({ body: cardDetail });
      if (url === '/api/web/cards/check' && init?.method === 'POST') {
        return jsonResponse({
          body: {
            match_type: 'semantic',
            coverage: {
              total_enabled: 10,
              ready: 8,
              pending: 1,
              processing: 0,
              failed: 1,
              ready_percent: 80
            },
            matches: [
              {
                id: 56,
                front: '相似问题',
                back: '相似答案',
                topic_id: 7,
                similarity: 0.923
              }
            ]
          }
        });
      }
      throw new Error(`未处理的请求: ${url}`);
    });

    renderCardsPage();
    await screen.findByText('Go slice 的底层结构是什么?');
    await userEvent.click(screen.getByRole('button', { name: '编辑 Card 101' }));
    await screen.findByDisplayValue('Go slice 的底层结构是什么?');
    await userEvent.click(screen.getByRole('button', { name: '开始查重' }));

    expect(await screen.findByText('Semantic 结果')).toBeInTheDocument();
    expect(screen.getByText('92.3%')).toBeInTheDocument();
    expect(screen.getByText('80.0%')).toBeInTheDocument();
    expect(screen.getByText('启用总数')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('similarity_disabled 和 embedding_unavailable 保留编辑输入', async () => {
    let checkCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith('/api/web/topics')) return jsonResponse({ body: topicsResponse });
      if (url.startsWith('/api/web/cards?')) return jsonResponse({ body: cardsResponse });
      if (url === '/api/web/cards/101' && init?.method === 'GET') return jsonResponse({ body: cardDetail });
      if (url === '/api/web/cards/check' && init?.method === 'POST') {
        checkCalls += 1;
        if (checkCalls === 1) {
          return jsonResponse({
            status: 409,
            body: {
              error: {
                code: 'similarity_disabled',
                message: '语义查重能力当前未开放',
                details: {
                  coverage: {
                    total_enabled: 3,
                    ready: 1,
                    pending: 1,
                    processing: 0,
                    failed: 1,
                    ready_percent: 33.3
                  }
                }
              }
            }
          });
        }
        return jsonResponse({
          status: 503,
          body: { error: { code: 'embedding_unavailable', message: '生成查询向量失败' } }
        });
      }
      throw new Error(`未处理的请求: ${url}`);
    });

    renderCardsPage();
    await screen.findByText('Go slice 的底层结构是什么?');
    await userEvent.click(screen.getByRole('button', { name: '编辑 Card 101' }));
    const front = await screen.findByDisplayValue('Go slice 的底层结构是什么?');
    fireEvent.change(front, { target: { value: '保留在编辑器中的查重输入' } });
    await userEvent.click(screen.getByRole('button', { name: '开始查重' }));
    expect(await screen.findByText('语义查重能力当前未开放')).toBeInTheDocument();
    expect(screen.getByDisplayValue('保留在编辑器中的查重输入')).toBeInTheDocument();
    expect(screen.getByText('33.3%')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '开始查重' }));
    expect(await screen.findByText('生成查询向量失败')).toBeInTheDocument();
    expect(screen.getByDisplayValue('保留在编辑器中的查重输入')).toBeInTheDocument();
  });

  it('validation_error 保留 Front 和查重面板输入', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith('/api/web/topics')) return jsonResponse({ body: topicsResponse });
      if (url.startsWith('/api/web/cards?')) return jsonResponse({ body: cardsResponse });
      if (url === '/api/web/cards/101' && init?.method === 'GET') return jsonResponse({ body: cardDetail });
      if (url === '/api/web/cards/check' && init?.method === 'POST') {
        return jsonResponse({
          status: 400,
          body: { error: { code: 'validation_error', message: 'front 不能为空', details: { field: 'front' } } }
        });
      }
      throw new Error(`未处理的请求: ${url}`);
    });

    renderCardsPage();
    await screen.findByText('Go slice 的底层结构是什么?');
    await userEvent.click(screen.getByRole('button', { name: '编辑 Card 101' }));
    const front = await screen.findByDisplayValue('Go slice 的底层结构是什么?');
    fireEvent.change(front, { target: { value: '仍然保留的 Front' } });
    await userEvent.click(screen.getByRole('button', { name: '开始查重' }));
    expect(await screen.findByText('front 不能为空')).toBeInTheDocument();
    expect(screen.getByDisplayValue('仍然保留的 Front')).toBeInTheDocument();
  });

  it('单卡回收携带当前 version，成功前不移除，成功后刷新列表', async () => {
    let trashResolve: ((value: Response) => void) | undefined;
    let listCalls = 0;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);
      if (url.startsWith('/api/web/topics')) return Promise.resolve(jsonResponse({ body: topicsResponse }));
      if (url.startsWith('/api/web/cards?')) {
        listCalls += 1;
        return Promise.resolve(jsonResponse({ body: cardsResponse }));
      }
      if (url === '/api/web/cards/101/trash' && init?.method === 'POST') {
        return new Promise<Response>((resolve) => {
          trashResolve = resolve;
        });
      }
      throw new Error(`未处理的请求: ${url}`);
    });

    renderCardsPage();
    await screen.findByText('Go slice 的底层结构是什么?');
    await userEvent.click(screen.getByRole('button', { name: '放入回收站 Card 101' }));
    const singleTrashDialog = screen.getByRole('dialog', { name: '放入回收站' });
    expect(singleTrashDialog).toBeInTheDocument();
    await userEvent.click(singleTrashDialog.querySelector('button:last-child') as HTMLButtonElement);

    expect(screen.getByText('Go slice 的底层结构是什么?')).toBeInTheDocument();
    const trashCalls = fetchMock.mock.calls.filter(
      ([input, init]) => String(input) === '/api/web/cards/101/trash' && init?.method === 'POST'
    );
    expect(trashCalls).toHaveLength(1);
    expect(JSON.parse(String(trashCalls[0]?.[1]?.body))).toEqual({ expected_version: 3 });

    trashResolve?.(jsonResponse({ body: { trashed_card_id: 101 } }));
    expect(await screen.findByText('1 张 Card 已放入回收站')).toBeInTheDocument();
    await waitFor(() => expect(listCalls).toBeGreaterThan(1));
  });

  it('批量回收为每项发送自己的 version，并展示 details.index', async () => {
    let batchBody: unknown;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith('/api/web/topics')) return jsonResponse({ body: topicsResponse });
      if (url.startsWith('/api/web/cards?')) return jsonResponse({ body: cardsResponse });
      if (url === '/api/web/cards/batch-trash' && init?.method === 'POST') {
        batchBody = JSON.parse(String(init.body));
        return jsonResponse({
          status: 409,
          body: {
            error: {
              code: 'version_conflict',
              message: 'Card 已被修改',
              details: { index: 1, current_version: 4 }
            }
          }
        });
      }
      throw new Error(`未处理的请求: ${url}`);
    });

    renderCardsPage();
    await screen.findByText('Go slice 的底层结构是什么?');
    await userEvent.click(screen.getByRole('checkbox', { name: '选择 Card 101' }));
    await userEvent.click(screen.getByRole('checkbox', { name: '选择 Card 102' }));
    await userEvent.click(screen.getByRole('button', { name: '放入回收站' }));
    const batchTrashDialog = screen.getByRole('dialog', { name: '放入回收站' });
    await userEvent.click(batchTrashDialog.querySelector('button:last-child') as HTMLButtonElement);

    await waitFor(() =>
      expect(
        screen.getAllByRole('alert').some((alert) => alert.textContent?.includes('批量项目 2'))
      ).toBe(true)
    );
    expect(batchBody).toEqual({
      items: [
        { id: 101, expected_version: 3 },
        { id: 102, expected_version: 1 }
      ]
    });
    expect(screen.getByText('Go slice 的底层结构是什么?')).toBeInTheDocument();
    expect(screen.getByText('没有 Topic 的卡片如何筛选?')).toBeInTheDocument();
  });

  it('合并时来源 Topic 或 Embedding 不一致，必须在客户端显式选择后才发请求', async () => {
    let mergeCalls = 0;
    let mergeBody: unknown;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith('/api/web/topics')) return jsonResponse({ body: topicsResponse });
      if (url.startsWith('/api/web/cards?')) return jsonResponse({ body: cardsResponse });
      // 101 使用 Topic 7 且启用 Embedding, 102 无 Topic 且禁用, 两者都不一致.
      if (url === '/api/web/cards/101' && init?.method === 'GET') return jsonResponse({ body: cardDetail });
      if (url === '/api/web/cards/102' && init?.method === 'GET') {
        return jsonResponse({ body: { ...cardDetail, id: 102, topic_id: null, enable_embedding: false } });
      }
      if (url === '/api/web/cards/merge' && init?.method === 'POST') {
        mergeCalls += 1;
        mergeBody = JSON.parse(String(init.body));
        return jsonResponse({ body: { ...cardDetail, id: 200, version: 1 } });
      }
      throw new Error(`未处理的请求: ${url}`);
    });

    renderCardsPage();
    await screen.findByText('Go slice 的底层结构是什么?');
    await userEvent.click(screen.getByRole('checkbox', { name: '选择 Card 101' }));
    await userEvent.click(screen.getByRole('checkbox', { name: '选择 Card 102' }));
    await userEvent.click(screen.getByRole('button', { name: '合并所选' }));
    expect(await screen.findByRole('dialog', { name: '合并 Card' })).toBeInTheDocument();

    // 不一致时没有默认具体值, 直接提交应被前端拦截, 不发出任何合并请求.
    await userEvent.click(screen.getByRole('button', { name: '合并并放入回收站' }));
    expect(await screen.findByText(/Topic 不同，请选择合并后的 Topic/)).toBeInTheDocument();
    expect(mergeCalls).toBe(0);

    await userEvent.selectOptions(screen.getByLabelText('合并后的 Topic'), 'none');
    await userEvent.click(screen.getByRole('button', { name: '合并并放入回收站' }));
    expect(await screen.findByText(/Embedding 开关不同，请选择合并后的状态/)).toBeInTheDocument();
    expect(mergeCalls).toBe(0);

    await userEvent.selectOptions(screen.getByLabelText('合并后的 Embedding'), 'disabled');
    await userEvent.click(screen.getByRole('button', { name: '合并并放入回收站' }));

    await waitFor(() => expect(mergeCalls).toBe(1));
    expect(mergeBody).toEqual({
      source_card_ids: [101, 102],
      topic_id: null,
      enable_embedding: false
    });
  });

  it('合并时来源一致则预选共同值，并作为显式字段提交', async () => {
    let mergeBody: unknown;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith('/api/web/topics')) return jsonResponse({ body: topicsResponse });
      if (url.startsWith('/api/web/cards?')) return jsonResponse({ body: cardsResponse });
      // 两张来源 Card 的 Topic 7 与 Embedding 均一致.
      if (url === '/api/web/cards/101' && init?.method === 'GET') return jsonResponse({ body: cardDetail });
      if (url === '/api/web/cards/102' && init?.method === 'GET') {
        return jsonResponse({ body: { ...cardDetail, id: 102 } });
      }
      if (url === '/api/web/cards/merge' && init?.method === 'POST') {
        mergeBody = JSON.parse(String(init.body));
        return jsonResponse({ body: { ...cardDetail, id: 201, version: 1 } });
      }
      throw new Error(`未处理的请求: ${url}`);
    });

    renderCardsPage();
    await screen.findByText('Go slice 的底层结构是什么?');
    await userEvent.click(screen.getByRole('checkbox', { name: '选择 Card 101' }));
    await userEvent.click(screen.getByRole('checkbox', { name: '选择 Card 102' }));
    await userEvent.click(screen.getByRole('button', { name: '合并所选' }));
    expect(await screen.findByRole('dialog', { name: '合并 Card' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '合并并放入回收站' }));

    await waitFor(() =>
      expect(mergeBody).toEqual({
        source_card_ids: [101, 102],
        topic_id: 7,
        enable_embedding: true
      })
    );
  });

  it('新筛选请求会中止失去观察者的旧请求', async () => {
    const observedSignals: AbortSignal[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);
      if (url.startsWith('/api/web/topics')) {
        return Promise.resolve(jsonResponse({ body: topicsResponse }));
      }
      if (url.startsWith('/api/web/cards')) {
        if (init?.signal instanceof AbortSignal) observedSignals.push(init.signal);
        return new Promise<Response>((resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
          if (url.includes('topic_id=7')) {
            resolve(jsonResponse({ body: cardsResponse }));
          }
        });
      }
      throw new Error(`未处理的请求: ${url}`);
    });

    renderCardsPage();
    const topicSelect = await screen.findByLabelText('Topic 筛选');
    await waitFor(() => {
      expect(topicSelect).toBeEnabled();
      expect(screen.getByRole('option', { name: 'Go' })).toBeInTheDocument();
    });
    await userEvent.selectOptions(topicSelect, '7');
    expect(await screen.findByText('Go slice 的底层结构是什么?')).toBeInTheDocument();
    await waitFor(() => expect(observedSignals[0]?.aborted).toBe(true));
  });
});
