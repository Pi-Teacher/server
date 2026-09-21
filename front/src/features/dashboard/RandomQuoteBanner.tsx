import React, { useState } from 'react';
import { DASHBOARD_QUOTES, pickQuoteIndex } from './dashboardQuotes';

/**
 * 顶部引导横幅: 每次进入页面从本地句子池随机取一句。
 * 不请求任何外部接口, 不使用 dangerouslySetInnerHTML。
 */
export const RandomQuoteBanner: React.FC = () => {
  // 只在挂载时随机一次, 后续重渲染不再变化。
  const [index] = useState(() => pickQuoteIndex());

  return (
    <section
      aria-label="每日一句"
      className="flex items-center gap-3 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-5 py-4 shadow-card"
    >
      <span className="material-symbols-outlined shrink-0 text-[22px] text-primary" aria-hidden="true">
        format_quote
      </span>
      <p className="flex-1 text-body-md italic text-on-surface">“{DASHBOARD_QUOTES[index]}”</p>
    </section>
  );
};
