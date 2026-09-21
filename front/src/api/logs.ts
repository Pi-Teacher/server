import { queryOptions } from '@tanstack/react-query';
import { apiRequest } from './client';
import { LogLevel } from './settings';
import { PageResponse } from './types';

/**
 * 运行日志查看器 (/api/web/logs)。
 * level/event/request_id 均为精确匹配; level 取值非法后端返回 400 validation_error。
 * source 与 entity_type 在后端无值时为 null, 前端不渲染对应字段。
 */

export type LogSource = 'web' | 'cli' | 'worker' | 'admin' | 'system';
export type LogEntityType = 'topic' | 'card' | 'glossary';

export interface AppLogItem {
  id: number;
  /** RFC3339 UTC 时间字符串。 */
  logged_at: string;
  level: LogLevel;
  event: string;
  message: string;
  request_id: string | null;
  source: LogSource | null;
  entity_type: LogEntityType | null;
  entity_id: number | null;
  /** 后端存储的小型 JSON 字符串, 无值为 null。 */
  details: string | null;
}

export interface LogsListParams {
  page: number;
  pageSize: number;
  /** 空字符串表示不按级别过滤。 */
  level: LogLevel | '';
  event: string;
  requestId: string;
}

export const buildLogsListPath = (params: LogsListParams): string => {
  const search = new URLSearchParams({
    page: String(params.page),
    page_size: String(params.pageSize)
  });
  if (params.level !== '') search.set('level', params.level);
  if (params.event !== '') search.set('event', params.event);
  if (params.requestId !== '') search.set('request_id', params.requestId);
  return `/api/web/logs?${search.toString()}`;
};

export const logsListQueryKey = (params: LogsListParams) =>
  [
    'logs',
    'list',
    {
      page: params.page,
      pageSize: params.pageSize,
      level: params.level,
      event: params.event,
      requestId: params.requestId
    }
  ] as const;

export const fetchLogs = (
  params: LogsListParams,
  signal?: AbortSignal
): Promise<PageResponse<AppLogItem>> =>
  apiRequest<PageResponse<AppLogItem>>(buildLogsListPath(params), { signal });

export const logsListQueryOptions = (params: LogsListParams) =>
  queryOptions({
    queryKey: logsListQueryKey(params),
    queryFn: ({ signal }) => fetchLogs(params, signal)
  });
