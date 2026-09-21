/**
 * 顶部署名/引导横幅的固定句子池。
 *
 * 模板中的横幅原本来自第三方 GitHub Zen API; 生产页面不发外部请求,
 * 改为在本地句子池中随机挑选一句, 避免依赖外部网络与跨域。
 */
export const DASHBOARD_QUOTES = [
  'Design for failure.',
  'Speak like a human.',
  'Approachable is better than simple.',
  'Mind your words, they are important.',
  'Anything added dilutes everything else.',
  'Favor focus over features.',
  'Avoid administrative distraction.'
] as const;

export const pickQuoteIndex = (random: () => number = Math.random): number =>
  Math.min(DASHBOARD_QUOTES.length - 1, Math.floor(random() * DASHBOARD_QUOTES.length));
