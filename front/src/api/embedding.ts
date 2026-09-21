import { mutationOptions, queryOptions } from '@tanstack/react-query';
import { apiRequest } from './client';

/**
 * Embedding 配置与状态 (/api/web/embedding/...)。
 *
 * 配置读写走独立端点, 与通用 settings 分离; 其中 api_key 后端明文返回不做脱敏,
 * 前端只做视觉隐藏。状态端点与 cards/check 使用同一套 coverage 字段。
 */

export interface EmbeddingConfig {
  base_url: string;
  api_key: string;
  model: string;
  dimensions: number;
  timeout_seconds: number;
  worker_batch_size: number;
  similarity_min_ready_percent: number;
}

export interface EmbeddingCoverage {
  total_enabled: number;
  ready: number;
  pending: number;
  processing: number;
  failed: number;
  ready_percent: number;
}

export interface EmbeddingStatus {
  rebuilding: boolean;
  similarity_enabled: boolean;
  coverage: EmbeddingCoverage;
}

/**
 * /embedding/test 探测结果。业务失败仍返回 200, 因此调用方必须按 ok 判断,
 * 不能把 ok=false 当成 HTTP 错误。
 */
export interface EmbeddingTestResult {
  ok: boolean;
  dimensions?: number;
  error?: string;
}

/** PATCH 只包含实际修改的字段, 后端要求至少一个字段。 */
export type EmbeddingConfigPatch = Partial<EmbeddingConfig>;

interface EmbeddingConfigResponse {
  config: EmbeddingConfig;
}

export const embeddingConfigQueryKey = ['embedding', 'config'] as const;
export const embeddingStatusQueryKey = ['embedding', 'status'] as const;

export const fetchEmbeddingConfig = (signal?: AbortSignal): Promise<EmbeddingConfig> =>
  apiRequest<EmbeddingConfigResponse>('/api/web/embedding/config', { signal }).then(
    (response) => response.config
  );

export const embeddingConfigQueryOptions = () =>
  queryOptions({
    queryKey: embeddingConfigQueryKey,
    queryFn: ({ signal }) => fetchEmbeddingConfig(signal)
  });

export const fetchEmbeddingStatus = (signal?: AbortSignal): Promise<EmbeddingStatus> =>
  apiRequest<EmbeddingStatus>('/api/web/embedding/status', { signal });

export const embeddingStatusQueryOptions = () =>
  queryOptions({
    queryKey: embeddingStatusQueryKey,
    queryFn: ({ signal }) => fetchEmbeddingStatus(signal)
  });

export const updateEmbeddingConfig = (patch: EmbeddingConfigPatch): Promise<EmbeddingConfig> =>
  apiRequest<EmbeddingConfigResponse>('/api/web/embedding/config', {
    method: 'PATCH',
    body: patch
  }).then((response) => response.config);

export const updateEmbeddingConfigMutationOptions = () =>
  mutationOptions({
    mutationFn: updateEmbeddingConfig
  });

export const testEmbedding = (): Promise<EmbeddingTestResult> =>
  apiRequest<EmbeddingTestResult>('/api/web/embedding/test', { method: 'POST' });

export const testEmbeddingMutationOptions = () =>
  mutationOptions({
    mutationFn: testEmbedding
  });

/** 触发完整重建; 成功返回 202, 已在重建中返回 409 rebuilding。 */
export const rebuildEmbedding = (): Promise<{ status: string }> =>
  apiRequest<{ status: string }>('/api/web/embedding/rebuild', { method: 'POST' });

export const rebuildEmbeddingMutationOptions = () =>
  mutationOptions({
    mutationFn: rebuildEmbedding
  });

/** 重试全部 failed Card; 无失败项时后端直接成功。 */
export const retryFailedEmbedding = (): Promise<{ status: string }> =>
  apiRequest<{ status: string }>('/api/web/embedding/retry-failed', { method: 'POST' });

export const retryFailedEmbeddingMutationOptions = () =>
  mutationOptions({
    mutationFn: retryFailedEmbedding
  });

/** 计算配置差异, 只提交被修改的字段。 */
export const buildEmbeddingConfigPatch = (
  server: EmbeddingConfig,
  draft: EmbeddingConfig
): EmbeddingConfigPatch => {
  const patch: EmbeddingConfigPatch = {};
  (Object.keys(draft) as (keyof EmbeddingConfig)[]).forEach((key) => {
    if (draft[key] !== server[key]) {
      patch[key] = draft[key] as never;
    }
  });
  return patch;
};
