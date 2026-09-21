import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrashPage } from './TrashPage';

/**
 * 回收站页面集成测试。
 *
 * 覆盖三 Tab 的 loading/empty/error/success、局部失败不阻塞其他 Tab、真实字段渲染、
 * Card 恢复生成新 ID 且不出现“保留原 Topic”、Topic 恢复 409 name_conflict、
 * 永久删除与清空回收站需经高危确认、批量失败 details.index 定位、以及提交防重复。
 */

interface MockResponse {
  status?: number;
  body: unknown;
}

const trashCardsResponse = {
  items: [
    {
      id: 15,
      front: 'Go slice 的底层结构是什么?',
      back: 'slice header 包含指针、长度和容量。',
      enable_embedding: false,
      version: 4,
      created_at: '2026-08-01T00:00:00Z',
      trashed_at: '2026-09-15T00:00:00Z'
    },
    {
      id: 16,
      front: '第二张被回收的卡片?',
      back: '第二张答案',
      enable_embedding: true,
      version: 2,
      created_at: '2026-08-02T00:00:00Z',
      trashed_at: '2026-09-14T00:00:00Z'
    }
  ],
  total: 42,
  page: 1,
  page_size: 20
};

const trashTopicsResponse = {
  items: [
    {
      id: 3,
      name: '暂时无卡分类',
      description: '用于验证 Topic 空状态。',
      card_count: 0,
      version: 2,
      trashed_at: '2026-09-13T00:00:00Z',
      created_at: '2026-08-03T00:00:00Z',
      updated_at: '2026-09-10T00:00:00Z'
    }
  ],
  total: 1,
  page: 1,
  page_size: 20
};

const trashGlossaryResponse = {
  items: [
    {
      id: 9,
      term: 'closures',
      definition: '闭包是捕获了外部变量的函数。',
      version: 1,
      trashed_at: '2026-09-12T00:00:00Z',
      created_at: '2026-08-04T00:00:00Z',
      updated_at: '2026-08-04T00:00:00Z'
    }
  ],
  total: 1,
  page: 1,
  page_size: 20
};

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

const jsonResponse = ({ status = 200, body }: MockResponse): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

const renderTrashPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false }
    }
  });
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/trash']}>
        <TrashPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...rendered, queryClient };
};

// 默认路由: 三个回收站列表 + 正常 Topic 数据源。trash/* 必须先于普通 topics 判断。
const mockTrashApi = (overrides: Record<string, MockResponse> = {}) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const key = `${method} ${url}`;
    for (const [pattern, response] of Object.entries(overrides)) {
      if (key.startsWith(pattern) || url.startsWith(pattern)) return jsonResponse(response);
    }
    if (url.startsWith('/api/web/trash/cards')) return jsonResponse({ body: trashCardsResponse });
    if (url.startsWith('/api/web/trash/topics')) return jsonResponse({ body: trashTopicsResponse });
    if (url.startsWith('/api/web/trash/glossary')) return jsonResponse({ body: trashGlossaryResponse });
    if (url.startsWith('/api/web/topics')) return jsonResponse({ body: topicsResponse });
    throw new Error(`未处理的请求: ${method} ${url}`);
  });

const trashRequestURLs = (path: string) =>
  vi.mocked(globalThis.fetch).mock.calls
    .map(([input]) => String(input))
    .filter((url) => url.startsWith(path));

const lastRequest = (path: string) => {
  const urls = trashRequestURLs(path);
  return new URL(urls[urls.length - 1] ?? '', 'http://localhost');
};

const findCalls = (path: string, method: string) =>
  vi.mocked(globalThis.fetch).mock.calls.filter(
    ([input, init]) =>
      String(input).startsWith(path) && (init?.method ?? 'GET').toUpperCase() === method
  );

describe('TrashPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('默认进入 Cards Tab, 三个 Tab 可见并渲染真实字段', async () => {
    mockTrashApi();
    renderTrashPage();

    expect(await screen.findByText('Go slice 的底层结构是什么?')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Cards' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Topics' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Glossary' })).toBeInTheDocument();
    // 回收站 Card 不含 topic_id, 页面不展示也不伪造 Topic 归属。
    expect(screen.queryByText(/保留原 Topic/)).not.toBeInTheDocument();
    expect(screen.getByText('当前页 2 项，共 42 项')).toBeInTheDocument();
    expect(screen.getByText('第 1 / 3 页, 共 42 项')).toBeInTheDocument();
    expect(screen.getAllByText('v4')).toHaveLength(1);
    expect(screen.getAllByText('v2')).toHaveLength(1);
  });

  it('三个 Tab 各自请求对应列表端点', async () => {
    mockTrashApi();
    renderTrashPage();
    await screen.findByText('Go slice 的底层结构是什么?');
    expect(trashRequestURLs('/api/web/trash/cards')).toHaveLength(1);

    await userEvent.click(screen.getByRole('tab', { name: 'Topics' }));
    expect(await screen.findByText('暂时无卡分类')).toBeInTheDocument();
    expect(trashRequestURLs('/api/web/trash/topics')).toHaveLength(1);

    await userEvent.click(screen.getByRole('tab', { name: 'Glossary' }));
    expect(await screen.findByText('closures')).toBeInTheDocument();
    expect(trashRequestURLs('/api/web/trash/glossary')).toHaveLength(1);
  });

  it('某一 Tab 加载失败不阻塞其他 Tab', async () => {
    mockTrashApi({
      '/api/web/trash/topics': {
        status: 500,
        body: { error: { code: 'internal_error', message: '回收站 Topic 服务不可用' } }
      }
    });
    renderTrashPage();
    await screen.findByText('Go slice 的底层结构是什么?');

    await userEvent.click(screen.getByRole('tab', { name: 'Topics' }));
    expect(await screen.findByText('回收站Topic加载失败')).toBeInTheDocument();
    expect(screen.getByText('回收站 Topic 服务不可用')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Glossary' }));
    expect(await screen.findByText('closures')).toBeInTheDocument();
  });

  it('空数据显示空状态', async () => {
    mockTrashApi({
      '/api/web/trash/cards': {
        body: { items: [], total: 0, page: 1, page_size: 20 }
      }
    });
    renderTrashPage();
    expect(await screen.findByText('回收站中没有Card')).toBeInTheDocument();
  });

  it('列表分页使用 page 与 page_size', async () => {
    mockTrashApi({
      '/api/web/trash/cards?': { body: trashCardsResponse }
    });
    renderTrashPage();
    await screen.findByText('Go slice 的底层结构是什么?');

    expect(lastRequest('/api/web/trash/cards').searchParams.get('page')).toBe('1');
    await userEvent.click(screen.getByRole('button', { name: '下一页' }));
    await waitFor(() => expect(lastRequest('/api/web/trash/cards').searchParams.get('page')).toBe('2'));

    await userEvent.selectOptions(screen.getByLabelText('每页数量'), '50');
    await waitFor(() => {
      const request = lastRequest('/api/web/trash/cards');
      expect(request.searchParams.get('page_size')).toBe('50');
      expect(request.searchParams.get('page')).toBe('1');
    });
  });

  it('Card 恢复到无 Topic 只发送 expected_version, 并使用 new_card_id', async () => {
    mockTrashApi({
      'POST /api/web/trash/cards/15/restore': { status: 200, body: { trash_card_id: 15, new_card_id: 42 } }
    });
    renderTrashPage();
    await screen.findByText('Go slice 的底层结构是什么?');

    await userEvent.click(screen.getByRole('button', { name: '恢复Card 15' }));
    const dialog = await screen.findByRole('dialog', { name: '恢复 Card' });
    // 只能选“无 Topic”或指定正常 Topic, 不得出现“保留原 Topic”。
    expect(within(dialog).queryByText(/保留原 Topic/)).not.toBeInTheDocument();
    expect(within(dialog).getByRole('option', { name: '恢复到无 Topic' })).toBeInTheDocument();
    expect(within(dialog).getByRole('option', { name: 'Go' })).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: '恢复 Card' }));

    await waitFor(() => expect(findCalls('/api/web/trash/cards/15/restore', 'POST')).toHaveLength(1));
    expect(JSON.parse(String(findCalls('/api/web/trash/cards/15/restore', 'POST')[0]?.[1]?.body))).toEqual({
      expected_version: 4
    });
    expect(await screen.findByText('Card #15 已恢复为新 Card #42')).toBeInTheDocument();
  });

  it('Card 恢复可指定一个当前正常 Topic', async () => {
    mockTrashApi({
      'POST /api/web/trash/cards/15/restore': { status: 200, body: { trash_card_id: 15, new_card_id: 77 } }
    });
    renderTrashPage();
    await screen.findByText('Go slice 的底层结构是什么?');

    await userEvent.click(screen.getByRole('button', { name: '恢复Card 15' }));
    const dialog = await screen.findByRole('dialog', { name: '恢复 Card' });
    await userEvent.selectOptions(within(dialog).getByLabelText('恢复后的 Topic'), '7');
    await userEvent.click(within(dialog).getByRole('button', { name: '恢复 Card' }));

    await waitFor(() => expect(findCalls('/api/web/trash/cards/15/restore', 'POST')).toHaveLength(1));
    expect(JSON.parse(String(findCalls('/api/web/trash/cards/15/restore', 'POST')[0]?.[1]?.body))).toEqual({
      expected_version: 4,
      topic_id: 7
    });
  });

  it('Topic 恢复遇到 409 name_conflict 时提示并保留状态', async () => {
    mockTrashApi({
      'POST /api/web/trash/topics/3/restore': {
        status: 409,
        body: { error: { code: 'name_conflict', message: '同名 Topic 已存在' } }
      }
    });
    renderTrashPage();
    await screen.findByText('Go slice 的底层结构是什么?');
    await userEvent.click(screen.getByRole('tab', { name: 'Topics' }));
    await screen.findByText('暂时无卡分类');

    await userEvent.click(screen.getByRole('button', { name: '恢复Topic 3' }));

    expect(await screen.findByText('同名正常对象已存在: 同名 Topic 已存在')).toBeInTheDocument();
    // 未成功恢复, 列表项仍在原处。
    expect(screen.getByText('暂时无卡分类')).toBeInTheDocument();
    expect(findCalls('/api/web/trash/topics/3/restore', 'POST')).toHaveLength(1);
  });

  it('Glossary 恢复成功后提示', async () => {
    mockTrashApi({
      'POST /api/web/trash/glossary/9/restore': {
        status: 200,
        body: {
          id: 9,
          term: 'closures',
          definition: '闭包是捕获了外部变量的函数。',
          version: 1,
          created_at: '2026-08-04T00:00:00Z',
          updated_at: '2026-08-04T00:00:00Z'
        }
      }
    });
    renderTrashPage();
    await screen.findByText('Go slice 的底层结构是什么?');
    await userEvent.click(screen.getByRole('tab', { name: 'Glossary' }));
    await screen.findByText('closures');

    await userEvent.click(screen.getByRole('button', { name: '恢复术语 9' }));
    expect(await screen.findByText('术语 #9 已恢复')).toBeInTheDocument();
  });

  it('永久删除必须经过高危确认, 确认前不发请求', async () => {
    let resolveDelete: ((value: Response) => void) | undefined;
    mockTrashApi({
      'POST /api/web/trash/cards/15/delete': { status: 200, body: { ok: true } }
    });
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.startsWith('/api/web/trash/cards/15/delete') && method === 'POST') {
        return new Promise<Response>((resolve) => {
          resolveDelete = resolve;
        });
      }
      if (url.startsWith('/api/web/trash/cards')) return jsonResponse({ body: trashCardsResponse });
      if (url.startsWith('/api/web/topics')) return jsonResponse({ body: topicsResponse });
      throw new Error(`未处理的请求: ${method} ${url}`);
    });

    renderTrashPage();
    await screen.findByText('Go slice 的底层结构是什么?');

    await userEvent.click(screen.getByRole('button', { name: '永久删除Card 15' }));
    const dialog = await screen.findByRole('dialog', { name: '永久删除' });
    expect(within(dialog).getByText(/不可恢复/)).toBeInTheDocument();
    expect(findCalls('/api/web/trash/cards/15/delete', 'POST')).toHaveLength(0);

    const confirmButton = within(dialog).getByRole('button', { name: '永久删除' });
    await userEvent.dblClick(confirmButton);
    expect(confirmButton).toBeDisabled();
    expect(findCalls('/api/web/trash/cards/15/delete', 'POST')).toHaveLength(1);
    expect(JSON.parse(String(findCalls('/api/web/trash/cards/15/delete', 'POST')[0]?.[1]?.body))).toEqual({
      expected_version: 4
    });

    resolveDelete?.(jsonResponse({ body: { ok: true } }));
    expect(await screen.findByText('Card #15 已永久删除')).toBeInTheDocument();
  });

  it('批量永久删除失败时按 details.index 定位失败项', async () => {
    mockTrashApi();
    const original = vi.mocked(globalThis.fetch).getMockImplementation();
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.startsWith('/api/web/trash/cards/batch-delete') && method === 'POST') {
        return jsonResponse({
          status: 409,
          body: {
            error: {
              code: 'version_conflict',
              message: 'Card 已被修改',
              details: { index: 1, current_version: 5 }
            }
          }
        });
      }
      return original?.(input, init) as Promise<Response>;
    });

    renderTrashPage();
    await screen.findByText('Go slice 的底层结构是什么?');
    await userEvent.click(screen.getByRole('checkbox', { name: '选择Card 15' }));
    await userEvent.click(screen.getByRole('checkbox', { name: '选择Card 16' }));
    await userEvent.click(screen.getByRole('button', { name: '批量永久删除' }));

    const dialog = await screen.findByRole('dialog', { name: '批量永久删除' });
    expect(findCalls('/api/web/trash/cards/batch-delete', 'POST')).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole('button', { name: '批量永久删除' }));

    await waitFor(() =>
      expect(within(dialog).getByRole('alert')).toHaveTextContent('批量项目 2（Card #16）')
    );
    expect(within(dialog).getByRole('alert')).toHaveTextContent('版本冲突: Card 已被修改');
    expect(findCalls('/api/web/trash/cards/batch-delete', 'POST')).toHaveLength(1);
    expect(
      JSON.parse(String(findCalls('/api/web/trash/cards/batch-delete', 'POST')[0]?.[1]?.body))
    ).toEqual({
      items: [
        { id: 15, expected_version: 4 },
        { id: 16, expected_version: 2 }
      ]
    });
  });

  it('批量恢复 Card 统一选择 Topic 并发送 topic_id', async () => {
    mockTrashApi({
      'POST /api/web/trash/cards/batch-restore': {
        status: 200,
        body: {
          restored: [
            { trash_card_id: 15, new_card_id: 100 },
            { trash_card_id: 16, new_card_id: 101 }
          ]
        }
      }
    });
    renderTrashPage();
    await screen.findByText('Go slice 的底层结构是什么?');
    await userEvent.click(screen.getByRole('checkbox', { name: '选择Card 15' }));
    await userEvent.click(screen.getByRole('checkbox', { name: '选择Card 16' }));
    await userEvent.click(screen.getByRole('button', { name: '批量恢复' }));

    const dialog = await screen.findByRole('dialog', { name: '批量恢复Card' });
    await userEvent.selectOptions(within(dialog).getByLabelText('统一恢复到 Topic'), '7');
    await userEvent.click(within(dialog).getByRole('button', { name: '批量恢复' }));

    await waitFor(() =>
      expect(findCalls('/api/web/trash/cards/batch-restore', 'POST')).toHaveLength(1)
    );
    expect(
      JSON.parse(String(findCalls('/api/web/trash/cards/batch-restore', 'POST')[0]?.[1]?.body))
    ).toEqual({
      items: [
        { id: 15, expected_version: 4, topic_id: 7 },
        { id: 16, expected_version: 2, topic_id: 7 }
      ]
    });
    expect(await screen.findByText('2 个Card已恢复')).toBeInTheDocument();
  });

  it('清空回收站需要确认且不携带请求体', async () => {
    mockTrashApi({
      'POST /api/web/trash/empty': { status: 200, body: { cards: 3, topics: 1, glossary: 2 } }
    });
    renderTrashPage();
    await screen.findByText('Go slice 的底层结构是什么?');

    await userEvent.click(screen.getByRole('button', { name: '清空回收站' }));
    const dialog = await screen.findByRole('dialog', { name: '清空回收站' });
    expect(findCalls('/api/web/trash/empty', 'POST')).toHaveLength(0);

    await userEvent.click(within(dialog).getByRole('button', { name: '清空回收站' }));
    await waitFor(() => expect(findCalls('/api/web/trash/empty', 'POST')).toHaveLength(1));
    const call = findCalls('/api/web/trash/empty', 'POST')[0];
    expect(call?.[1]?.body).toBeUndefined();
    expect(await screen.findByText('回收站已清空：Card 3、Topic 1、术语 2')).toBeInTheDocument();
  });

  it('查询使用 AbortSignal 且 query key 覆盖 Tab 与分页', async () => {
    const observedSignals: AbortSignal[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith('/api/web/trash/cards')) {
        if (init?.signal instanceof AbortSignal) observedSignals.push(init.signal);
        return jsonResponse({ body: trashCardsResponse });
      }
      if (url.startsWith('/api/web/trash/topics')) return jsonResponse({ body: trashTopicsResponse });
      if (url.startsWith('/api/web/trash/glossary')) return jsonResponse({ body: trashGlossaryResponse });
      if (url.startsWith('/api/web/topics')) return jsonResponse({ body: topicsResponse });
      throw new Error(`未处理的请求: ${url}`);
    });

    const { queryClient } = renderTrashPage();
    await screen.findByText('Go slice 的底层结构是什么?');
    expect(observedSignals.length).toBeGreaterThan(0);

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((query) => JSON.stringify(query.queryKey));
    // Cards Tab 与 Topics Tab 的列表 key 互相独立。
    expect(keys.some((key) => key.startsWith('["trash","cards","list"'))).toBe(true);
    await userEvent.click(screen.getByRole('tab', { name: 'Topics' }));
    await screen.findByText('暂时无卡分类');
    const keysAfter = queryClient
      .getQueryCache()
      .getAll()
      .map((query) => JSON.stringify(query.queryKey));
    expect(keysAfter.some((key) => key.startsWith('["trash","topics","list"'))).toBe(true);
  });
});
