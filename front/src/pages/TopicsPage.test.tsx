import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TopicsPage } from './TopicsPage';

interface MockResponse {
  status?: number;
  body: unknown;
}

const topicItems = [
  {
    id: 7,
    name: '算法与数据结构',
    description: '算法复杂度、常用数据结构与解题方法.',
    card_count: 2,
    version: 3,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-03T08:30:00Z'
  },
  {
    id: 8,
    name: '暂时无卡分类',
    description: '',
    card_count: 0,
    version: 1,
    created_at: '2026-01-02T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z'
  }
];

const topicsResponse = {
  items: topicItems,
  total: 42,
  page: 1,
  page_size: 20
};

const topicDetail = {
  ...topicItems[0],
  description: '**重点** 分类，包含 `复杂度` 内容。'
};

const jsonResponse = ({ status = 200, body }: MockResponse): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

const renderTopicsPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false }
    }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TopicsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

const mockTopics = (response: MockResponse = { body: topicsResponse }) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith('/api/web/topics?')) return jsonResponse(response);
    if (url.startsWith('/api/web/topics/')) return jsonResponse({ body: topicDetail });
    throw new Error(`未处理的请求: ${url}`);
  });

const topicRequestURLs = () =>
  vi.mocked(globalThis.fetch).mock.calls
    .map(([input]) => String(input))
    .filter((url: string) => url.startsWith('/api/web/topics?'));

const lastTopicRequest = () => {
  const urls = topicRequestURLs();
  return new URL(urls[urls.length - 1] ?? '', 'http://localhost');
};

describe('TopicsPage', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('显示 loading 状态', async () => {
    let resolveTopics: ((value: Response) => void) | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      new Promise<Response>((resolve) => {
        resolveTopics = resolve;
      })
    );

    renderTopicsPage();
    expect(screen.getByText('正在加载 Topic')).toBeInTheDocument();

    resolveTopics?.(jsonResponse({ body: topicsResponse }));
    expect(await screen.findByText('算法与数据结构')).toBeInTheDocument();
  });

  it('显示列表、数量统计和分页信息', async () => {
    mockTopics();
    renderTopicsPage();

    expect(await screen.findByText('算法与数据结构')).toBeInTheDocument();
    expect(screen.getByText('暂时无卡分类')).toBeInTheDocument();
    expect(screen.getByText('当前页 2 个，筛选结果共 42 个')).toBeInTheDocument();
    expect(screen.getByText('第 1 / 3 页, 共 42 项')).toBeInTheDocument();
    expect(screen.getAllByText('v3')).toHaveLength(1);
    expect(screen.getAllByText('v1')).toHaveLength(1);
    // 描述为空字符串的 Topic 不渲染空描述段落, 只验证名称行存在.
    expect(screen.getByTitle('暂时无卡分类')).toBeInTheDocument();
  });

  it('显示空状态', async () => {
    mockTopics({ body: { items: [], total: 0, page: 1, page_size: 20 } });
    renderTopicsPage();
    expect(await screen.findByText('没有符合条件的 Topic')).toBeInTheDocument();
  });

  it('显示错误并支持重新加载', async () => {
    let topicsCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/web/topics?')) {
        topicsCalls += 1;
        if (topicsCalls === 1) {
          return jsonResponse({
            status: 500,
            body: { error: { code: 'internal_error', message: 'Topic 服务不可用' } }
          });
        }
        return jsonResponse({ body: topicsResponse });
      }
      throw new Error(`未处理的请求: ${url}`);
    });

    renderTopicsPage();
    expect(await screen.findByText('Topic 加载失败')).toBeInTheDocument();
    expect(screen.getByText('Topic 服务不可用')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '重新尝试' }));
    expect(await screen.findByText('算法与数据结构')).toBeInTheDocument();
  });

  it('提交搜索和每页数量参数', async () => {
    mockTopics();
    renderTopicsPage();
    await screen.findByText('算法与数据结构');

    expect(lastTopicRequest().searchParams.has('q')).toBe(false);

    await userEvent.selectOptions(screen.getByLabelText('每页数量'), '50');
    await waitFor(() => expect(lastTopicRequest().searchParams.get('page_size')).toBe('50'));

    await userEvent.type(screen.getByRole('searchbox', { name: '搜索 Topic 名称' }), '算法');
    await waitFor(() => {
      const request = lastTopicRequest();
      expect(request.searchParams.get('q')).toBe('算法');
      expect(request.searchParams.get('page')).toBe('1');
      expect(request.searchParams.get('page_size')).toBe('50');
    });
  });

  it('翻页提交 page 参数，筛选变化回到第一页', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/web/topics?')) {
        const requestPage = Number(new URL(url, 'http://localhost').searchParams.get('page'));
        return jsonResponse({ body: { ...topicsResponse, page: requestPage } });
      }
      if (url.startsWith('/api/web/topics/')) return jsonResponse({ body: topicDetail });
      throw new Error(`未处理的请求: ${url}`);
    });
    renderTopicsPage();
    await screen.findByText('算法与数据结构');

    await userEvent.click(screen.getByRole('button', { name: '下一页' }));
    await waitFor(() => expect(lastTopicRequest().searchParams.get('page')).toBe('2'));

    await userEvent.selectOptions(screen.getByLabelText('每页数量'), '100');
    await waitFor(() => expect(lastTopicRequest().searchParams.get('page')).toBe('1'));
  });

  it('查看详情请求独立详情端点并安全渲染 Markdown 描述', async () => {
    const fetchMock = mockTopics();
    renderTopicsPage();
    await screen.findByText('算法与数据结构');

    await userEvent.click(screen.getByRole('button', { name: '查看 Topic 7 详情' }));
    const dialog = await screen.findByRole('dialog', { name: 'Topic 详情' });

    const detailCalls = fetchMock.mock.calls.filter(
      ([input]) => String(input) === '/api/web/topics/7'
    );
    expect(detailCalls).toHaveLength(1);
    expect(dialog).toBeInTheDocument();
    // Markdown strong 与行内代码被安全渲染为语义元素.
    expect(screen.getByText('重点')).toBeInTheDocument();
    expect(screen.getByText('复杂度')).toBeInTheDocument();
    expect(screen.getByText('Card 数量')).toBeInTheDocument();
    // 详情弹窗内的关联卡数量, 与列表行中的同名数字区分开.
    expect(within(dialog).getByText('2')).toBeInTheDocument();
    expect(within(dialog).getByText('v3')).toBeInTheDocument();
  });

  it('详情 404 显示 not_found 信息并支持重试', async () => {
    let detailCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/web/topics?')) return jsonResponse({ body: topicsResponse });
      if (url === '/api/web/topics/7') {
        detailCalls += 1;
        if (detailCalls === 1) {
          return jsonResponse({
            status: 404,
            body: { error: { code: 'not_found', message: 'Topic 不存在' } }
          });
        }
        return jsonResponse({ body: topicDetail });
      }
      throw new Error(`未处理的请求: ${url}`);
    });

    renderTopicsPage();
    await screen.findByText('算法与数据结构');
    await userEvent.click(screen.getByRole('button', { name: '查看 Topic 7 详情' }));

    expect(await screen.findByText('Topic 加载失败')).toBeInTheDocument();
    expect(screen.getByText('Topic 不存在')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '重新尝试' }));
    expect(await screen.findByText('重点')).toBeInTheDocument();
    expect(detailCalls).toBe(2);
  });

  it('创建 Topic 提交名称与描述并显示成功反馈', async () => {
    const created = {
      id: 20,
      name: '新建分类',
      description: '描述内容',
      card_count: 0,
      version: 1,
      created_at: '2026-01-05T00:00:00Z',
      updated_at: '2026-01-05T00:00:00Z'
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === '/api/web/topics' && init?.method === 'POST') {
        return jsonResponse({ status: 201, body: created });
      }
      if (url.startsWith('/api/web/topics')) return jsonResponse({ body: topicsResponse });
      throw new Error(`未处理的请求: ${url}`);
    });

    renderTopicsPage();
    await screen.findByText('算法与数据结构');
    await userEvent.click(screen.getByRole('button', { name: /新建 Topic/ }));

    const dialog = screen.getByRole('dialog', { name: '新建 Topic' });
    await userEvent.type(within(dialog).getByLabelText('名称'), '新建分类');
    await userEvent.type(within(dialog).getByLabelText(/描述/), '描述内容');
    await userEvent.click(within(dialog).getByRole('button', { name: '创建 Topic' }));

    expect(await screen.findByText('Topic #20 已创建')).toBeInTheDocument();
    const createCall = fetchMock.mock.calls.find(
      ([input, init]) => String(input) === '/api/web/topics' && init?.method === 'POST'
    );
    expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
      name: '新建分类',
      description: '描述内容'
    });
    // 保存成功后失效列表缓存, 触发重新拉取.
    await waitFor(() =>
      expect(
        topicRequestURLs().filter((url: string) => url.includes('page=1')).length
      ).toBeGreaterThanOrEqual(2)
    );
  });

  it('创建时空名称被客户端拦截且不发请求', async () => {
    const fetchMock = mockTopics();
    renderTopicsPage();
    await screen.findByText('算法与数据结构');
    await userEvent.click(screen.getByRole('button', { name: /新建 Topic/ }));

    const dialog = screen.getByRole('dialog', { name: '新建 Topic' });
    await userEvent.click(within(dialog).getByRole('button', { name: '创建 Topic' }));

    expect(await within(dialog).findByText('名称不能为空')).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([input, init]) => String(input) === '/api/web/topics' && init?.method === 'POST')
    ).toHaveLength(0);
  });

  it('name_conflict 保留用户输入', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === '/api/web/topics' && init?.method === 'POST') {
        return jsonResponse({
          status: 409,
          body: { error: { code: 'name_conflict', message: '名称已被占用' } }
        });
      }
      if (url.startsWith('/api/web/topics')) return jsonResponse({ body: topicsResponse });
      throw new Error(`未处理的请求: ${url}`);
    });

    renderTopicsPage();
    await screen.findByText('算法与数据结构');
    await userEvent.click(screen.getByRole('button', { name: /新建 Topic/ }));

    const dialog = screen.getByRole('dialog', { name: '新建 Topic' });
    const nameInput = within(dialog).getByLabelText('名称');
    await userEvent.type(nameInput, '冲突名称');
    await userEvent.click(within(dialog).getByRole('button', { name: '创建 Topic' }));

    expect(await within(dialog).findAllByText('名称已被占用')).toHaveLength(2);
    // 失败后保留用户输入, 弹窗不关闭.
    expect(nameInput).toHaveValue('冲突名称');
    expect(screen.queryByText('Topic #20 已创建')).not.toBeInTheDocument();
  });

  it('编辑提交 expected_version 与变更字段并更新详情缓存', async () => {
    const updated = { ...topicDetail, name: '算法与数据结构（修订）', version: 4 };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === '/api/web/topics/7' && init?.method === 'PATCH') {
        return jsonResponse({ body: updated });
      }
      if (url === '/api/web/topics/7' && init?.method === 'GET') {
        return jsonResponse({ body: topicDetail });
      }
      if (url.startsWith('/api/web/topics')) return jsonResponse({ body: topicsResponse });
      throw new Error(`未处理的请求: ${url}`);
    });

    renderTopicsPage();
    await screen.findByText('算法与数据结构');
    await userEvent.click(screen.getByRole('button', { name: '编辑 Topic 7' }));

    const dialog = await screen.findByRole('dialog', { name: '编辑 Topic' });
    const nameInput = within(dialog).getByLabelText('名称');
    expect(nameInput).toHaveValue('算法与数据结构');
    // 未修改时保存按钮禁用.
    expect(within(dialog).getByRole('button', { name: '保存修改' })).toBeDisabled();

    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, '算法与数据结构（修订）');
    await userEvent.click(within(dialog).getByRole('button', { name: '保存修改' }));

    expect(await screen.findByText('Topic #7 已保存，当前 version 为 4')).toBeInTheDocument();
    const patchCall = fetchMock.mock.calls.find(
      ([input, init]) => String(input) === '/api/web/topics/7' && init?.method === 'PATCH'
    );
    // 只发送变更字段, 不发送未变化的 description.
    expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({
      expected_version: 3,
      name: '算法与数据结构（修订）'
    });
  });

  it('编辑 version_conflict 显示冲突弹窗并支持重新加载', async () => {
    let detailCalls = 0;
    let patchCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === '/api/web/topics/7' && init?.method === 'PATCH') {
        patchCalls += 1;
        return jsonResponse({
          status: 409,
          body: {
            error: {
              code: 'version_conflict',
              message: 'Topic 已被修改',
              details: { current_version: 9 }
            }
          }
        });
      }
      if (url === '/api/web/topics/7') {
        detailCalls += 1;
        return jsonResponse({ body: { ...topicDetail, version: 9, name: '服务端新名称' } });
      }
      if (url.startsWith('/api/web/topics')) return jsonResponse({ body: topicsResponse });
      throw new Error(`未处理的请求: ${url}`);
    });

    renderTopicsPage();
    await screen.findByText('算法与数据结构');
    await userEvent.click(screen.getByRole('button', { name: '编辑 Topic 7' }));

    const dialog = await screen.findByRole('dialog', { name: '编辑 Topic' });
    const nameInput = within(dialog).getByLabelText('名称');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, '本地编辑名称');
    await userEvent.click(within(dialog).getByRole('button', { name: '保存修改' }));

    // 只有 version_conflict 显示版本冲突语义.
    expect(await screen.findByRole('dialog', { name: 'Topic 版本冲突' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('名称')).toHaveValue('本地编辑名称');

    await userEvent.click(screen.getByRole('button', { name: '重新加载最新版本' }));
    // 重新加载后表单回填服务端最新值.
    await waitFor(() => expect(within(dialog).getByLabelText('名称')).toHaveValue('服务端新名称'));
    expect(detailCalls).toBeGreaterThanOrEqual(2);
    expect(patchCalls).toBe(1);
  });

  it('回收预览请求只携带 ids 并展示影响范围', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === '/api/web/topics/trash-preview') {
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toEqual({ ids: [7] });
        return jsonResponse({ body: { topics: 1, affected_cards: 2, already_trashed: 0 } });
      }
      if (url.startsWith('/api/web/topics')) return jsonResponse({ body: topicsResponse });
      throw new Error(`未处理的请求: ${url}`);
    });

    renderTopicsPage();
    await screen.findByText('算法与数据结构');
    await userEvent.click(screen.getByRole('button', { name: '将 Topic 7 放入回收站' }));

    const dialog = await screen.findByRole('dialog', { name: '放入回收站' });
    expect(await within(dialog).findByText(/当前关联/)).toBeInTheDocument();
    expect(within(dialog).getByText('2')).toBeInTheDocument();
    expect(within(dialog).getByText('仅回收 Topic')).toBeInTheDocument();
    expect(within(dialog).getByText('连同关联 Card 一起回收')).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === '/api/web/topics/7/trash')).toHaveLength(0);
  });

  it('默认选择仅回收 Topic 并提交 expected_version 与 include_cards=false', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/web/topics/trash-preview') {
        return jsonResponse({ body: { topics: 1, affected_cards: 2, already_trashed: 0 } });
      }
      if (url === '/api/web/topics/7/trash') {
        return jsonResponse({ body: { trashed_topic_id: 7, affected_cards: 2 } });
      }
      if (url.startsWith('/api/web/topics')) return jsonResponse({ body: topicsResponse });
      throw new Error(`未处理的请求: ${url}`);
    });

    renderTopicsPage();
    await screen.findByText('算法与数据结构');
    await userEvent.click(screen.getByRole('button', { name: '将 Topic 7 放入回收站' }));

    const dialog = await screen.findByRole('dialog', { name: '放入回收站' });
    await userEvent.click(within(dialog).getByRole('button', { name: '放入回收站' }));

    expect(await screen.findByText('Topic #7 已放入回收站，2 张 Card 已变为无 Topic')).toBeInTheDocument();
    const trashCall = fetchMock.mock.calls.find(([input]) => String(input) === '/api/web/topics/7/trash');
    expect(JSON.parse(String(trashCall?.[1]?.body))).toEqual({
      expected_version: 3,
      include_cards: false
    });
  });

  it('选择连同 Card 回收时提交 include_cards=true', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/web/topics/trash-preview') {
        return jsonResponse({ body: { topics: 1, affected_cards: 2, already_trashed: 0 } });
      }
      if (url === '/api/web/topics/7/trash') {
        return jsonResponse({ body: { trashed_topic_id: 7, affected_cards: 2 } });
      }
      if (url.startsWith('/api/web/topics')) return jsonResponse({ body: topicsResponse });
      throw new Error(`未处理的请求: ${url}`);
    });

    renderTopicsPage();
    await screen.findByText('算法与数据结构');
    await userEvent.click(screen.getByRole('button', { name: '将 Topic 7 放入回收站' }));

    const dialog = await screen.findByRole('dialog', { name: '放入回收站' });
    await userEvent.click(within(dialog).getByRole('radio', { name: /连同关联 Card 一起回收/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: '放入回收站' }));

    expect(await screen.findByText('Topic #7 与 2 张关联 Card 已放入回收站')).toBeInTheDocument();
    const trashCall = fetchMock.mock.calls.find(([input]) => String(input) === '/api/web/topics/7/trash');
    expect(JSON.parse(String(trashCall?.[1]?.body))).toEqual({
      expected_version: 3,
      include_cards: true
    });
  });

  it('实际回收数与预览不同时提示并发变化', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/web/topics/trash-preview') {
        return jsonResponse({ body: { topics: 1, affected_cards: 5, already_trashed: 0 } });
      }
      if (url === '/api/web/topics/7/trash') {
        return jsonResponse({ body: { trashed_topic_id: 7, affected_cards: 3 } });
      }
      if (url.startsWith('/api/web/topics')) return jsonResponse({ body: topicsResponse });
      throw new Error(`未处理的请求: ${url}`);
    });

    renderTopicsPage();
    await screen.findByText('算法与数据结构');
    await userEvent.click(screen.getByRole('button', { name: '将 Topic 7 放入回收站' }));

    const dialog = await screen.findByRole('dialog', { name: '放入回收站' });
    await userEvent.click(within(dialog).getByRole('button', { name: '放入回收站' }));

    expect(
      await screen.findByText('Topic #7 已放入回收站，3 张 Card 已变为无 Topic（与预览的 5 张不同，期间数据发生了变化）')
    ).toBeInTheDocument();
  });

  it('回收 version_conflict 显示冲突提示且不自动重试', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/web/topics/trash-preview') {
        return jsonResponse({ body: { topics: 1, affected_cards: 2, already_trashed: 0 } });
      }
      if (url === '/api/web/topics/7/trash') {
        return jsonResponse({
          status: 409,
          body: {
            error: {
              code: 'version_conflict',
              message: 'Topic 已被修改',
              details: { current_version: 9 }
            }
          }
        });
      }
      if (url.startsWith('/api/web/topics')) return jsonResponse({ body: topicsResponse });
      throw new Error(`未处理的请求: ${url}`);
    });

    renderTopicsPage();
    await screen.findByText('算法与数据结构');
    await userEvent.click(screen.getByRole('button', { name: '将 Topic 7 放入回收站' }));

    const dialog = await screen.findByRole('dialog', { name: '放入回收站' });
    await userEvent.click(within(dialog).getByRole('button', { name: '放入回收站' }));

    expect(
      await within(dialog).findByText('Topic 已被其他操作修改，请关闭后重新操作。')
    ).toBeInTheDocument();
    // 不自动重试危险写操作.
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === '/api/web/topics/7/trash')).toHaveLength(1);
  });

  it('回收 not_found 提示 Topic 不存在', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/web/topics/trash-preview') {
        return jsonResponse({ body: { topics: 1, affected_cards: 2, already_trashed: 0 } });
      }
      if (url === '/api/web/topics/7/trash') {
        return jsonResponse({
          status: 404,
          body: { error: { code: 'not_found', message: 'Topic 不存在' } }
        });
      }
      if (url.startsWith('/api/web/topics')) return jsonResponse({ body: topicsResponse });
      throw new Error(`未处理的请求: ${url}`);
    });

    renderTopicsPage();
    await screen.findByText('算法与数据结构');
    await userEvent.click(screen.getByRole('button', { name: '将 Topic 7 放入回收站' }));

    const dialog = await screen.findByRole('dialog', { name: '放入回收站' });
    await userEvent.click(within(dialog).getByRole('button', { name: '放入回收站' }));

    expect(await within(dialog).findByText('Topic 不存在或已在回收站。')).toBeInTheDocument();
  });
});
