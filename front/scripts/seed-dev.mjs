const baseURL = (process.env.PI_TEACHER_DEV_BASE_URL ?? 'http://127.0.0.1:3333').replace(/\/$/, '');
const password = process.env.PI_TEACHER_DEV_PASSWORD;

if (!password) {
  console.error('缺少 PI_TEACHER_DEV_PASSWORD, 请传入服务端首次启动时生成的密码.');
  process.exit(1);
}

let cookieHeader = '';
let csrfToken = '';

const parseCookies = (headers) => {
  const values = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : [headers.get('set-cookie')].filter(Boolean);
  const cookies = new Map();
  for (const value of values) {
    for (const part of value.split(/,(?=[^;,]+=)/)) {
      const pair = part.split(';', 1)[0];
      const separator = pair.indexOf('=');
      if (separator > 0) cookies.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
    }
  }
  cookieHeader = [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
};

const request = async (path, options = {}) => {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (cookieHeader) headers.set('Cookie', cookieHeader);
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  const method = (options.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD' && csrfToken) headers.set('X-CSRF-Token', csrfToken);

  const response = await fetch(`${baseURL}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = body?.error?.message ?? `HTTP ${response.status}`;
    const error = new Error(`${method} ${path}: ${message}`);
    error.status = response.status;
    error.code = body?.error?.code;
    throw error;
  }
  return { body, headers: response.headers };
};

const login = async () => {
  const response = await request('/api/web/auth/login', {
    method: 'POST',
    body: { password }
  });
  parseCookies(response.headers);
  csrfToken = response.body.csrf_token;
};

const listAll = async (path) => (await request(`${path}${path.includes('?') ? '&' : '?'}page=1&page_size=100`)).body.items;

const findTopic = async (name) => (await listAll(`/api/web/topics?q=${encodeURIComponent(name)}`)).find((item) => item.name === name);
const ensureTopic = async (name, description) => {
  const existing = await findTopic(name);
  if (existing) return existing;
  return (await request('/api/web/topics', { method: 'POST', body: { name, description } })).body;
};

const findGlossary = async (term) => (await listAll(`/api/web/glossary?q=${encodeURIComponent(term)}`)).find((item) => item.term === term);
const ensureGlossary = async (term, definition) => {
  const existing = await findGlossary(term);
  if (existing) return existing;
  return (await request('/api/web/glossary', { method: 'POST', body: { term, definition } })).body;
};

const findCard = async (front) => (await listAll(`/api/web/cards?q=${encodeURIComponent(front)}`)).find((item) => item.front === front);
const ensureCard = async ({ topicID = null, front, back }) => {
  const existing = await findCard(front);
  if (existing) return existing;
  return (await request('/api/web/cards', {
    method: 'POST',
    body: { topic_id: topicID, front, back, enable_embedding: false }
  })).body;
};

const ensureTrashedTopic = async () => {
  const name = '回收站示例分类';
  const trashed = (await listAll('/api/web/trash/topics')).find((item) => item.name === name);
  if (trashed) return;
  const topic = await ensureTopic(name, '用于验证 Topic 回收站页面.');
  await request(`/api/web/topics/${topic.id}/trash`, {
    method: 'POST',
    body: { expected_version: topic.version, include_cards: false }
  });
};

const ensureTrashedGlossary = async () => {
  const term = '回收站示例术语';
  const trashed = (await listAll('/api/web/trash/glossary')).find((item) => item.term === term);
  if (trashed) return;
  const glossary = await ensureGlossary(term, '用于验证 Glossary 回收站页面.');
  await request(`/api/web/glossary/${glossary.id}/trash`, {
    method: 'POST',
    body: { expected_version: glossary.version }
  });
};

const ensureTrashedCard = async () => {
  const front = '回收站里的示例卡片';
  const trashed = (await listAll('/api/web/trash/cards')).find((item) => item.front === front);
  if (trashed) return;
  const card = await ensureCard({ front, back: '用于验证 Card 回收站页面.' });
  await request(`/api/web/cards/${card.id}/trash`, {
    method: 'POST',
    body: { expected_version: card.version }
  });
};

const ensureProfile = async () => {
  const profile = (await request('/api/web/user-profile')).body;
  if (profile.profile.trim() !== '') return;
  await request('/api/web/user-profile', {
    method: 'PUT',
    body: {
      expected_version: profile.version,
      profile: '# 学习偏好\n\n- 偏好先理解原理, 再通过卡片巩固.\n- 示例代码优先使用 Go 和 TypeScript.'
    }
  });
};

const ensureAPIKey = async () => {
  const keys = await listAll('/api/web/api-keys');
  const existing = keys.find((item) => item.name === 'front-dev-seed');
  if (existing) return existing.api_key;
  const created = await request('/api/web/api-keys', {
    method: 'POST',
    body: { name: 'front-dev-seed' }
  });
  return created.body.api_key;
};

const ensurePendingApproval = async (apiKey) => {
  const pending = await listAll('/api/web/approvals?status=pending');
  const exists = pending.some((item) => item.operation === 'glossary_create' && item.original_payload?.term === 'AI 提议示例术语');
  if (exists) return;
  await request('/api/cli/glossary', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Idempotency-Key': 'front-dev-seed-glossary-proposal-v1'
    },
    body: {
      term: 'AI 提议示例术语',
      definition: '这是一条通过真实 CLI API 创建的 pending 审批提案.'
    }
  });
};

const main = async () => {
  await login();
  const algorithms = await ensureTopic('算法与数据结构', '算法复杂度、常用数据结构与解题方法.');
  const systems = await ensureTopic('系统设计', '分布式系统、数据库与可靠性设计.');
  await ensureTopic('暂时无卡分类', '用于验证 Topic 空状态.');

  await ensureCard({
    topicID: algorithms.id,
    front: '二分查找的时间复杂度是什么?',
    back: '**O(log n)**. 每次比较都会将搜索区间缩小一半.'
  });
  await ensureCard({
    topicID: systems.id,
    front: '什么是乐观锁?',
    back: '写入时比较 `expected_version`, 只有版本一致才更新, 用于防止丢失更新.'
  });
  await ensureCard({
    front: '没有 Topic 的卡片如何筛选?',
    back: '请求 `GET /api/web/cards?topic_id=0`, 响应中的 `topic_id` 仍然是 `null`.'
  });

  await ensureGlossary('FSRS', 'Free Spaced Repetition Scheduler, 用于根据复习反馈计算下一次到期时间.');
  await ensureGlossary('乐观锁', '通过版本条件更新避免并发覆盖, 冲突时返回 `version_conflict`.');
  await ensureTrashedTopic();
  await ensureTrashedGlossary();
  await ensureTrashedCard();
  await ensureProfile();
  const apiKey = await ensureAPIKey();
  await ensurePendingApproval(apiKey);

  console.log('开发种子数据已准备完成.');
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
