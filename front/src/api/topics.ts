import { mutationOptions, queryOptions } from '@tanstack/react-query';
import { apiRequest } from './client';
import { PageResponse, TopicResponse } from './types';

export type Topic = TopicResponse;

// 既有导出: Cards 与 Review 复用第一页全量 Topic 作为筛选数据源, 保持原样.
export const topicsQueryKey = ['topics', 'list', { page: 1, pageSize: 100 }] as const;

export const fetchTopics = (signal?: AbortSignal): Promise<PageResponse<Topic>> =>
  apiRequest<PageResponse<Topic>>('/api/web/topics?page=1&page_size=100', { signal });

export const topicsQueryOptions = () =>
  queryOptions({
    queryKey: topicsQueryKey,
    queryFn: ({ signal }) => fetchTopics(signal)
  });

// --- 阶段 3: Topics 页面的参数化列表与详情 ---

export interface TopicsListParams {
  page: number;
  pageSize: number;
  q: string;
}

// 列表 key 与既有 topicsQueryKey 同属 ['topics', 'list'] 前缀,
// Card 增删等操作失效该前缀时两类查询会一起刷新.
export const topicsListQueryKey = (params: TopicsListParams) =>
  [
    'topics',
    'list',
    { page: params.page, pageSize: params.pageSize, q: params.q }
  ] as const;

export const buildTopicsListPath = (params: TopicsListParams): string => {
  const search = new URLSearchParams({
    page: String(params.page),
    page_size: String(params.pageSize)
  });
  if (params.q !== '') search.set('q', params.q);
  return `/api/web/topics?${search.toString()}`;
};

export const fetchTopicsPage = (
  params: TopicsListParams,
  signal?: AbortSignal
): Promise<PageResponse<Topic>> =>
  apiRequest<PageResponse<Topic>>(buildTopicsListPath(params), { signal });

export const topicsListQueryOptions = (params: TopicsListParams) =>
  queryOptions({
    queryKey: topicsListQueryKey(params),
    queryFn: ({ signal }) => fetchTopicsPage(params, signal)
  });

export const topicDetailQueryKey = (id: number) => ['topics', 'detail', id] as const;

export const fetchTopicDetail = (id: number, signal?: AbortSignal): Promise<Topic> =>
  apiRequest<Topic>(`/api/web/topics/${id}`, { signal });

export const topicDetailQueryOptions = (id: number) =>
  queryOptions({
    queryKey: topicDetailQueryKey(id),
    queryFn: ({ signal }) => fetchTopicDetail(id, signal),
    enabled: id > 0
  });

// --- 阶段 3: Topics 创建与编辑 ---

export interface CreateTopicInput {
  name: string;
  description: string;
}

export interface UpdateTopicInput {
  id: number;
  expectedVersion: number;
  name?: string;
  description?: string;
}

export const createTopic = (input: CreateTopicInput): Promise<Topic> =>
  apiRequest<Topic>('/api/web/topics', {
    method: 'POST',
    body: {
      name: input.name,
      description: input.description
    }
  });

export const createTopicMutationOptions = () =>
  mutationOptions({
    mutationFn: createTopic
  });

// 编辑始终发送具体字段值, 不提交模糊的“继承”语义;
// 未变化的字段不发送, 由服务端判断无变化时不递增 version.
export const updateTopic = (input: UpdateTopicInput): Promise<Topic> => {
  const body: Record<string, unknown> = { expected_version: input.expectedVersion };
  if (input.name !== undefined) body.name = input.name;
  if (input.description !== undefined) body.description = input.description;

  return apiRequest<Topic>(`/api/web/topics/${input.id}`, {
    method: 'PATCH',
    body
  });
};

export const updateTopicMutationOptions = () =>
  mutationOptions({
    mutationFn: updateTopic
  });

// --- 阶段 3: Topics 回收预览与放入回收站 ---

export interface TopicTrashPreviewResponse {
  topics: number;
  affected_cards: number;
  already_trashed: number;
}

export interface TopicTrashResponse {
  trashed_topic_id: number;
  affected_cards: number;
}

// 预览请求体只接受 ids; 后端 DisallowUnknownFields, 携带 include_cards 会返回 400.
// 预览结果与回收方式无关, affected_cards 始终表示关联的正常 Card 总数.
export const previewTopicTrash = (
  ids: number[],
  signal?: AbortSignal
): Promise<TopicTrashPreviewResponse> =>
  apiRequest<TopicTrashPreviewResponse>('/api/web/topics/trash-preview', {
    method: 'POST',
    body: { ids },
    signal
  });

export const topicTrashPreviewQueryKey = (ids: number[]) => ['topics', 'trash-preview', ids] as const;

// staleTime 0: 预览必须反映实时影响范围, 每次打开弹窗都重新请求.
export const topicTrashPreviewQueryOptions = (ids: number[]) =>
  queryOptions({
    queryKey: topicTrashPreviewQueryKey(ids),
    queryFn: ({ signal }) => previewTopicTrash(ids, signal),
    enabled: ids.length > 0,
    staleTime: 0
  });

export interface TrashTopicInput {
  id: number;
  expectedVersion: number;
  includeCards: boolean;
}

export const trashTopic = (input: TrashTopicInput): Promise<TopicTrashResponse> =>
  apiRequest<TopicTrashResponse>(`/api/web/topics/${input.id}/trash`, {
    method: 'POST',
    body: {
      expected_version: input.expectedVersion,
      include_cards: input.includeCards
    }
  });

export const trashTopicMutationOptions = () =>
  mutationOptions({
    mutationFn: trashTopic
  });
