import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GlossaryPage } from './GlossaryPage';

interface MockResponse {
  status?: number;
  body: unknown;
}

const glossaryItems = [
  {
    id: 11,
    term: '间隔重复',
    definition: '按**记忆曲线**安排复习时间的方法。',
    version: 2,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-04T06:20:00Z'
  },
  {
    id: 12,
    term: '主动回忆',
    definition: '不看答案主动提取记忆。',
    version: 1,
    created_at: '2026-01-02T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z'
  }
];

const glossaryResponse = {
  items: glossaryItems,
  total: 42,
  page: 1,
  page_size: 20
};

const glossaryDetail = glossaryItems[0];

const jsonResponse = ({ status = 200, body }: MockResponse): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

const renderGlossaryPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false }
    }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <GlossaryPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

const glossaryListRequestURLs = () =>
  vi.mocked(globalThis.fetch).mock.calls
    .map(([input]) => String(input))
    .filter((url: string) => url.startsWith('/api/web/glossary?'));

const lastListRequest = () => {
  const urls = glossaryListRequestURLs();
  return new URL(urls[urls.length - 1] ?? '', 'http://localhost');
};

describe('GlossaryPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('显示列表、数量统计和分页信息', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      jsonResponse({ body: glossaryResponse })
    );
    renderGlossaryPage();

    expect(await screen.findByText('间隔重复')).toBeInTheDocument();
    expect(screen.getByText('主动回忆')).toBeInTheDocument();
    expect(screen.getByText('当前页 2 个，筛选结果共 42 个')).toBeInTheDocument();
    expect(screen.getByText('第 1 / 3 页, 共 42 项')).toBeInTheDocument();
    expect(screen.getAllByText('v2')).toHaveLength(1);
    expect(screen.getAllByText('v1')).toHaveLength(1);
  });

  it('显示空状态', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      jsonResponse({ body: { items: [], total: 0, page: 1, page_size: 20 } })
    );
    renderGlossaryPage();
    expect(await screen.findByText('没有符合条件的术语')).toBeInTheDocument();
  });

  it('显示错误并支持重新加载', async () => {
    let listCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      listCalls += 1;
      if (listCalls === 1) {
        return jsonResponse({
          status: 500,
          body: { error: { code: 'internal_error', message: 'Glossary 服务不可用' } }
        });
      }
      return jsonResponse({ body: glossaryResponse });
    });

    renderGlossaryPage();
    expect(await screen.findByText('术语加载失败')).toBeInTheDocument();
    expect(screen.getByText('Glossary 服务不可用')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '重新尝试' }));
    expect(await screen.findByText('间隔重复')).toBeInTheDocument();
  });

  it('提交搜索和每页数量参数', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      jsonResponse({ body: glossaryResponse })
    );
    renderGlossaryPage();
    await screen.findByText('间隔重复');

    expect(lastListRequest().searchParams.has('q')).toBe(false);

    await userEvent.selectOptions(screen.getByLabelText('每页数量'), '50');
    await waitFor(() => expect(lastListRequest().searchParams.get('page_size')).toBe('50'));

    await userEvent.type(screen.getByRole('searchbox', { name: '搜索术语名称' }), '间隔');
    await waitFor(() => {
      const request = lastListRequest();
      expect(request.searchParams.get('q')).toBe('间隔');
      expect(request.searchParams.get('page')).toBe('1');
      expect(request.searchParams.get('page_size')).toBe('50');
    });
  });

  it('创建术语提交 term 与 definition 并显示成功反馈', async () => {
    const created = {
      id: 30,
      term: '新术语',
      definition: '新术语的**定义**。',
      version: 1,
      created_at: '2026-01-06T00:00:00Z',
      updated_at: '2026-01-06T00:00:00Z'
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === '/api/web/glossary' && init?.method === 'POST') {
        return jsonResponse({ status: 201, body: created });
      }
      return jsonResponse({ body: glossaryResponse });
    });

    renderGlossaryPage();
    await screen.findByText('间隔重复');
    await userEvent.click(screen.getByRole('button', { name: /新建术语/ }));

    const dialog = screen.getByRole('dialog', { name: '新建术语' });
    const termInput = within(dialog).getByLabelText('术语');
    await userEvent.type(termInput, '新术语');
    await userEvent.type(within(dialog).getByLabelText(/定义/), '新术语的**定义**。');
    await userEvent.click(within(dialog).getByRole('button', { name: '创建术语' }));

    expect(await screen.findByText('术语 #30 已创建')).toBeInTheDocument();
    const createCall = fetchMock.mock.calls.find(
      ([input, init]) => String(input) === '/api/web/glossary' && init?.method === 'POST'
    );
    expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
      term: '新术语',
      definition: '新术语的**定义**。'
    });
  });

  it('创建时定义留空被客户端拦截且不发请求', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      jsonResponse({ body: glossaryResponse })
    );
    renderGlossaryPage();
    await screen.findByText('间隔重复');
    await userEvent.click(screen.getByRole('button', { name: /新建术语/ }));

    const dialog = screen.getByRole('dialog', { name: '新建术语' });
    await userEvent.type(within(dialog).getByLabelText('术语'), '只有术语');
    await userEvent.click(within(dialog).getByRole('button', { name: '创建术语' }));

    expect(await within(dialog).findByText('定义不能为空')).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([input, init]) => String(input) === '/api/web/glossary' && init?.method === 'POST')
    ).toHaveLength(0);
  });

  it('name_conflict 保留用户输入', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === '/api/web/glossary' && init?.method === 'POST') {
        return jsonResponse({
          status: 409,
          body: { error: { code: 'name_conflict', message: '同名术语已存在' } }
        });
      }
      return jsonResponse({ body: glossaryResponse });
    });

    renderGlossaryPage();
    await screen.findByText('间隔重复');
    await userEvent.click(screen.getByRole('button', { name: /新建术语/ }));

    const dialog = screen.getByRole('dialog', { name: '新建术语' });
    const termInput = within(dialog).getByLabelText('术语');
    await userEvent.type(termInput, '冲突术语');
    await userEvent.type(within(dialog).getByLabelText(/定义/), '定义内容');
    await userEvent.click(within(dialog).getByRole('button', { name: '创建术语' }));

    expect(await within(dialog).findAllByText('同名术语已存在')).toHaveLength(2);
    expect(termInput).toHaveValue('冲突术语');
  });

  it('编辑提交 expected_version 与变更字段', async () => {
    const updated = { ...glossaryDetail, definition: '更新后的定义。', version: 3 };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === '/api/web/glossary/11' && init?.method === 'PATCH') {
        return jsonResponse({ body: updated });
      }
      if (url === '/api/web/glossary/11') return jsonResponse({ body: glossaryDetail });
      return jsonResponse({ body: glossaryResponse });
    });

    renderGlossaryPage();
    await screen.findByText('间隔重复');
    await userEvent.click(screen.getByRole('button', { name: '编辑术语 11' }));

    const dialog = await screen.findByRole('dialog', { name: '编辑术语' });
    expect(within(dialog).getByLabelText('术语')).toHaveValue('间隔重复');
    expect(within(dialog).getByRole('button', { name: '保存修改' })).toBeDisabled();

    const definitionInput = within(dialog).getByLabelText(/定义/);
    await userEvent.clear(definitionInput);
    await userEvent.type(definitionInput, '更新后的定义。');
    await userEvent.click(within(dialog).getByRole('button', { name: '保存修改' }));

    expect(await screen.findByText('术语 #11 已保存，当前 version 为 3')).toBeInTheDocument();
    const patchCall = fetchMock.mock.calls.find(
      ([input, init]) => String(input) === '/api/web/glossary/11' && init?.method === 'PATCH'
    );
    // 只发送变更字段, 不发送未变化的 term.
    expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({
      expected_version: 2,
      definition: '更新后的定义。'
    });
  });

  it('编辑 version_conflict 显示冲突弹窗并支持重新加载', async () => {
    let detailCalls = 0;
    let patchCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === '/api/web/glossary/11' && init?.method === 'PATCH') {
        patchCalls += 1;
        return jsonResponse({
          status: 409,
          body: {
            error: {
              code: 'version_conflict',
              message: '术语已被修改',
              details: { current_version: 8 }
            }
          }
        });
      }
      if (url === '/api/web/glossary/11') {
        detailCalls += 1;
        return jsonResponse({ body: { ...glossaryDetail, version: 8, term: '服务端新术语' } });
      }
      return jsonResponse({ body: glossaryResponse });
    });

    renderGlossaryPage();
    await screen.findByText('间隔重复');
    await userEvent.click(screen.getByRole('button', { name: '编辑术语 11' }));

    const dialog = await screen.findByRole('dialog', { name: '编辑术语' });
    const termInput = within(dialog).getByLabelText('术语');
    await userEvent.clear(termInput);
    await userEvent.type(termInput, '本地编辑术语');
    await userEvent.click(within(dialog).getByRole('button', { name: '保存修改' }));

    expect(await screen.findByRole('dialog', { name: '术语版本冲突' })).toBeInTheDocument();
    expect(termInput).toHaveValue('本地编辑术语');

    await userEvent.click(screen.getByRole('button', { name: '重新加载最新版本' }));
    await waitFor(() => expect(within(dialog).getByLabelText('术语')).toHaveValue('服务端新术语'));
    expect(detailCalls).toBeGreaterThanOrEqual(2);
    expect(patchCalls).toBe(1);
  });

  it('回收提交 expected_version 并显示成功反馈', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/web/glossary/11/trash') {
        return jsonResponse({ body: { ok: true } });
      }
      return jsonResponse({ body: glossaryResponse });
    });

    renderGlossaryPage();
    await screen.findByText('间隔重复');
    await userEvent.click(screen.getByRole('button', { name: '将术语 11 放入回收站' }));

    const dialog = await screen.findByRole('dialog', { name: '放入回收站' });
    expect(within(dialog).getByText('确定将术语「间隔重复」放入回收站吗？')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: '放入回收站' }));

    expect(await screen.findByText('术语 #11 已放入回收站')).toBeInTheDocument();
    const trashCall = fetchMock.mock.calls.find(([input]) => String(input) === '/api/web/glossary/11/trash');
    expect(JSON.parse(String(trashCall?.[1]?.body))).toEqual({ expected_version: 2 });
  });

  it('回收 version_conflict 显示冲突提示且不自动重试', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/web/glossary/11/trash') {
        return jsonResponse({
          status: 409,
          body: {
            error: {
              code: 'version_conflict',
              message: '术语已被修改, 请重读后重试',
              details: { current_version: 9 }
            }
          }
        });
      }
      return jsonResponse({ body: glossaryResponse });
    });

    renderGlossaryPage();
    await screen.findByText('间隔重复');
    await userEvent.click(screen.getByRole('button', { name: '将术语 11 放入回收站' }));

    const dialog = await screen.findByRole('dialog', { name: '放入回收站' });
    await userEvent.click(within(dialog).getByRole('button', { name: '放入回收站' }));

    expect(
      await within(dialog).findByText('版本冲突: 术语已被修改, 请重读后重试')
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === '/api/web/glossary/11/trash')).toHaveLength(1);
  });

  it('查看详情请求独立详情端点并安全渲染 Markdown 定义', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/web/glossary/11') return jsonResponse({ body: glossaryDetail });
      return jsonResponse({ body: glossaryResponse });
    });

    renderGlossaryPage();
    await screen.findByText('间隔重复');
    await userEvent.click(screen.getByRole('button', { name: '查看术语 11 详情' }));

    const dialog = await screen.findByRole('dialog', { name: '术语详情' });
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input) === '/api/web/glossary/11')
    ).toHaveLength(1);
    // Markdown strong 被安全渲染为语义元素.
    expect(screen.getByText('记忆曲线')).toBeInTheDocument();
    expect(within(dialog).getByText('v2')).toBeInTheDocument();
    expect(within(dialog).getByText('定义')).toBeInTheDocument();
  });
});
