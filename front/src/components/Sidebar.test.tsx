import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Sidebar } from './Sidebar';

/**
 * 锁定侧栏导航的分组与顺序, 这些顺序是用户明确指定的信息架构,
 * 避免后续调整时被无意改乱。
 */
describe('Sidebar 导航', () => {
  it('主组顺序: Dashboard / 卡片复习 / 卡片管理 / 知识分类 / 术语表 / 审批开关控制 / 提案审批', () => {
    render(<Sidebar currentPath="dashboard" onNavigate={vi.fn()} onLogout={vi.fn()} />);

    // 用 DOM 顺序校验信息架构顺序, 避免图标文字干扰 label 提取。
    const order = screen
      .getAllByRole('button')
      .map((button) => button.querySelector('span.text-\\[14px\\]')?.textContent?.trim())
      .filter((label): label is string => Boolean(label));

    expect(order).toEqual([
      'Dashboard',
      '卡片复习',
      '卡片管理',
      '知识分类',
      '术语表',
      '审批开关控制',
      '提案审批',
      '个人信息与偏好',
      '系统设置',
      '日志查看',
      '回收站'
    ]);
  });

  it('不再出现旧的 "AI 审批中心" 名称', () => {
    render(<Sidebar currentPath="approvals" onNavigate={vi.fn()} onLogout={vi.fn()} />);
    expect(screen.queryByText('AI 审批中心')).not.toBeInTheDocument();
    expect(screen.getByText('提案审批')).toBeInTheDocument();
  });
});

describe('Sidebar 底部操作区', () => {
  it('不再展示伪造的本地用户身份', () => {
    render(<Sidebar currentPath="dashboard" onNavigate={vi.fn()} onLogout={vi.fn()} />);
    expect(screen.queryByText('本地用户')).not.toBeInTheDocument();
    expect(screen.queryByText('Single-user instance')).not.toBeInTheDocument();
  });

  it('退出登录按钮位于上层并可触发登出', async () => {
    const onLogout = vi.fn();
    render(<Sidebar currentPath="dashboard" onNavigate={vi.fn()} onLogout={onLogout} />);

    await userEvent.click(screen.getByRole('button', { name: /退出登录/ }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('项目仓库按钮是跳转到 GitHub 组织页的新窗口链接', () => {
    render(<Sidebar currentPath="dashboard" onNavigate={vi.fn()} onLogout={vi.fn()} />);

    const link = screen.getByRole('link', { name: /项目仓库/ });
    expect(link).toHaveAttribute('href', 'https://github.com/Pi-Teacher');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  it('单击使用说明弹出概念说明弹窗, 含术语表与卡片释义', async () => {
    render(<Sidebar currentPath="dashboard" onNavigate={vi.fn()} onLogout={vi.fn()} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /使用说明/ }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleName('使用说明');
    expect(screen.getByText('用户已经彻底理解的概念。')).toBeInTheDocument();
    expect(screen.getByText('学习时产生、需要长期记忆的知识点，使用 FSRS 算法安排复习时间。')).toBeInTheDocument();
  });
});
