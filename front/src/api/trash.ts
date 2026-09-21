import { mutationOptions, queryOptions } from '@tanstack/react-query';
import { apiRequest } from './client';
import { PageResponse } from './types';

/**
 * 回收站 (阶段 4) 数据契约。
 *
 * 字段严格对齐后端 handler (`trash_handlers.go` 与各 `*_handlers.go` 的
 * `trashed*Response`)。回收站 Card 不保存原 Topic, 响应中没有 `topic_id`,
 * 因此前端不提供也不伪造“保留原 Topic”选项。
 *
 * 分页固定按 `trashed_at DESC, id DESC`; `page` 从 1 起, `page_size` 默认 20、上限 100。
 */

export type TrashKind = 'cards' | 'topics' | 'glossary';

export interface TrashedCard {
  id: number;
  front: string;
  back: string;
  enable_embedding: boolean;
  version: number;
  created_at: string;
  trashed_at: string;
}

export interface TrashedTopic {
  id: number;
  name: string;
  description: string;
  /** 回收站 Topic 的关联卡在回收时已清空, 服务端恒返回 0, 保留字段以复用同一类型。 */
  card_count: number;
  version: number;
  trashed_at: string;
  created_at: string;
  updated_at: string;
}

export interface TrashedGlossary {
  id: number;
  term: string;
  definition: string;
  version: number;
  trashed_at: string;
  created_at: string;
  updated_at: string;
}

export type TrashedItem = TrashedCard | TrashedTopic | TrashedGlossary;

export interface TrashItemByKind {
  cards: TrashedCard;
  topics: TrashedTopic;
  glossary: TrashedGlossary;
}

export interface TrashListParams<K extends TrashKind = TrashKind> {
  kind: K;
  page: number;
  pageSize: number;
}

// query key 覆盖 Tab 类型与分页参数: 切换 Tab 或翻页得到独立缓存,
// 失效 ['trash'] 前缀时三类列表一起刷新。
export const trashListQueryKey = <K extends TrashKind>(params: TrashListParams<K>) =>
  ['trash', params.kind, 'list', { page: params.page, pageSize: params.pageSize }] as const;

export const buildTrashListPath = (params: TrashListParams): string => {
  const search = new URLSearchParams({
    page: String(params.page),
    page_size: String(params.pageSize)
  });
  return `/api/web/trash/${params.kind}?${search.toString()}`;
};

export const fetchTrashPage = <K extends TrashKind>(
  params: TrashListParams<K>,
  signal?: AbortSignal
): Promise<PageResponse<TrashItemByKind[K]>> =>
  apiRequest<PageResponse<TrashItemByKind[K]>>(buildTrashListPath(params), { signal });

export const trashListQueryOptions = <K extends TrashKind>(params: TrashListParams<K>) =>
  queryOptions({
    queryKey: trashListQueryKey(params),
    queryFn: ({ signal }) => fetchTrashPage(params, signal)
  });

// --- 恢复 ---

export interface CardRestoreResult {
  trash_card_id: number;
  new_card_id: number;
}

export interface RestoreCardInput {
  id: number;
  expectedVersion: number;
  /** 缺省或 null 表示恢复到无 Topic; Topic 不保存原归属, 因此没有“保留原 Topic”。 */
  topicId?: number | null;
}

export interface VersionedItemInput {
  id: number;
  expectedVersion: number;
}

export type RestoreSingleInput =
  | ({ kind: 'cards' } & RestoreCardInput)
  | ({ kind: 'topics' | 'glossary' } & VersionedItemInput);

export type RestoreSingleResult =
  | { kind: 'cards'; card: CardRestoreResult }
  | { kind: 'topics'; topic: TrashedTopic }
  | { kind: 'glossary'; glossary: TrashedGlossary };

// 仅在显式指定 Topic 时发送 topic_id; 缺省与 null 都不发送, 语义为无 Topic。
const restoreCardBody = (input: RestoreCardInput): Record<string, unknown> => {
  const body: Record<string, unknown> = { expected_version: input.expectedVersion };
  if (input.topicId !== undefined && input.topicId !== null) body.topic_id = input.topicId;
  return body;
};

export const restoreTrashItem = async (input: RestoreSingleInput): Promise<RestoreSingleResult> => {
  switch (input.kind) {
    case 'cards':
      return {
        kind: 'cards',
        card: await apiRequest<CardRestoreResult>(`/api/web/trash/cards/${input.id}/restore`, {
          method: 'POST',
          body: restoreCardBody(input)
        })
      };
    case 'topics':
      return {
        kind: 'topics',
        topic: await apiRequest<TrashedTopic>(`/api/web/trash/topics/${input.id}/restore`, {
          method: 'POST',
          body: { expected_version: input.expectedVersion }
        })
      };
    case 'glossary':
      return {
        kind: 'glossary',
        glossary: await apiRequest<TrashedGlossary>(`/api/web/trash/glossary/${input.id}/restore`, {
          method: 'POST',
          body: { expected_version: input.expectedVersion }
        })
      };
  }
};

export const restoreTrashItemMutationOptions = () =>
  mutationOptions({ mutationFn: restoreTrashItem });

export type BatchRestoreInput =
  | { kind: 'cards'; items: RestoreCardInput[] }
  | { kind: 'topics' | 'glossary'; items: VersionedItemInput[] };

export type BatchRestoreResult =
  | { kind: 'cards'; restored: CardRestoreResult[] }
  | { kind: 'topics'; restored: TrashedTopic[] }
  | { kind: 'glossary'; restored: TrashedGlossary[] };

export const batchRestoreTrashItems = async (
  input: BatchRestoreInput
): Promise<BatchRestoreResult> => {
  switch (input.kind) {
    case 'cards': {
      const body = {
        items: input.items.map((item) => ({
          id: item.id,
          expected_version: item.expectedVersion,
          ...(item.topicId !== undefined && item.topicId !== null ? { topic_id: item.topicId } : {})
        }))
      };
      const response = await apiRequest<{ restored: CardRestoreResult[] }>(
        '/api/web/trash/cards/batch-restore',
        { method: 'POST', body }
      );
      return { kind: 'cards', restored: response.restored };
    }
    case 'topics': {
      const body = {
        items: input.items.map((item) => ({ id: item.id, expected_version: item.expectedVersion }))
      };
      const response = await apiRequest<{ restored: TrashedTopic[] }>(
        '/api/web/trash/topics/batch-restore',
        { method: 'POST', body }
      );
      return { kind: 'topics', restored: response.restored };
    }
    case 'glossary': {
      const body = {
        items: input.items.map((item) => ({ id: item.id, expected_version: item.expectedVersion }))
      };
      const response = await apiRequest<{ restored: TrashedGlossary[] }>(
        '/api/web/trash/glossary/batch-restore',
        { method: 'POST', body }
      );
      return { kind: 'glossary', restored: response.restored };
    }
  }
};

export const batchRestoreTrashItemsMutationOptions = () =>
  mutationOptions({ mutationFn: batchRestoreTrashItems });

// --- 永久删除 (仅 Web) ---

export interface DeleteTrashInput {
  kind: TrashKind;
  id: number;
  expectedVersion: number;
}

export interface DeleteTrashResult {
  kind: TrashKind;
  deleted: number;
}

export const deleteTrashItem = async (input: DeleteTrashInput): Promise<DeleteTrashResult> => {
  await apiRequest<{ ok: boolean }>(`/api/web/trash/${input.kind}/${input.id}/delete`, {
    method: 'POST',
    body: { expected_version: input.expectedVersion }
  });
  return { kind: input.kind, deleted: 1 };
};

export const deleteTrashItemMutationOptions = () =>
  mutationOptions({ mutationFn: deleteTrashItem });

export interface BatchDeleteTrashInput {
  kind: TrashKind;
  items: VersionedItemInput[];
}

export const batchDeleteTrashItems = async (
  input: BatchDeleteTrashInput
): Promise<DeleteTrashResult> => {
  const body = {
    items: input.items.map((item) => ({ id: item.id, expected_version: item.expectedVersion }))
  };
  const response = await apiRequest<{ deleted: number }>(
    `/api/web/trash/${input.kind}/batch-delete`,
    { method: 'POST', body }
  );
  return { kind: input.kind, deleted: response.deleted };
};

export const batchDeleteTrashItemsMutationOptions = () =>
  mutationOptions({ mutationFn: batchDeleteTrashItems });

// --- 清空回收站 (仅 Web, 无请求体) ---

export interface EmptyTrashResult {
  cards: number;
  topics: number;
  glossary: number;
}

export const emptyTrash = (): Promise<EmptyTrashResult> =>
  apiRequest<EmptyTrashResult>('/api/web/trash/empty', { method: 'POST' });

export const emptyTrashMutationOptions = () => mutationOptions({ mutationFn: emptyTrash });
