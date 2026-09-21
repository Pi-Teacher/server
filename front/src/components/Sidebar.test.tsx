import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Sidebar } from './Sidebar';

/**
 * 锁定侧栏导航的分组与顺序, 这些顺序是用户明确指定的信息架构,
 * 避免后续调整时被无意改乱。
 */
describe('Sidebar 导航', () => {
  it('主组顺序: 卡片复习 / 卡片管理 / 知识分类 / 术语表 / 审批开关控制 / 提案审批', () => {
    render(<Sidebar currentPath="review" onNavigate={vi.fn()} onLogout={vi.fn()} />);

    // 用 DOM 顺序校验信息架构顺序, 避免图标文字干扰 label 提取。
    const order = screen
      .getAllByRole('button')
      .map((button) => button.querySelector('span.text-\\[14px\\]')?.textContent?.trim())
      .filter((label): label is string => Boolean(label));

    expect(order).toEqual([
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
