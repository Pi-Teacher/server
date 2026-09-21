import { mutationOptions, queryOptions } from '@tanstack/react-query';
import { apiRequest } from './client';
import { PageResponse } from './types';

export type CardEmbeddingStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'disabled';
export type CardEmbeddingFilter = CardEmbeddingStatus | '';
export type CardSort = 'created_at' | 'updated_at';
export type SortOrder = 'asc' | 'desc';
export type CardTopicFilter = number | null;

export interface CardListItem {
  id: number;
  topic_id: number | null;
  front: string;
  back: string;
  enable_embedding: boolean;
  embedding_status: CardEmbeddingStatus;
  version: number;
  created_at: string;
  updated_at: string;
}

export type CardScheduleState = 'new' | 'learning' | 'review' | 'relearning' | 'unknown';

export interface CardSchedule {
  due: string;
  state: CardScheduleState;
  stability: number;
  difficulty: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  last_review_at: string | null;
  version: number;
}

export interface CardDetail extends CardListItem {
  embedding_error: string | null;
  schedule: CardSchedule | null;
}

export interface CreateCardInput {
  topicId: number | null;
  front: string;
  back: string;
  enableEmbedding: boolean;
}

export interface UpdateCardInput {
  id: number;
  expectedVersion: number;
  topicId?: number | null;
  front?: string;
  back?: string;
  enableEmbedding?: boolean;
}

export interface CardCheckCoverage {
  total_enabled: number;
  ready: number;
  pending: number;
  processing: number;
  failed: number;
  ready_percent: number;
}

export interface CardCheckMatch {
  id: number;
  front: string;
  back: string;
  topic_id: number | null;
  similarity?: number;
}

export type CardCheckMatchType = 'exact' | 'semantic';

export interface CardCheckResponse {
  match_type: CardCheckMatchType;
  coverage?: CardCheckCoverage;
  matches: CardCheckMatch[];
}

export interface CheckCardInput {
  front: string;
  enableEmbedding: boolean;
  topK?: number;
}

export interface TrashCardInput {
  id: number;
  expectedVersion: number;
}

export interface BatchTrashCardItem {
  id: number;
  expectedVersion: number;
}

export interface MergeCardsInput {
  sourceCardIds: [number, number];
  front?: string;
  back?: string;
  topicId?: number | null;
  enableEmbedding?: boolean;
}

export interface CardsListParams {
  page: number;
  pageSize: number;
  topicId: CardTopicFilter;
  q: string;
  embeddingStatus: CardEmbeddingFilter;
  sort: CardSort;
  order: SortOrder;
}

export const cardsListQueryKey = (params: CardsListParams) =>
  [
    'cards',
    'list',
    {
      page: params.page,
      pageSize: params.pageSize,
      topicId: params.topicId,
      q: params.q,
      embeddingStatus: params.embeddingStatus,
      sort: params.sort,
      order: params.order
    }
  ] as const;

export const buildCardsListPath = (params: CardsListParams): string => {
  const search = new URLSearchParams({
    page: String(params.page),
    page_size: String(params.pageSize),
    sort: params.sort,
    order: params.order
  });
  if (params.topicId !== null) search.set('topic_id', String(params.topicId));
  if (params.q !== '') search.set('q', params.q);
  if (params.embeddingStatus !== '') search.set('embedding_status', params.embeddingStatus);
  return `/api/web/cards?${search.toString()}`;
};

export const fetchCards = (
  params: CardsListParams,
  signal?: AbortSignal
): Promise<PageResponse<CardListItem>> =>
  apiRequest<PageResponse<CardListItem>>(buildCardsListPath(params), { signal });

export const cardsListQueryOptions = (params: CardsListParams) =>
  queryOptions({
    queryKey: cardsListQueryKey(params),
    queryFn: ({ signal }) => fetchCards(params, signal)
  });

export const cardDetailQueryKey = (id: number) => ['cards', 'detail', id] as const;

export const fetchCardDetail = (id: number, signal?: AbortSignal): Promise<CardDetail> =>
  apiRequest<CardDetail>(`/api/web/cards/${id}`, { signal });

export const cardDetailQueryOptions = (id: number) =>
  queryOptions({
    queryKey: cardDetailQueryKey(id),
    queryFn: ({ signal }) => fetchCardDetail(id, signal),
    enabled: id > 0
  });

export const createCard = (input: CreateCardInput): Promise<CardDetail> =>
  apiRequest<CardDetail>('/api/web/cards', {
    method: 'POST',
    body: {
      topic_id: input.topicId,
      front: input.front,
      back: input.back,
      enable_embedding: input.enableEmbedding
    }
  });

export const createCardMutationOptions = () =>
  mutationOptions({
    mutationFn: createCard
  });

export const updateCard = (input: UpdateCardInput): Promise<CardDetail> => {
  const body: Record<string, unknown> = { expected_version: input.expectedVersion };
  if ('topicId' in input) body.topic_id = input.topicId;
  if (input.front !== undefined) body.front = input.front;
  if (input.back !== undefined) body.back = input.back;
  if (input.enableEmbedding !== undefined) body.enable_embedding = input.enableEmbedding;

  return apiRequest<CardDetail>(`/api/web/cards/${input.id}`, {
    method: 'PATCH',
    body
  });
};

export const updateCardMutationOptions = () =>
  mutationOptions({
    mutationFn: updateCard
  });

export const checkCard = (input: CheckCardInput): Promise<CardCheckResponse> =>
  apiRequest<CardCheckResponse>('/api/web/cards/check', {
    method: 'POST',
    body: {
      front: input.front,
      enable_embedding: input.enableEmbedding,
      ...(input.topK === undefined ? {} : { top_k: input.topK })
    }
  });

export const checkCardMutationOptions = () =>
  mutationOptions({
    mutationFn: checkCard
  });

export const trashCard = (input: TrashCardInput): Promise<{ trashed_card_id: number }> =>
  apiRequest<{ trashed_card_id: number }>(`/api/web/cards/${input.id}/trash`, {
    method: 'POST',
    body: { expected_version: input.expectedVersion }
  });

export const trashCardMutationOptions = () =>
  mutationOptions({
    mutationFn: trashCard
  });

export const batchTrashCards = (
  items: BatchTrashCardItem[]
): Promise<{ trashed_cards: number }> =>
  apiRequest<{ trashed_cards: number }>('/api/web/cards/batch-trash', {
    method: 'POST',
    body: {
      items: items.map((item) => ({
        id: item.id,
        expected_version: item.expectedVersion
      }))
    }
  });

export const batchTrashCardsMutationOptions = () =>
  mutationOptions({
    mutationFn: batchTrashCards
  });

export const mergeCards = (input: MergeCardsInput): Promise<CardDetail> => {
  const body: Record<string, unknown> = {
    source_card_ids: input.sourceCardIds
  };
  if (input.front !== undefined) body.front = input.front;
  if (input.back !== undefined) body.back = input.back;
  if ('topicId' in input) body.topic_id = input.topicId;
  if (input.enableEmbedding !== undefined) body.enable_embedding = input.enableEmbedding;

  return apiRequest<CardDetail>('/api/web/cards/merge', {
    method: 'POST',
    body
  });
};

export const mergeCardsMutationOptions = () =>
  mutationOptions({
    mutationFn: mergeCards
  });
