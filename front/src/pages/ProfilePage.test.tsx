import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfilePage } from './ProfilePage';

interface MockResponse {
  status?: number;
  body: unknown;
}

const jsonResponse = ({ status = 200, body }: MockResponse): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

const renderProfilePage = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false }
    }
  });
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...rendered, queryClient };
};

const putCalls = () =>
  vi.mocked(globalThis.fetch).mock.calls.filter(([, init]) => init?.method === 'PUT');

describe('ProfilePage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('显示加载状态，GET 成功后填充编辑器与预览', async () => {
    let resolveProfile: ((value: Response) => void) | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveProfile = resolve;
        })
    );

    renderProfilePage();
    expect(screen.getByText('正在加载用户画像')).toBeInTheDocument();

    resolveProfile?.(
      jsonResponse({ body: { profile: '# 背景\n\n- Go 后端开发者', version: 3 } })
    );

    const textarea = await screen.findByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toBe('# 背景\n\n- Go 后端开发者');
    expect(screen.getByText('version 3')).toBeInTheDocument();
    // 安全 Markdown 预览: 标题以真实元素渲染.
    expect(screen.getByRole('heading', { name: '背景' })).toBeInTheDocument();
  });

  it('GET 失败显示错误状态并支持重新加载', async () => {
    let calls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      calls += 1;
      if (calls === 1) {
        return jsonResponse({
          status: 500,
          body: { error: { code: 'internal_error', message: '服务器内部错误' } }
        });
      }
      return jsonResponse({ body: { profile: '恢复后的画像', version: 1 } });
    });

    renderProfilePage();
    expect(await screen.findByText('用户画像加载失败')).toBeInTheDocument();
    expect(screen.getByText('服务器内部错误')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '重新尝试' }));

    const textarea = await screen.findByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toBe('恢复后的画像');
  });

  it('保存时发送 expected_version 与 Markdown 纯文本，并使用返回的新 version', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === '/api/web/user-profile' && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as { profile: string; expected_version: number };
        return jsonResponse({
          body: { profile: body.profile, version: body.expected_version + 1 }
        });
      }
      return jsonResponse({ body: { profile: '旧画像', version: 4 } });
    });

    renderProfilePage();
    const textarea = await screen.findByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toBe('旧画像');

    fireEvent.change(textarea, { target: { value: '新的 Markdown 画像' } });
    await userEvent.click(screen.getByRole('button', { name: '保存画像' }));

    await waitFor(() => expect(putCalls()).toHaveLength(1));
    const putInit = putCalls()[0]?.[1];
    expect(JSON.parse(String(putInit?.body))).toEqual({
      profile: '新的 Markdown 画像',
      expected_version: 4
    });

    expect(await screen.findByText(/用户画像已保存，当前 version 为 5/)).toBeInTheDocument();
    expect(screen.getByText('version 5')).toBeInTheDocument();
  });

  it('提交期间禁用保存并防止重复提交', async () => {
    let resolvePut: ((value: Response) => void) | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === '/api/web/user-profile' && init?.method === 'PUT') {
        return new Promise<Response>((resolve) => {
          resolvePut = resolve;
        });
      }
      return jsonResponse({ body: { profile: '初始', version: 2 } });
    });

    renderProfilePage();
    const textarea = await screen.findByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '未保存内容' } });

    const saveButton = screen.getByRole('button', { name: '保存画像' });
    await userEvent.click(saveButton);

    // 提交中: 保存按钮禁用, 编辑器被禁用, 重复点击不再产生请求.
    expect(saveButton).toBeDisabled();
    expect(textarea).toBeDisabled();
    await userEvent.click(saveButton);
    await userEvent.click(saveButton);
    expect(putCalls()).toHaveLength(1);

    resolvePut?.(jsonResponse({ body: { profile: '未保存内容', version: 3 } }));
    await waitFor(() => expect(screen.getByText('version 3')).toBeInTheDocument());
    expect(putCalls()).toHaveLength(1);
  });

  it('version_conflict 保留未保存文本，提供复制与重新加载且不自动重试', async () => {
    const clipboardWrite = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWrite }
    });

    let profileCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === '/api/web/user-profile' && init?.method === 'PUT') {
        return jsonResponse({
          status: 409,
          body: {
            error: {
              code: 'version_conflict',
              message: '用户画像 已被修改, 请重读后重试',
              details: { current_version: 7 }
            }
          }
        });
      }
      profileCalls += 1;
      return jsonResponse({
        body:
          profileCalls === 1
            ? { profile: '服务端旧内容', version: 6 }
            : { profile: '服务端最新内容', version: 7 }
      });
    });

    renderProfilePage();
    const textarea = await screen.findByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '我的未保存文本' } });
    await userEvent.click(screen.getByRole('button', { name: '保存画像' }));

    const conflict = await screen.findByRole('dialog', { name: '用户画像版本冲突' });
    // 未保存文本仍然保留在编辑器中.
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('我的未保存文本');
    // 不自动重试: PUT 只发生一次.
    expect(putCalls()).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: '复制当前内容' }));
    expect(clipboardWrite).toHaveBeenCalledWith('我的未保存文本');

    const reloadButton = conflict.querySelector<HTMLButtonElement>('button:last-child');
    expect(reloadButton).not.toBeNull();
    await userEvent.click(reloadButton as HTMLButtonElement);

    // 重新加载后编辑器替换为最新服务端内容, version 更新, 且仍然没有自动重试.
    await waitFor(() => expect(screen.getByText('version 7')).toBeInTheDocument());
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('服务端最新内容');
    expect(putCalls()).toHaveLength(1);
  });
});
