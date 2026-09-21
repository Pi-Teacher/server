import { mutationOptions, queryOptions } from '@tanstack/react-query';
import { apiRequest } from './client';
import { PageResponse } from './types';

/**
 * API Key 管理 (/api/web/api-keys)。
 * 后端只返回 id/name/api_key/created_at, 没有 last_used_at, 因此不展示最后使用时间。
 * api_key 明文返回, 前端只做视觉隐藏。
 */

export interface APIKey {
  id: number;
  name: string;
  api_key: string;
  created_at: string;
}

export const API_KEYS_PAGE_SIZE = 20;

export const apiKeysQueryKey = (page: number) => ['api-keys', { page }] as const;

export const fetchAPIKeys = (
  page: number,
  signal?: AbortSignal
): Promise<PageResponse<APIKey>> =>
  apiRequest<PageResponse<APIKey>>(
    `/api/web/api-keys?page=${page}&page_size=${API_KEYS_PAGE_SIZE}`,
    { signal }
  );

export const apiKeysQueryOptions = (page: number) =>
  queryOptions({
    queryKey: apiKeysQueryKey(page),
    queryFn: ({ signal }) => fetchAPIKeys(page, signal)
  });

/** POST /api/web/api-keys, 名称去空白后非空且最长 200 字符。 */
export const createAPIKey = (name: string): Promise<APIKey> =>
  apiRequest<APIKey>('/api/web/api-keys', { method: 'POST', body: { name } });

export const createAPIKeyMutationOptions = () =>
  mutationOptions({
    mutationFn: createAPIKey
  });

/** DELETE /api/web/api-keys/{id}, 物理删除即吊销。 */
export const deleteAPIKey = (id: number): Promise<{ ok: boolean }> =>
  apiRequest<{ ok: boolean }>(`/api/web/api-keys/${id}`, { method: 'DELETE' });

export const deleteAPIKeyMutationOptions = () =>
  mutationOptions({
    mutationFn: deleteAPIKey
  });
