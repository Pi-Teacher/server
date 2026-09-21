import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { AuthProvider } from '../../auth/AuthProvider';

interface MockResponse {
  status?: number;
  body: unknown;
}

const jsonResponse = ({ status = 200, body }: MockResponse): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

const generalSettingsFixture = {
  enable_cli_card_create_approval: true,
  enable_cli_card_update_approval: true,
  enable_cli_card_trash_approval: true,
  enable_cli_card_restore_approval: true,
  enable_cli_card_merge_approval: true,
  enable_cli_topic_create_approval: true,
  enable_cli_topic_update_approval: true,
  enable_cli_topic_trash_approval: true,
  enable_cli_topic_restore_approval: true,
  enable_cli_glossary_create_approval: true,
  enable_cli_glossary_update_approval: true,
  enable_cli_glossary_trash_approval: true,
  enable_cli_glossary_restore_approval: true,
  calendar_timezone: 'UTC',
  stdout_log_level: 'info',
  database_log_enabled: false,
  database_log_level: 'info',
  database_retention_days: 30,
  database_max_rows: 10000
};

const embeddingConfigFixture = {
  base_url: '',
  api_key: '',
  model: '',
  dimensions: 768,
  timeout_seconds: 30,
  worker_batch_size: 100,
  similarity_min_ready_percent: 90
};

const embeddingStatusFixture = {
  rebuilding: false,
  similarity_enabled: false,
  coverage: {
    total_enabled: 0,
    ready: 0,
    pending: 0,
    processing: 0,
    failed: 0,
    ready_percent: 100
  }
};

const emptyLogsResponse = { items: [], total: 0, page: 1, page_size: 20 };

const apiKeysResponse = {
  items: [
    {
      id: 1,
      name: 'front-dev-seed',
      api_key: 'ptk_5LI8jin-ngxjgXozQ5O9jw2kDB5PeOg6DF4wzYduDT8',
      created_at: '2026-09-21T03:11:10Z'
    }
  ],
  total: 1,
  page: 1,
  page_size: 20
};

type MockOverride = (init?: RequestInit) => Response | Promise<Response>;

type MockRoutes =
  | 'settings'
  | 'embedding-config'
  | 'embedding-status'
  | 'embedding-test'
  | 'api-keys'
  | 'logs'
  | 'session'
  | 'password';

/** 提供 App 各只读路由的默认响应, 可逐路由覆盖。 */
const installSettingsMock = (overrides: Partial<Record<MockRoutes, MockOverride>> = {}) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === '/api/web/auth/session') {
      if (overrides.session) return overrides.session(init);
      return jsonResponse({
        body: { csrf_token: 'csrf-test', expires_at: '2030-01-01T00:00:00Z' }
      });
    }
    if (url === '/api/web/auth/password') {
      if (overrides.password) return overrides.password(init);
      return jsonResponse({ body: { ok: true } });
    }
    if (url.startsWith('/api/web/logs')) {
      if (overrides.logs) return overrides.logs(init);
      return jsonResponse({ body: emptyLogsResponse });
    }
    if (url.startsWith('/api/web/api-keys')) {
      if (overrides['api-keys']) return overrides['api-keys'](init);
      return jsonResponse({ body: apiKeysResponse });
    }
    if (url === '/api/web/settings') {
      if (overrides.settings) return overrides.settings(init);
      return jsonResponse({ body: { settings: generalSettingsFixture } });
    }
    if (url === '/api/web/embedding/config') {
      if (overrides['embedding-config']) return overrides['embedding-config'](init);
      return jsonResponse({ body: { config: embeddingConfigFixture } });
    }
    if (url === '/api/web/embedding/status') {
      if (overrides['embedding-status']) return overrides['embedding-status'](init);
      return jsonResponse({ body: embeddingStatusFixture });
    }
    if (url === '/api/web/embedding/test') {
      if (overrides['embedding-test']) return overrides['embedding-test'](init);
      return jsonResponse({ body: { ok: true, dimensions: 768 } });
    }
    if (url === '/api/web/embedding/rebuild') {
      return jsonResponse({ status: 202, body: { status: 'rebuilding' } });
    }
    if (url === '/api/web/embedding/retry-failed') {
      return jsonResponse({ status: 202, body: { status: 'accepted' } });
    }
    return jsonResponse({ status: 404, body: { error: { code: 'not_found', message: 'unknown' } } });
  });

/** 在给定路径渲染整个 App, 用于验证二级导航与各设置子页。 */
const renderAt = (path: string) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false }
    }
  });
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...rendered, queryClient };
};

const settingsPatchCalls = () =>
  vi
    .mocked(globalThis.fetch)
    .mock.calls.filter(([input, init]) => String(input) === '/api/web/settings' && init?.method === 'PATCH');

const embeddingPatchCalls = () =>
  vi.mocked(globalThis.fetch).mock.calls.filter(
    ([input, init]) => String(input) === '/api/web/embedding/config' && init?.method === 'PATCH'
  );

describe('系统设置二级导航', () => {
  afterEach(() => vi.restoreAllMocks());

  it('访问 /settings 默认重定向到通用页, 并渲染 4 个标签', async () => {
    installSettingsMock();
    renderAt('/settings');

    expect(await screen.findByRole('heading', { name: '系统设置' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: '设置分区' });
    ['通用', 'Embedding', 'API Key', '修改密码'].forEach((label) => {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument();
    });
    // 日志已移到独立侧栏入口, 不再作为设置标签。
    expect(within(nav).queryByRole('link', { name: '日志' })).not.toBeInTheDocument();
    expect(await screen.findByLabelText(/日历时区/)).toBeInTheDocument();
  });

  it('点击标签切换到对应子页', async () => {
    installSettingsMock();
    renderAt('/settings/general');

    await screen.findByLabelText(/日历时区/);
    await userEvent.click(screen.getByRole('link', { name: 'API Key' }));

    expect(await screen.findByText('front-dev-seed')).toBeInTheDocument();
  });
});

describe('系统设置 - 通用页', () => {
  afterEach(() => vi.restoreAllMocks());

  it('显示加载状态, 成功后渲染时区、标准输出级别与数据库日志配置', async () => {
    let resolveSettings: ((value: Response) => void) | undefined;
    installSettingsMock({
      settings: () =>
        new Promise<Response>((resolve) => {
          resolveSettings = resolve;
        })
    });

    renderAt('/settings/general');
    expect(await screen.findByText('正在加载通用设置')).toBeInTheDocument();

    resolveSettings?.(jsonResponse({ body: { settings: generalSettingsFixture } }));

    expect(await screen.findByLabelText(/日历时区/)).toHaveValue('UTC');
    // 数据库日志配置已并入通用页; 审批开关仍在独立页面。
    expect(screen.getByLabelText(/日志保留天数/)).toHaveValue(30);
    expect(screen.getByRole('switch', { name: '写入数据库日志' })).toBeInTheDocument();
    expect(screen.getAllByRole('switch')).toHaveLength(1);
  });

  it('GET 失败显示错误状态并支持重新加载', async () => {
    let calls = 0;
    installSettingsMock({
      settings: () => {
        calls += 1;
        if (calls === 1) {
          return jsonResponse({
            status: 500,
            body: { error: { code: 'internal_error', message: '设置服务未启用' } }
          });
        }
        return jsonResponse({ body: { settings: { ...generalSettingsFixture, calendar_timezone: 'Asia/Shanghai' } } });
      }
    });

    renderAt('/settings/general');
    expect(await screen.findByText('通用设置加载失败')).toBeInTheDocument();
    expect(screen.getByText('设置服务未启用')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '重新尝试' }));
    expect(await screen.findByLabelText(/日历时区/)).toHaveValue('Asia/Shanghai');
  });

  it('无修改时保存禁用; PATCH 只包含被改动的字段', async () => {
    installSettingsMock({
      settings: (init) => {
        if (init?.method === 'PATCH') {
          const body = JSON.parse(String(init.body)) as Record<string, unknown>;
          return jsonResponse({ body: { settings: { ...generalSettingsFixture, ...body } } });
        }
        return jsonResponse({ body: { settings: generalSettingsFixture } });
      }
    });

    renderAt('/settings/general');
    const saveButton = await screen.findByRole('button', { name: '保存通用设置' });
    expect(saveButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/日历时区/), { target: { value: 'Asia/Shanghai' } });
    expect(saveButton).toBeEnabled();
    await userEvent.click(saveButton);

    await waitFor(() => expect(settingsPatchCalls()).toHaveLength(1));
    expect(JSON.parse(String(settingsPatchCalls()[0]?.[1]?.body))).toEqual({
      calendar_timezone: 'Asia/Shanghai'
    });
    expect(await screen.findByText('通用设置已保存')).toBeInTheDocument();
  });

  it('通用页同时负责日志配置: PATCH 只包含被改动的日志字段', async () => {
    installSettingsMock({
      settings: (init) => {
        if (init?.method === 'PATCH') {
          const body = JSON.parse(String(init.body)) as Record<string, unknown>;
          return jsonResponse({ body: { settings: { ...generalSettingsFixture, ...body } } });
        }
        return jsonResponse({ body: { settings: generalSettingsFixture } });
      }
    });

    renderAt('/settings/general');
    const saveButton = await screen.findByRole('button', { name: '保存通用设置' });
    expect(saveButton).toBeDisabled();

    // 开启数据库日志并改保留天数。
    await userEvent.click(screen.getByRole('switch', { name: '写入数据库日志' }));
    fireEvent.change(screen.getByLabelText(/日志保留天数/), { target: { value: '60' } });
    await userEvent.click(saveButton);

    await waitFor(() => expect(settingsPatchCalls()).toHaveLength(1));
    // 不应把时区/审批开关等未改动字段带进请求体。
    expect(JSON.parse(String(settingsPatchCalls()[0]?.[1]?.body))).toEqual({
      database_log_enabled: true,
      database_retention_days: 60
    });
  });

  it('保留天数非正整数时前端拦截, 不发送请求', async () => {
    installSettingsMock();

    renderAt('/settings/general');
    fireEvent.change(await screen.findByLabelText(/日志保留天数/), { target: { value: '0' } });
    expect(await screen.findByText('日志保留天数与最大行数必须是正整数')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存通用设置' })).toBeDisabled();
    expect(settingsPatchCalls()).toHaveLength(0);
  });

  it('validation_error 使用 details.field 展示定位信息', async () => {
    installSettingsMock({
      settings: (init) =>
        init?.method === 'PATCH'
          ? jsonResponse({
              status: 400,
              body: {
                error: {
                  code: 'validation_error',
                  message: 'calendar_timezone 值无效',
                  details: { field: 'calendar_timezone' }
                }
              }
            })
          : jsonResponse({ body: { settings: generalSettingsFixture } })
    });

    renderAt('/settings/general');
    fireEvent.change(await screen.findByLabelText(/日历时区/), { target: { value: 'Not/AZone' } });
    await userEvent.click(screen.getByRole('button', { name: '保存通用设置' }));

    expect(await screen.findByText(/字段 calendar_timezone 校验失败/)).toBeInTheDocument();
  });
});

describe('审批开关控制页', () => {
  afterEach(() => vi.restoreAllMocks());

  it('渲染 13 个 CLI 审批开关并按分组展示', async () => {
    installSettingsMock();
    renderAt('/approval-switches');

    await screen.findByRole('switch', { name: 'CLI 新建 Card 需要审批' });
    expect(screen.getAllByRole('switch')).toHaveLength(13);
    expect(screen.getByText('Glossary')).toBeInTheDocument();
  });

  it('修改后提交的 PATCH 只包含被改动的开关', async () => {
    installSettingsMock({
      settings: (init) =>
        init?.method === 'PATCH'
          ? jsonResponse({ body: { settings: { ...generalSettingsFixture, enable_cli_card_merge_approval: false } } })
          : jsonResponse({ body: { settings: generalSettingsFixture } })
    });

    renderAt('/approval-switches');
    const saveButton = await screen.findByRole('button', { name: '保存审批开关' });
    expect(saveButton).toBeDisabled();

    await userEvent.click(screen.getByRole('switch', { name: 'CLI 合并 Card 需要审批' }));
    await userEvent.click(saveButton);

    await waitFor(() => expect(settingsPatchCalls()).toHaveLength(1));
    expect(JSON.parse(String(settingsPatchCalls()[0]?.[1]?.body))).toEqual({
      enable_cli_card_merge_approval: false
    });
    expect(await screen.findByText('审批开关已保存')).toBeInTheDocument();
  });

  it('提交期间禁用开关并防止重复提交', async () => {
    let resolvePatch: ((value: Response) => void) | undefined;
    installSettingsMock({
      settings: (init) => {
        if (init?.method === 'PATCH') {
          return new Promise<Response>((resolve) => {
            resolvePatch = resolve;
          });
        }
        return jsonResponse({ body: { settings: generalSettingsFixture } });
      }
    });

    renderAt('/approval-switches');
    const toggle = await screen.findByRole('switch', { name: 'CLI 新建 Card 需要审批' });
    await userEvent.click(toggle);
    const saveButton = screen.getByRole('button', { name: '保存审批开关' });
    await userEvent.click(saveButton);
    await userEvent.click(saveButton);

    await waitFor(() => expect(settingsPatchCalls()).toHaveLength(1));
    expect(saveButton).toBeDisabled();
    expect(toggle).toBeDisabled();

    resolvePatch?.(
      jsonResponse({ body: { settings: { ...generalSettingsFixture, enable_cli_card_create_approval: false } } })
    );
    expect(await screen.findByText('审批开关已保存')).toBeInTheDocument();
  });
});

describe('系统设置 - Embedding 页', () => {
  afterEach(() => vi.restoreAllMocks());

  it('rebuilding 为 true 时禁用配置保存、重建与重试按钮', async () => {
    installSettingsMock({
      'embedding-status': () =>
        jsonResponse({
          body: {
            ...embeddingStatusFixture,
            rebuilding: true,
            coverage: { ...embeddingStatusFixture.coverage, pending: 5 }
          }
        })
    });

    renderAt('/settings/embedding');
    expect(await screen.findByText(/Embedding 正在重建/)).toBeInTheDocument();

    expect(screen.getByRole('button', { name: '保存 Embedding 配置' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '重建全部向量' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '重试失败项' })).toBeDisabled();
  });

  it('PATCH 只提交被修改的配置字段, 并提示存量向量不会自动重建', async () => {
    installSettingsMock();

    renderAt('/settings/embedding');
    fireEvent.change(await screen.findByLabelText(/模型名/), { target: { value: 'text-embedding-3-small' } });
    await userEvent.click(screen.getByRole('button', { name: '保存 Embedding 配置' }));

    await waitFor(() => expect(embeddingPatchCalls()).toHaveLength(1));
    expect(JSON.parse(String(embeddingPatchCalls()[0]?.[1]?.body))).toEqual({
      model: 'text-embedding-3-small'
    });
    expect(await screen.findByText(/存量向量不会自动重建/)).toBeInTheDocument();
  });

  it('/embedding/test 返回 ok=false 时按业务失败展示, 不当作 HTTP 错误', async () => {
    installSettingsMock({
      'embedding-test': () => jsonResponse({ body: { ok: false, error: 'connection refused' } })
    });

    renderAt('/settings/embedding');
    await userEvent.click(await screen.findByRole('button', { name: '测试连接' }));

    expect(await screen.findByText(/连接失败：connection refused/)).toBeInTheDocument();
    expect(screen.queryByText('Embedding 配置加载失败')).not.toBeInTheDocument();
  });

  it('/embedding/test 返回 ok=true 时展示实际维度', async () => {
    installSettingsMock({ 'embedding-test': () => jsonResponse({ body: { ok: true, dimensions: 1024 } }) });

    renderAt('/settings/embedding');
    await userEvent.click(await screen.findByRole('button', { name: '测试连接' }));

    expect(await screen.findByText(/连接成功，返回向量维度 1024/)).toBeInTheDocument();
  });

  it('重建需二次确认, 确认后调用 rebuild 并反馈成功', async () => {
    installSettingsMock();

    renderAt('/settings/embedding');
    await userEvent.click(await screen.findByRole('button', { name: '重建全部向量' }));
    const dialog = screen.getByRole('dialog', { name: '重建全部向量' });
    await userEvent.click(within(dialog).getByRole('button', { name: '开始重建' }));

    await waitFor(() =>
      expect(
        vi.mocked(globalThis.fetch).mock.calls.some(([input]) => String(input) === '/api/web/embedding/rebuild')
      ).toBe(true)
    );
    expect(await screen.findByText(/已触发完整重建/)).toBeInTheDocument();
  });

  it('PATCH 返回 409 rebuilding 时给出专用提示', async () => {
    installSettingsMock({
      'embedding-config': (init) =>
        init?.method === 'PATCH'
          ? jsonResponse({ status: 409, body: { error: { code: 'rebuilding', message: '正在重建' } } })
          : jsonResponse({ body: { config: embeddingConfigFixture } })
    });

    renderAt('/settings/embedding');
    fireEvent.change(await screen.findByLabelText(/模型名/), { target: { value: 'x' } });
    await userEvent.click(screen.getByRole('button', { name: '保存 Embedding 配置' }));

    expect(await screen.findByText(/Embedding 正在重建，暂时不能修改配置或触发重建/)).toBeInTheDocument();
  });
});

describe('系统设置 - API Key 页', () => {
  afterEach(() => vi.restoreAllMocks());

  it('列表展示 name/api_key/created_at, 完整 Key 直接以明文展示', async () => {
    installSettingsMock();

    renderAt('/settings/api-keys');
    await screen.findByText('front-dev-seed');

    // 后端明文返回, 直接展示完整 Key, 不再有显示/隐藏按钮。
    expect(screen.getByText(/ptk_5LI8jin-ngxjgXozQ5O9jw2kDB5PeOg6DF4wzYduDT8/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /显示|隐藏/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/最后使用/)).not.toBeInTheDocument();
  });

  it('列表为空时显示空状态', async () => {
    installSettingsMock({
      'api-keys': () => jsonResponse({ body: { items: [], total: 0, page: 1, page_size: 20 } })
    });

    renderAt('/settings/api-keys');
    expect(await screen.findByText('还没有 API Key')).toBeInTheDocument();
  });

  it('创建 API Key 发送 {name}, 成功后清空输入并给出反馈', async () => {
    installSettingsMock({
      'api-keys': (init) => {
        if (init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { name: string };
          return jsonResponse({
            status: 201,
            body: { id: 2, name: body.name, api_key: 'ptk_newkey', created_at: '2026-09-21T04:00:00Z' }
          });
        }
        return jsonResponse({ body: apiKeysResponse });
      }
    });

    renderAt('/settings/api-keys');
    const input = await screen.findByLabelText(/新建 API Key 名称/);
    await userEvent.type(input, '  my-agent  ');
    await userEvent.click(screen.getByRole('button', { name: '创建 API Key' }));

    await waitFor(() => {
      const post = vi
        .mocked(globalThis.fetch)
        .mock.calls.find(([input_, init]) => String(input_).startsWith('/api/web/api-keys') && init?.method === 'POST');
      expect(post).toBeDefined();
      expect(JSON.parse(String(post?.[1]?.body))).toEqual({ name: 'my-agent' });
    });
    expect(await screen.findByText(/API Key「my-agent」已创建/)).toBeInTheDocument();
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('创建名称为空时不发请求, 展示本地校验错误', async () => {
    installSettingsMock();

    renderAt('/settings/api-keys');
    await screen.findByText('front-dev-seed');
    await userEvent.click(screen.getByRole('button', { name: '创建 API Key' }));

    expect(await screen.findByText('名称不能为空')).toBeInTheDocument();
    expect(
      vi
        .mocked(globalThis.fetch)
        .mock.calls.some(([input_, init]) => String(input_).startsWith('/api/web/api-keys') && init?.method === 'POST')
    ).toBe(false);
  });

  it('删除需二次确认, 确认后调用 DELETE 并给出反馈', async () => {
    installSettingsMock({
      'api-keys': (init) => {
        if (init?.method === 'DELETE') return jsonResponse({ body: { ok: true } });
        return jsonResponse({ body: apiKeysResponse });
      }
    });

    renderAt('/settings/api-keys');
    await screen.findByText('front-dev-seed');
    await userEvent.click(screen.getByRole('button', { name: '删除' }));
    const dialog = screen.getByRole('dialog', { name: '删除 API Key' });

    await userEvent.click(within(dialog).getByRole('button', { name: '删除' }));
    await waitFor(() => {
      const del = vi
        .mocked(globalThis.fetch)
        .mock.calls.find(([input_, init]) => String(input_) === '/api/web/api-keys/1' && init?.method === 'DELETE');
      expect(del).toBeDefined();
    });
    expect(await screen.findByText(/API Key「front-dev-seed」已删除/)).toBeInTheDocument();
  });
});

describe('日志查看页 (/logs)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('只渲染查看器, 不包含日志配置控件', async () => {
    installSettingsMock();

    renderAt('/logs');
    expect(await screen.findByText('暂无日志记录')).toBeInTheDocument();
    // 日志配置已移至系统设置通用页, 此页不再有设置控件。
    expect(screen.queryByLabelText(/日志保留天数/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '保存日志设置' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '日志查看' })).toBeInTheDocument();
  });

  it('展示日志条目, 后端为 null 的字段不渲染', async () => {
    installSettingsMock({
      logs: () =>
        jsonResponse({
          body: {
            items: [
              {
                id: 1,
                logged_at: '2026-09-16T00:00:00Z',
                level: 'info',
                event: 'card_created',
                message: 'Card #7 已创建',
                request_id: 'abc123',
                source: 'web',
                entity_type: 'card',
                entity_id: 7,
                details: '{"front":"hi"}'
              },
              {
                id: 2,
                logged_at: '2026-09-16T00:01:00Z',
                level: 'error',
                event: 'embedding_failed',
                message: '连接失败',
                request_id: null,
                source: null,
                entity_type: null,
                entity_id: null,
                details: null
              }
            ],
            total: 2,
            page: 1,
            page_size: 20
          }
        })
    });

    renderAt('/logs');
    expect(await screen.findByText('card_created')).toBeInTheDocument();
    expect(screen.getByText('Card #7 已创建')).toBeInTheDocument();
    expect(screen.getByText('entity: card #7')).toBeInTheDocument();

    expect(screen.getByText('embedding_failed')).toBeInTheDocument();
    expect(screen.getByText('request_id: abc123')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '展开 details' })).toHaveLength(1);
  });

  it('级别筛选写入 level 查询参数', async () => {
    installSettingsMock();

    renderAt('/logs');
    await screen.findByText('暂无日志记录');

    await userEvent.selectOptions(screen.getByRole('combobox', { name: '日志级别' }), 'error');

    await waitFor(() => {
      expect(vi.mocked(globalThis.fetch).mock.calls.some(([input]) => String(input).includes('level=error'))).toBe(true);
    });
  });

  it('事件名筛选经防抖后写入 event 查询参数', async () => {
    installSettingsMock();

    renderAt('/logs');
    await screen.findByText('暂无日志记录');

    await userEvent.type(screen.getByRole('textbox', { name: '事件名' }), 'card_created');

    await waitFor(
      () => {
        expect(
          vi.mocked(globalThis.fetch).mock.calls.some(([input]) => String(input).includes('event=card_created'))
        ).toBe(true);
      },
      { timeout: 2000 }
    );
  });

  it('日志加载失败显示错误状态并支持重新加载', async () => {
    installSettingsMock({
      logs: () =>
        jsonResponse({
          status: 400,
          body: { error: { code: 'validation_error', message: 'level 取值必须是 debug|info|warn|error' } }
        })
    });

    renderAt('/logs');
    expect(await screen.findByText('日志加载失败')).toBeInTheDocument();
    expect(screen.getByText('level 取值必须是 debug|info|warn|error')).toBeInTheDocument();
  });
});

describe('系统设置 - 修改密码页', () => {
  afterEach(() => vi.restoreAllMocks());

  const fillForm = async (current: string, next: string, confirm: string) => {
    await userEvent.type(screen.getByLabelText(/^当前密码/), current);
    await userEvent.type(screen.getByLabelText(/^新密码/), next);
    await userEvent.type(screen.getByLabelText(/^确认新密码/), confirm);
  };

  it('两次新密码不一致时前端拦截, 不发送请求', async () => {
    installSettingsMock();
    renderAt('/settings/password');
    await screen.findByLabelText(/^当前密码/);

    await fillForm('old-pass', 'new-pass-1', 'new-pass-2');
    await userEvent.click(screen.getByRole('button', { name: '修改密码' }));

    expect(await screen.findByText('两次输入的新密码不一致')).toBeInTheDocument();
    expect(
      vi.mocked(globalThis.fetch).mock.calls.some(([input]) => String(input) === '/api/web/auth/password')
    ).toBe(false);
  });

  it('提交体只包含 current_password/new_password, 成功后清理认证并跳转登录页', async () => {
    const passwordBodies: unknown[] = [];
    installSettingsMock({
      password: (init) => {
        passwordBodies.push(JSON.parse(String(init?.body)));
        return jsonResponse({ body: { ok: true } });
      }
    });

    renderAt('/settings/password');
    await screen.findByLabelText(/^当前密码/);
    await fillForm('old-pass', 'brand-new-pass', 'brand-new-pass');

    await userEvent.click(screen.getByRole('button', { name: '修改密码' }));
    const dialog = screen.getByRole('dialog', { name: '确认修改密码' });
    await userEvent.click(within(dialog).getByRole('button', { name: '确认修改' }));

    await waitFor(() => expect(passwordBodies).toHaveLength(1));
    expect(passwordBodies[0]).toEqual({
      current_password: 'old-pass',
      new_password: 'brand-new-pass'
    });
    // 成功后清理认证状态 -> ProtectedRoute 重定向登录页。
    expect(await screen.findByRole('heading', { name: '登录到本地实例' })).toBeInTheDocument();
  });

  it('当前密码错误时把错误定位到当前密码输入框', async () => {
    installSettingsMock({
      password: () =>
        jsonResponse({
          status: 400,
          body: {
            error: {
              code: 'validation_error',
              message: '当前密码不正确',
              details: { field: 'current_password' }
            }
          }
        })
    });

    renderAt('/settings/password');
    await screen.findByLabelText(/^当前密码/);
    await fillForm('wrong-pass', 'brand-new-pass', 'brand-new-pass');

    await userEvent.click(screen.getByRole('button', { name: '修改密码' }));
    const dialog = screen.getByRole('dialog', { name: '确认修改密码' });
    await userEvent.click(within(dialog).getByRole('button', { name: '确认修改' }));

    expect(await screen.findByText('当前密码不正确')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '登录到本地实例' })).not.toBeInTheDocument();
  });
});
