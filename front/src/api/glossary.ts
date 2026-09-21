import { mutationOptions, queryOptions } from '@tanstack/react-query';
import { apiRequest } from './client';
import { PageResponse } from './types';

export interface Glossary {
  id: number;
  term: string;
  definition: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface GlossaryListParams {
  page: number;
  pageSize: number;
  q: string;
}

// 后端 Glossary 列表没有排序参数, 固定按更新时间倒序, 前端不提供排序控件.
export const glossaryListQueryKey = (params: GlossaryListParams) =>
  [
    'glossary',
    'list',
    { page: params.page, pageSize: params.pageSize, q: params.q }
  ] as const;

export const buildGlossaryListPath = (params: GlossaryListParams): string => {
  const search = new URLSearchParams({
    page: String(params.page),
    page_size: String(params.pageSize)
  });
  if (params.q !== '') search.set('q', params.q);
  return `/api/web/glossary?${search.toString()}`;
};

export const fetchGlossaryPage = (
  params: GlossaryListParams,
  signal?: AbortSignal
): Promise<PageResponse<Glossary>> =>
  apiRequest<PageResponse<Glossary>>(buildGlossaryListPath(params), { signal });

export const glossaryListQueryOptions = (params: GlossaryListParams) =>
  queryOptions({
    queryKey: glossaryListQueryKey(params),
    queryFn: ({ signal }) => fetchGlossaryPage(params, signal)
  });

export const glossaryDetailQueryKey = (id: number) => ['glossary', 'detail', id] as const;

export const fetchGlossaryDetail = (id: number, signal?: AbortSignal): Promise<Glossary> =>
  apiRequest<Glossary>(`/api/web/glossary/${id}`, { signal });

export const glossaryDetailQueryOptions = (id: number) =>
  queryOptions({
    queryKey: glossaryDetailQueryKey(id),
    queryFn: ({ signal }) => fetchGlossaryDetail(id, signal),
    enabled: id > 0
  });

export interface CreateGlossaryInput {
  term: string;
  definition: string;
}

export interface UpdateGlossaryInput {
  id: number;
  expectedVersion: number;
  term?: string;
  definition?: string;
}

export const createGlossary = (input: CreateGlossaryInput): Promise<Glossary> =>
  apiRequest<Glossary>('/api/web/glossary', {
    method: 'POST',
    body: {
      term: input.term,
      definition: input.definition
    }
  });

export const createGlossaryMutationOptions = () =>
  mutationOptions({
    mutationFn: createGlossary
  });

// 编辑始终发送具体字段值, 不提交模糊的“继承”语义;
// 未变化的字段不发送, 由服务端判断无变化时不递增 version.
export const updateGlossary = (input: UpdateGlossaryInput): Promise<Glossary> => {
  const body: Record<string, unknown> = { expected_version: input.expectedVersion };
  if (input.term !== undefined) body.term = input.term;
  if (input.definition !== undefined) body.definition = input.definition;

  return apiRequest<Glossary>(`/api/web/glossary/${input.id}`, {
    method: 'PATCH',
    body
  });
};

export const updateGlossaryMutationOptions = () =>
  mutationOptions({
    mutationFn: updateGlossary
  });

export interface TrashGlossaryInput {
  id: number;
  expectedVersion: number;
}

// Glossary 回收没有 Topic 那样的影响范围统计, 响应只有 ok.
export interface TrashGlossaryResponse {
  ok: boolean;
}

export const trashGlossary = (input: TrashGlossaryInput): Promise<TrashGlossaryResponse> =>
  apiRequest<TrashGlossaryResponse>(`/api/web/glossary/${input.id}/trash`, {
    method: 'POST',
    body: {
      expected_version: input.expectedVersion
    }
  });

export const trashGlossaryMutationOptions = () =>
  mutationOptions({
    mutationFn: trashGlossary
  });
