import { queryOptions } from '@tanstack/react-query';
import { apiRequest } from './client';
import { PageResponse, TopicResponse } from './types';

export type Topic = TopicResponse;

export const topicsQueryKey = ['topics', 'list', { page: 1, pageSize: 100 }] as const;

export const fetchTopics = (signal?: AbortSignal): Promise<PageResponse<Topic>> =>
  apiRequest<PageResponse<Topic>>('/api/web/topics?page=1&page_size=100', { signal });

export const topicsQueryOptions = () =>
  queryOptions({
    queryKey: topicsQueryKey,
    queryFn: ({ signal }) => fetchTopics(signal)
  });
