import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApprovalsPage } from './ApprovalsPage';

interface MockResponse {
  status?: number;
  body: unknown;
}

const apiKeysResponse = {
  items: [{ id: 1, name: 'front-dev-seed', api_key: 'ptk_x', created_at: '2026-01-01T00:00:00Z' }],
  total: 1,
  page: 1,
  page_size: 100
};

const approvalItems = [
  {
    id: 1,
    operation: 'glossary_create',
    entity_type: 'glossary',
    status: 'pending',
    requested_by_api_key_id: 1,
    original_payload: { term: 'AI 提议示例术语', definition: '定义内容' },
    approved_payload: null,
    reason: null,
    created_at: '2026-09-21T03:11:10Z',
    processed_at: null
  },
  {
    id: 2,
    operation: 'card_update',
    entity_type: 'card',
    status: 'stale',
    // 该 Key 不在映射表里, 用于验证回退文案。
    requested_by_api_key_id: 99,
    original_payload: { expected_version: 3, front: '被修改的卡片' },
    approved_payload: null,
    reason: 'target_version_changed',
    created_at: '2026-09-20T01:00:00Z',
    processed_at: null
  },
  {
    id: 3,
    operation: 'card_trash',
    entity_type: 'card',
    status: 'approved',
    requested_by_api_key_id: null,
    original_payload: { expected_version: 1 },
    approved_payload: { expected_version: 1 },
    reason: null,
    created_at: '2026-09-19T01:00:00Z',
    processed_at: '2026-09-19T02:00:00Z'
  }
];

const approvalsResponse = {
  items: approvalItems,
  total: 43,
  page: 1,
  page_size: 20
};

// 详情响应: 列表项 + targets, 用于切片 2 断言。
const approvalDetailResponse = {
  ...approvalItems[0],
  original_payload: { term: 'AI 提议示例术语', definition: '定义内容' },
  targets: [
    { entity_type: 'glossary' as const, entity_id: 1, base_version: 2, role: 'target' as const }
  ]
};

const jsonResponse = ({ status = 200, body }: MockResponse): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

const renderApprovalsPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false }
    }
  });
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ApprovalsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...rendered, queryClient };
};

const mockApprovals = (response: MockResponse = { body: approvalsResponse }) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith('/api/web/approvals/')) return jsonResponse({ body: approvalDetailResponse });
    if (url.startsWith('/api/web/approvals')) return jsonResponse(response);
    if (url.startsWith('/api/web/api-keys')) return jsonResponse({ body: apiKeysResponse });
    throw new Error(`未处理的请求: ${url}`);
  });

const approvalRequestURLs = () =>
  vi.mocked(globalThis.fetch).mock.calls
    .map(([input]) => String(input))
    .filter((url: string) => url.startsWith('/api/web/approvals'));

const lastApprovalRequest = () => {
  const urls = approvalRequestURLs();
  return new URL(urls[urls.length - 1] ?? '', 'http://localhost');
};

describe('ApprovalsPage 切片 1: 列表、状态筛选与分页', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('加载中显示 loading 状态', () => {
    mockApprovals();
    renderApprovalsPage();
    expect(screen.getByText('正在加载提案')).toBeInTheDocument();
  });

  it('加载失败显示 error 状态与重新尝试', async () => {
    mockApprovals({ status: 500, body: { error: { code: 'internal_error', message: '内部错误' } } });
    renderApprovalsPage();
    expect(await screen.findByText('提案加载失败')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重新尝试' })).toBeInTheDocument();
  });

  it('空列表显示 empty 状态', async () => {
    mockApprovals({ body: { items: [], total: 0, page: 1, page_size: 20 } });
    renderApprovalsPage();
    expect(await screen.findByText('没有符合条件的提案')).toBeInTheDocument();
  });

  it('成功时按响应渲染 operation / 状态, 不出现置信度或 cancelled', async () => {
    mockApprovals();
    renderApprovalsPage();

    const list = await screen.findByRole('region', { name: '提案列表' });

    expect(within(list).getByText('新建 Glossary')).toBeInTheDocument();
    expect(within(list).getByText('修改 Card')).toBeInTheDocument();
    expect(within(list).getByText('放入回收站 Card')).toBeInTheDocument();

    // 状态徽章只在列表内断言, 避开筛选下拉里的同名选项。
    expect(within(list).getByText('待审批')).toBeInTheDocument();
    expect(within(list).getByText('已失效')).toBeInTheDocument();
    expect(within(list).getByText('已批准')).toBeInTheDocument();

    // 后端没有置信度字段, 页面不得展示。
    expect(screen.queryByText(/置信度/)).not.toBeInTheDocument();
    // 后端不会写入 cancelled, 页面不得展示。
    expect(screen.queryByText(/已取消|cancelled/)).not.toBeInTheDocument();
  });

  it('API Key 名称映射成功, 映射失败时回退为 API Key #<id>', async () => {
    mockApprovals();
    renderApprovalsPage();

    expect(await screen.findByText('front-dev-seed')).toBeInTheDocument();
    expect(screen.getByText('API Key #99')).toBeInTheDocument();
    // 未记录来源时展示中性文案, 不伪造 Key 名。
    expect(screen.getByText('未记录来源')).toBeInTheDocument();
  });

  it('默认请求不带 status, 使用 page/page_size', async () => {
    mockApprovals();
    renderApprovalsPage();
    await screen.findByText('新建 Glossary');

    const url = lastApprovalRequest();
    expect(url.pathname).toBe('/api/web/approvals');
    expect(url.searchParams.get('status')).toBeNull();
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('page_size')).toBe('20');
  });

  it('切换状态筛选时携带 status 并回到第 1 页', async () => {
    const user = userEvent.setup();
    mockApprovals();
    renderApprovalsPage();
    await screen.findByText('新建 Glossary');

    await user.selectOptions(screen.getByLabelText('状态'), 'stale');

    await waitFor(() => {
      const url = lastApprovalRequest();
      expect(url.searchParams.get('status')).toBe('stale');
      expect(url.searchParams.get('page')).toBe('1');
    });
  });

  it('状态下拉不提供 cancelled 选项', async () => {
    mockApprovals();
    renderApprovalsPage();
    await screen.findByText('新建 Glossary');

    const select = screen.getByLabelText('状态');
    const options = within(select).getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['全部状态', '待审批', '已批准', '已拒绝', '已失效']);
  });

  it('切换每页数量时更新 page_size 并回到第 1 页', async () => {
    const user = userEvent.setup();
    mockApprovals();
    renderApprovalsPage();
    await screen.findByText('新建 Glossary');

    await user.selectOptions(screen.getByLabelText('每页数量'), '50');

    await waitFor(() => {
      const url = lastApprovalRequest();
      expect(url.searchParams.get('page_size')).toBe('50');
      expect(url.searchParams.get('page')).toBe('1');
    });
  });

  it('分页显示总数并在下一页时携带 page=2', async () => {
    const user = userEvent.setup();
    mockApprovals();
    renderApprovalsPage();
    await screen.findByText('新建 Glossary');

    expect(screen.getByText('第 1 / 3 页, 共 43 项')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '下一页' }));

    await waitFor(() => {
      expect(lastApprovalRequest().searchParams.get('page')).toBe('2');
    });
  });

  it('切片 1: 表头列数与数据行单元格数一致 (防止图标落入隐式行)', async () => {
    mockApprovals();
    renderApprovalsPage();
    const list = await screen.findByRole('region', { name: '提案列表' });

    const header = within(list).getByText('操作 / 内容').parentElement;
    const row = list.querySelector('article');
    expect(header).not.toBeNull();
    expect(row).not.toBeNull();
    // 表头单元格不得使用 sr-only: 它是 position:absolute, 会被移出 grid 自动排布,
    // 导致后面的标签整体左移一格, 与数据列错位。
    const headerCells = Array.from(header?.children ?? []) as HTMLElement[];
    expect(headerCells.some((cell) => cell.className.includes('sr-only'))).toBe(false);
    // 两者单元格数必须相等, 否则多出的单元格会被挤到隐式行, 与表头错列。
    expect(row?.childElementCount).toBe(header?.childElementCount);
    // 最宽断点的网格轨道数必须等于单元格数 (较窄断点会隐藏两列, 轨道相应更少)。
    const templates = (header?.className ?? '').match(/grid-cols-\[([^\]]+)\]/g) ?? [];
    const trackCounts = templates.map((t) => /\[([^\]]+)\]/.exec(t)?.[1].split('_').length ?? 0);
    expect(Math.max(...trackCounts)).toBe(row?.childElementCount);
  });

  it('只有 pending 提案可被勾选', async () => {
    mockApprovals();
    renderApprovalsPage();
    await screen.findByText('新建 Glossary');

    expect(screen.getByLabelText('选择提案 1')).toBeEnabled();
    expect(screen.getByLabelText('选择提案 2')).toBeDisabled();
    expect(screen.getByLabelText('选择提案 3')).toBeDisabled();
  });

  it('切片 2: 点击详情展示 payload、targets 与来源, 字段严格来自响应', async () => {
    const user = userEvent.setup();
    mockApprovals();
    renderApprovalsPage();
    await screen.findByRole('region', { name: '提案列表' });

    await user.click(screen.getByRole('button', { name: '查看提案 1 详情' }));

    const dialog = await screen.findByRole('dialog', { name: '提案详情' });
    await within(dialog).findByText('AI 提议示例术语');
    expect(within(dialog).getByText('定义内容')).toBeInTheDocument();
    // targets 严格来自响应。
    expect(within(dialog).getByText('Glossary #1')).toBeInTheDocument();
    expect(within(dialog).getByText('主对象')).toBeInTheDocument();
    expect(within(dialog).getByText('base_version v2')).toBeInTheDocument();
    // 来源 API Key 名称来自映射。
    expect(within(dialog).getByText('front-dev-seed')).toBeInTheDocument();
    // 无 approved_payload 时不出现生效 payload 区块。
    expect(within(dialog).queryByText(/生效 payload/)).not.toBeInTheDocument();
    // 不展示后端不存在的字段。
    expect(within(dialog).queryByText(/置信度|Agent/)).not.toBeInTheDocument();
  });

  it('切片 3: 未修改时批准发送空对象 {}, 不发送真正空 body', async () => {
    const user = userEvent.setup();
    mockApprovals();
    renderApprovalsPage();
    await screen.findByRole('region', { name: '提案列表' });

    await user.click(screen.getByRole('button', { name: '批准提案 1' }));
    const dialog = await screen.findByRole('dialog', { name: '批准提案' });
    await within(dialog).findByLabelText('术语');

    await user.click(within(dialog).getByRole('button', { name: '确认批准' }));

    await waitFor(() => {
      const call = vi
        .mocked(globalThis.fetch)
        .mock.calls.find(([input]) => String(input).endsWith('/approvals/1/approve'));
      expect(call).toBeDefined();
      const init = call?.[1] as RequestInit;
      expect(init.method).toBe('POST');
      expect(init.body).toBe('{}');
    });
  });

  it('切片 3: 修改 payload 后批准提交可编辑字段', async () => {
    const user = userEvent.setup();
    mockApprovals();
    renderApprovalsPage();
    await screen.findByRole('region', { name: '提案列表' });

    await user.click(screen.getByRole('button', { name: '批准提案 1' }));
    const dialog = await screen.findByRole('dialog', { name: '批准提案' });
    const termInput = await within(dialog).findByLabelText('术语');

    await user.clear(termInput);
    await user.type(termInput, '审批后修改的术语');
    await user.click(within(dialog).getByRole('button', { name: '确认批准' }));

    await waitFor(() => {
      const call = vi
        .mocked(globalThis.fetch)
        .mock.calls.find(([input]) => String(input).endsWith('/approvals/1/approve'));
      const body = JSON.parse((call?.[1] as RequestInit).body as string) as { payload?: Record<string, unknown> };
      expect(body.payload?.term).toBe('审批后修改的术语');
      // definition 未改动, 仍应保留。
      expect(body.payload?.definition).toBe('定义内容');
    });
  });

  it('切片 3: 拒绝时携带 reason', async () => {
    const user = userEvent.setup();
    mockApprovals();
    renderApprovalsPage();
    await screen.findByRole('region', { name: '提案列表' });

    await user.click(screen.getByRole('button', { name: '拒绝提案 1' }));
    const dialog = await screen.findByRole('dialog', { name: '拒绝提案' });
    await user.type(await within(dialog).findByLabelText('拒绝原因（可选）'), '内容重复');
    await user.click(within(dialog).getByRole('button', { name: '确认拒绝' }));

    await waitFor(() => {
      const call = vi
        .mocked(globalThis.fetch)
        .mock.calls.find(([input]) => String(input).endsWith('/approvals/1/reject'));
      expect(JSON.parse((call?.[1] as RequestInit).body as string)).toEqual({ reason: '内容重复' });
    });
  });

  it('切片 3: 提交期间禁用并防止重复提交', async () => {
    const user = userEvent.setup();
    let resolveApprove: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      resolveApprove = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/approvals/1/approve')) {
        await pending;
        return jsonResponse({ body: { ...approvalDetailResponse, status: 'approved' } });
      }
      if (url.startsWith('/api/web/approvals/')) return jsonResponse({ body: approvalDetailResponse });
      if (url.startsWith('/api/web/approvals')) return jsonResponse({ body: approvalsResponse });
      if (url.startsWith('/api/web/api-keys')) return jsonResponse({ body: apiKeysResponse });
      throw new Error(`未处理的请求: ${url}`);
    });

    renderApprovalsPage();
    await screen.findByRole('region', { name: '提案列表' });
    await user.click(screen.getByRole('button', { name: '批准提案 1' }));
    const dialog = await screen.findByRole('dialog', { name: '批准提案' });
    const confirm = await within(dialog).findByRole('button', { name: '确认批准' });

    await user.click(confirm);
    await user.click(confirm);

    expect(confirm).toBeDisabled();
    const approveCalls = vi
      .mocked(globalThis.fetch)
      .mock.calls.filter(([input]) => String(input).endsWith('/approvals/1/approve'));
    expect(approveCalls).toHaveLength(1);

    resolveApprove?.();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '批准提案' })).not.toBeInTheDocument());
  });

  it('切片 3: 批准遇到 422 approval_not_pending 显示专门提示', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/approvals/1/approve')) {
        return jsonResponse({
          status: 422,
          body: { error: { code: 'approval_not_pending', message: '审批请求已处理', details: { status: 'approved' } } }
        });
      }
      if (url.startsWith('/api/web/approvals/')) return jsonResponse({ body: approvalDetailResponse });
      if (url.startsWith('/api/web/approvals')) return jsonResponse({ body: approvalsResponse });
      if (url.startsWith('/api/web/api-keys')) return jsonResponse({ body: apiKeysResponse });
      throw new Error(`未处理的请求: ${url}`);
    });

    renderApprovalsPage();
    await screen.findByRole('region', { name: '提案列表' });
    await user.click(screen.getByRole('button', { name: '批准提案 1' }));
    const dialog = await screen.findByRole('dialog', { name: '批准提案' });
    await user.click(await within(dialog).findByRole('button', { name: '确认批准' }));

    expect(await within(dialog).findByText('该提案已被处理, 请刷新列表查看最新状态。')).toBeInTheDocument();
  });

  it('切片 4: 批量批准发送 ids 并逐项展示成功/已失效/失败', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/approvals/batch-approve')) {
        return jsonResponse({
          body: {
            results: [
              { id: 1, success: true },
              { id: 4, success: false, error: { code: 'stale', message: 'target_version_changed' } },
              { id: 5, success: false, error: { code: 'approval_not_pending', message: '审批请求已处理' } }
            ]
          }
        });
      }
      if (url.startsWith('/api/web/approvals/')) return jsonResponse({ body: approvalDetailResponse });
      if (url.startsWith('/api/web/approvals')) return jsonResponse({ body: approvalsResponse });
      if (url.startsWith('/api/web/api-keys')) return jsonResponse({ body: apiKeysResponse });
      void init;
      throw new Error(`未处理的请求: ${url}`);
    });

    renderApprovalsPage();
    await screen.findByRole('region', { name: '提案列表' });
    await user.click(screen.getByLabelText('选择提案 1'));
    await user.click(screen.getByRole('button', { name: '批量批准' }));

    await waitFor(() => {
      const call = vi
        .mocked(globalThis.fetch)
        .mock.calls.find(([input]) => String(input).endsWith('/approvals/batch-approve'));
      expect(JSON.parse((call?.[1] as RequestInit).body as string)).toEqual({ ids: [1] });
    });

    const dialog = await screen.findByRole('dialog', { name: '批量批准结果' });
    expect(within(dialog).getByText('成功')).toBeInTheDocument();
    expect(within(dialog).getByText('已失效')).toBeInTheDocument();
    expect(within(dialog).getByText('失败')).toBeInTheDocument();
    expect(within(dialog).getByText(/目标已变化/)).toBeInTheDocument();
    expect(within(dialog).getByText(/该提案已被处理/)).toBeInTheDocument();
    expect(within(dialog).getByText(/\(stale\)/)).toBeInTheDocument();
    expect(within(dialog).getByText(/\(approval_not_pending\)/)).toBeInTheDocument();
  });

  it('切片 4: 批量拒绝携带 ids 与 reason', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/approvals/batch-reject')) {
        return jsonResponse({ body: { results: [{ id: 1, success: true }] } });
      }
      if (url.startsWith('/api/web/approvals/')) return jsonResponse({ body: approvalDetailResponse });
      if (url.startsWith('/api/web/approvals')) return jsonResponse({ body: approvalsResponse });
      if (url.startsWith('/api/web/api-keys')) return jsonResponse({ body: apiKeysResponse });
      throw new Error(`未处理的请求: ${url}`);
    });

    renderApprovalsPage();
    await screen.findByRole('region', { name: '提案列表' });
    await user.click(screen.getByLabelText('选择提案 1'));
    await user.click(screen.getByRole('button', { name: '批量拒绝' }));

    await waitFor(() => {
      const call = vi
        .mocked(globalThis.fetch)
        .mock.calls.find(([input]) => String(input).endsWith('/approvals/batch-reject'));
      expect(JSON.parse((call?.[1] as RequestInit).body as string)).toEqual({ ids: [1], reason: '' });
    });
    expect(await screen.findByRole('dialog', { name: '批量拒绝结果' })).toBeInTheDocument();
  });

  it('切片 3/4: 操作成功后失效审批列表缓存并重新请求', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/approvals/1/reject')) {
        return jsonResponse({ body: { ...approvalDetailResponse, status: 'rejected', reason: null } });
      }
      if (url.startsWith('/api/web/approvals/')) return jsonResponse({ body: approvalDetailResponse });
      if (url.startsWith('/api/web/approvals')) return jsonResponse({ body: approvalsResponse });
      if (url.startsWith('/api/web/api-keys')) return jsonResponse({ body: apiKeysResponse });
      throw new Error(`未处理的请求: ${url}`);
    });

    renderApprovalsPage();
    await screen.findByRole('region', { name: '提案列表' });
    const listCallsBefore = vi
      .mocked(globalThis.fetch)
      .mock.calls.filter(([input]) => String(input).startsWith('/api/web/approvals?')).length;

    await user.click(screen.getByRole('button', { name: '拒绝提案 1' }));
    const dialog = await screen.findByRole('dialog', { name: '拒绝提案' });
    await user.click(await within(dialog).findByRole('button', { name: '确认拒绝' }));

    await waitFor(() => {
      const listCallsAfter = vi
        .mocked(globalThis.fetch)
        .mock.calls.filter(([input]) => String(input).startsWith('/api/web/approvals?')).length;
      expect(listCallsAfter).toBeGreaterThan(listCallsBefore);
    });
  });

  it('切片 4: 批量提交期间禁用批量按钮', async () => {
    const user = userEvent.setup();
    let resolveBatch: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      resolveBatch = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/approvals/batch-approve')) {
        await pending;
        return jsonResponse({ body: { results: [{ id: 1, success: true }] } });
      }
      if (url.startsWith('/api/web/approvals/')) return jsonResponse({ body: approvalDetailResponse });
      if (url.startsWith('/api/web/approvals')) return jsonResponse({ body: approvalsResponse });
      if (url.startsWith('/api/web/api-keys')) return jsonResponse({ body: apiKeysResponse });
      throw new Error(`未处理的请求: ${url}`);
    });

    renderApprovalsPage();
    await screen.findByRole('region', { name: '提案列表' });
    await user.click(screen.getByLabelText('选择提案 1'));
    const approveButton = screen.getByRole('button', { name: '批量批准' });
    await user.click(approveButton);

    expect(approveButton).toBeDisabled();

    resolveBatch?.();
    await screen.findByRole('dialog', { name: '批量批准结果' });
  });

  it('切片 2: stale 显示“已失效”并把机器码 reason 翻译为中文', async () => {
    const staleDetail = {
      ...approvalItems[1],
      targets: [],
      reason: 'target_version_changed'
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/web/approvals/')) return jsonResponse({ body: staleDetail });
      if (url.startsWith('/api/web/approvals')) return jsonResponse({ body: approvalsResponse });
      if (url.startsWith('/api/web/api-keys')) return jsonResponse({ body: apiKeysResponse });
      throw new Error(`未处理的请求: ${url}`);
    });
    const user = userEvent.setup();
    renderApprovalsPage();
    await screen.findByRole('region', { name: '提案列表' });

    await user.click(screen.getByRole('button', { name: '查看提案 2 详情' }));

    const dialog = await screen.findByRole('dialog', { name: '提案详情' });
    expect(await within(dialog).findByText('目标对象在待审批期间被修改')).toBeInTheDocument();
    expect(within(dialog).getByText(/原始 reason: target_version_changed/)).toBeInTheDocument();
  });
});
