import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { todayInTimezone } from '../utils/heatmap';
import { DASHBOARD_QUOTES } from '../features/dashboard/dashboardQuotes';
import { DashboardPage } from './DashboardPage';

/**
 * Dashboard 页面集成测试。
 *
 * 覆盖: 各区域 loading / empty / error / success、局部失败不阻塞其他区域、
 * 真实 total 与 calendar 字段的消费、热力图补零与筛选、文本摘要与可访问名称、
 * 以及 CTA 导航。
 */

interface MockResponse {
  status?: number;
  body: unknown;
}

// 设置返回 UTC, 前端 today 即 UTC 自然日; 测试用同一函数推导期望值。
const TODAY = todayInTimezone('UTC');

const settingsResponse = {
  settings: {
    calendar_timezone: 'UTC',
    stdout_log_level: 'info',
    database_log_enabled: false,
    database_log_level: 'info',
    database_retention_days: 30,
    database_max_rows: 10000
  }
};

const dueResponse = {
  items: [
    {
      card_id: 1,
      front: '问题',
      back: '答案',
      topic_id: null,
      card_version: 1,
      due: '2026-01-01T00:00:00Z',
      state: 'new',
      schedule_version: 1,
      reps: 0,
      lapses: 0
    }
  ],
  total: 28
};

const calendarResponse = {
  days: [{ date: TODAY, created_cards: 3, review_events: 7 }]
};

const cardsResponse = { items: [], total: 412, page: 1, page_size: 1 };
const topicsResponse = { items: [], total: 14, page: 1, page_size: 1 };

const jsonResponse = ({ status = 200, body }: MockResponse): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

const renderDashboard = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false }
    }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/review" element={<div>复习页面</div>} />
          <Route path="/approvals" element={<div>提案页面</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

const mockDashboard = () =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith('/api/web/settings')) return jsonResponse({ body: settingsResponse });
    if (url.startsWith('/api/web/review/due')) return jsonResponse({ body: dueResponse });
    if (url.startsWith('/api/web/calendar')) return jsonResponse({ body: calendarResponse });
    if (url.startsWith('/api/web/cards')) return jsonResponse({ body: cardsResponse });
    if (url.startsWith('/api/web/topics')) return jsonResponse({ body: topicsResponse });
    throw new Error(`未处理的请求: ${url}`);
  });

const heatmapRegion = () => screen.getByRole('region', { name: '学习热力图' });

describe('DashboardPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('展示真实 total 与 calendar 字段, 并含引导句', async () => {
    mockDashboard();
    renderDashboard();

    expect(await screen.findByText('28')).toBeInTheDocument();
    expect(await screen.findByText('7')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('412 张')).toBeInTheDocument();
    expect(screen.getByText('14 个')).toBeInTheDocument();

    // 引导句来自本地固定池, 不请求外部接口。
    expect(DASHBOARD_QUOTES.some((quote) => screen.queryByText(`“${quote}”`) !== null)).toBe(true);
    expect(screen.queryByRole('button', { name: /换一句/ })).not.toBeInTheDocument();
  });

  it('各区域独立 loading', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise<Response>(() => undefined)
    );
    renderDashboard();

    expect(await screen.findByText('正在统计到期数量')).toBeInTheDocument();
    expect(screen.getByText('正在读取复习统计')).toBeInTheDocument();
    expect(screen.getByText('正在读取制卡统计')).toBeInTheDocument();
    expect(screen.getByText('正在加载学习热力图')).toBeInTheDocument();
  });

  it('热力图补零至 366 天并提供可访问名称与文本摘要', async () => {
    mockDashboard();
    renderDashboard();

    const region = await screen.findByRole('region', { name: '学习热力图' });
    await within(region).findByText(/共 7 次复习、新增 3 张卡片。/);

    // 后端只返回今天一天, 前端补齐其余自然日, 共 366 个格子。
    await waitFor(() => expect(region.querySelectorAll('rect')).toHaveLength(366));
    expect(screen.getByRole('img', { name: /共 7 次复习、新增 3 张卡片。/ })).toBeInTheDocument();
  });

  it('热力图筛选只使用真实字段', async () => {
    mockDashboard();
    renderDashboard();

    const region = await screen.findByRole('region', { name: '学习热力图' });
    await within(region).findByText(/共 7 次复习、新增 3 张卡片。/);

    await userEvent.click(within(region).getByRole('button', { name: '仅复习' }));
    expect(within(region).getByText(/共 7 次复习。$/)).toBeInTheDocument();

    await userEvent.click(within(region).getByRole('button', { name: '仅制卡' }));
    expect(within(region).getByText(/共新增 3 张卡片。$/)).toBeInTheDocument();

    await userEvent.click(within(region).getByRole('button', { name: '全部事件' }));
    expect(within(region).getByText(/共 7 次复习、新增 3 张卡片。$/)).toBeInTheDocument();
  });

  it('热力图空数据时给出文本 empty 提示', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/web/settings')) return jsonResponse({ body: settingsResponse });
      if (url.startsWith('/api/web/review/due')) return jsonResponse({ body: { items: [], total: 0 } });
      if (url.startsWith('/api/web/calendar')) return jsonResponse({ body: { days: [] } });
      if (url.startsWith('/api/web/cards')) return jsonResponse({ body: { items: [], total: 0, page: 1, page_size: 1 } });
      if (url.startsWith('/api/web/topics')) return jsonResponse({ body: { items: [], total: 0, page: 1, page_size: 1 } });
      throw new Error(`未处理的请求: ${url}`);
    });
    renderDashboard();

    expect(await screen.findByText('最近一年暂无可统计的复习或制卡事件。')).toBeInTheDocument();
    const region = heatmapRegion();
    expect(region.querySelectorAll('rect')).toHaveLength(366);
  });

  it('局部失败不阻塞其他区域, 且可重试恢复', async () => {
    let dueCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/web/settings')) return jsonResponse({ body: settingsResponse });
      if (url.startsWith('/api/web/review/due')) {
        dueCalls += 1;
        if (dueCalls === 1) {
          return jsonResponse({
            status: 500,
            body: { error: { code: 'internal_error', message: '到期统计不可用' } }
          });
        }
        return jsonResponse({ body: dueResponse });
      }
      if (url.startsWith('/api/web/calendar')) return jsonResponse({ body: calendarResponse });
      if (url.startsWith('/api/web/cards')) return jsonResponse({ body: cardsResponse });
      if (url.startsWith('/api/web/topics')) return jsonResponse({ body: topicsResponse });
      throw new Error(`未处理的请求: ${url}`);
    });
    renderDashboard();

    // 到期区域失败。
    expect(await screen.findByText('到期统计不可用')).toBeInTheDocument();
    // 其他区域仍展示真实数据。
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('412 张')).toBeInTheDocument();
    await within(heatmapRegion()).findByText(/共 7 次复习、新增 3 张卡片。/);

    // 重试后恢复, 且展示完整 total 而非截断队列长度。
    await userEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByText('28')).toBeInTheDocument();
    expect(dueCalls).toBeGreaterThan(1);
  });

  it('大盘与到期卡 CTA 进入 /review, 提案入口进入 /approvals', async () => {
    mockDashboard();
    renderDashboard();
    await screen.findByText('28');

    await userEvent.click(screen.getByRole('button', { name: /开始复习/ }));
    expect(await screen.findByText('复习页面')).toBeInTheDocument();
  });

  it('提案入口进入 /approvals', async () => {
    mockDashboard();
    renderDashboard();
    await screen.findByText('28');

    await userEvent.click(screen.getByRole('button', { name: /查看提案/ }));
    expect(await screen.findByText('提案页面')).toBeInTheDocument();
  });

  it('到期总数查询使用 limit=1', async () => {
    const fetchMock = mockDashboard();
    renderDashboard();
    await screen.findByText('28');

    const dueUrls = fetchMock.mock.calls
      .map(([input]) => String(input))
      .filter((url) => url.startsWith('/api/web/review/due'));
    expect(dueUrls.length).toBeGreaterThan(0);
    dueUrls.forEach((url) => {
      expect(new URL(url, 'http://localhost').searchParams.get('limit')).toBe('1');
    });
  });
});
