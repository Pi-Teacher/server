import React from 'react';
import { Button } from '../../components/ui/Button';

interface ProposalEntryProps {
  onOpenApprovals: () => void;
}

/**
 * AI Agent 提案中心入口。
 *
 * Dashboard 不复制模板中的提案列表与虚构数量 (PROP-104、置信度等), 只保留
 * 一个指向提案审批页的入口, 让用户去真实页面查看真实数据。
 */
export const ProposalEntry: React.FC<ProposalEntryProps> = ({ onOpenApprovals }) => (
  <section
    aria-label="提案中心入口"
    className="flex flex-col gap-4 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card sm:flex-row sm:items-center sm:justify-between"
  >
    <div className="flex items-start gap-4">
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ai-proposal-bg text-ai-proposal-text"
        aria-hidden="true"
      >
        <span className="material-symbols-outlined text-[22px]">smart_toy</span>
      </span>
      <div>
        <h2 className="text-headline-sm text-on-surface">AI Agent 提案中心</h2>
        <p className="mt-1 text-body-md text-on-surface-variant">
          查看由 CLI 提交、等待人工审批的合并与提取提案。Dashboard 不展示未经服务端确认的提案统计。
        </p>
      </div>
    </div>
    <Button variant="secondary" onClick={onOpenApprovals} className="shrink-0 self-start sm:self-auto">
      查看提案
      <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
        arrow_forward
      </span>
    </Button>
  </section>
);
