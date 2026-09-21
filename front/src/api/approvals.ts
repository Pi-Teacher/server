import { mutationOptions, queryOptions } from '@tanstack/react-query';
import { apiRequest } from './client';
import { PageResponse } from './types';

/**
 * AI 审批中心 (/api/web/approvals)。
 *
 * 后端只有 pending / approved / rejected / stale 四种会被真实写入的状态;
 * `cancelled` 虽在枚举里但没有任何写入口, 前端不展示也不筛选 (放弃提案用 reject 替代)。
 * 后端没有置信度字段, 因此任何 AI 置信度都不渲染。
 */

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'stale';
/** 空字符串表示不按状态筛选 (后端缺省返回全部)。 */
export type ApprovalStatusFilter = ApprovalStatus | '';

export type ApprovalOperation =
  | 'card_create'
  | 'card_update'
  | 'card_trash'
  | 'card_restore'
  | 'card_merge'
  | 'topic_create'
  | 'topic_update'
  | 'topic_trash'
  | 'topic_restore'
  | 'glossary_create'
  | 'glossary_update'
  | 'glossary_trash'
  | 'glossary_restore';

export type ApprovalEntityType = 'topic' | 'card' | 'glossary';

/** 审批目标角色, 取自后端 target.role 常量。 */
export type ApprovalTargetRole = 'target' | 'topic' | 'affected_card' | 'source_1' | 'source_2';

export interface ApprovalTarget {
  entity_type: ApprovalEntityType;
  entity_id: number;
  base_version: number;
  role: ApprovalTargetRole;
}

export interface ApprovalListItem {
  id: number;
  operation: ApprovalOperation;
  entity_type: ApprovalEntityType;
  status: ApprovalStatus;
  requested_by_api_key_id: number | null;
  /**
   * 后端原样保存 CLI 提交的 JSON, 结构随 operation 不同, 因此先收窄为 unknown,
   * 由 payload 解析模块显式判定是不是对象后使用。非法或空串时后端返回 null。
   */
  original_payload: unknown;
  approved_payload: unknown;
  reason: string | null;
  created_at: string;
  processed_at: string | null;
}

/**
 * 详情响应比列表多 targets。后端用 `omitempty`, 列表响应里 targets 键
 * 完全不存在, 因此这里声明为可选而不是空数组。
 */
export interface ApprovalDetail extends ApprovalListItem {
  targets?: ApprovalTarget[];
}

export interface ApprovalsListParams {
  page: number;
  pageSize: number;
  status: ApprovalStatusFilter;
}

export const APPROVAL_STATUS_OPTIONS: { value: ApprovalStatus; label: string }[] = [
  { value: 'pending', label: '待审批' },
  { value: 'approved', label: '已批准' },
  { value: 'rejected', label: '已拒绝' },
  { value: 'stale', label: '已失效' }
];

export const buildApprovalsListPath = (params: ApprovalsListParams): string => {
  const search = new URLSearchParams({
    page: String(params.page),
    page_size: String(params.pageSize)
  });
  if (params.status !== '') search.set('status', params.status);
  return `/api/web/approvals?${search.toString()}`;
};

export const approvalsListQueryKey = (params: ApprovalsListParams) =>
  ['approvals', 'list', { page: params.page, pageSize: params.pageSize, status: params.status }] as const;

export const fetchApprovals = (
  params: ApprovalsListParams,
  signal?: AbortSignal
): Promise<PageResponse<ApprovalListItem>> =>
  apiRequest<PageResponse<ApprovalListItem>>(buildApprovalsListPath(params), { signal });

export const approvalsListQueryOptions = (params: ApprovalsListParams) =>
  queryOptions({
    queryKey: approvalsListQueryKey(params),
    queryFn: ({ signal }) => fetchApprovals(params, signal)
  });

export const approvalDetailQueryKey = (id: number) => ['approvals', 'detail', id] as const;

export const fetchApprovalDetail = (id: number, signal?: AbortSignal): Promise<ApprovalDetail> =>
  apiRequest<ApprovalDetail>(`/api/web/approvals/${id}`, { signal });

export const approvalDetailQueryOptions = (id: number) =>
  queryOptions({
    queryKey: approvalDetailQueryKey(id),
    queryFn: ({ signal }) => fetchApprovalDetail(id, signal),
    enabled: id > 0
  });

/**
 * 批准时 payload 可选: 不传表示按 original_payload 批准, 但后端要求请求体
 * 必须是合法 JSON, 真正的空 body 会返回 400。因此未修改时显式发送 `{}`。
 */
export interface ApproveApprovalInput {
  id: number;
  payload?: Record<string, unknown>;
}

export const approveApproval = (input: ApproveApprovalInput): Promise<ApprovalDetail> => {
  const body: Record<string, unknown> = input.payload === undefined ? {} : { payload: input.payload };
  return apiRequest<ApprovalDetail>(`/api/web/approvals/${input.id}/approve`, {
    method: 'POST',
    body
  });
};

export const approveApprovalMutationOptions = () =>
  mutationOptions({
    mutationFn: approveApproval
  });

export interface RejectApprovalInput {
  id: number;
  reason: string;
}

export const rejectApproval = (input: RejectApprovalInput): Promise<ApprovalDetail> =>
  apiRequest<ApprovalDetail>(`/api/web/approvals/${input.id}/reject`, {
    method: 'POST',
    body: { reason: input.reason }
  });

export const rejectApprovalMutationOptions = () =>
  mutationOptions({
    mutationFn: rejectApproval
  });

export interface ApprovalBatchResult {
  id: number;
  success: boolean;
  /** 仅 success=false 时存在, code 为后端错误码或 `stale`。 */
  error?: { code: string; message: string };
}

export interface ApprovalBatchResponse {
  results: ApprovalBatchResult[];
}

export const batchApproveApprovals = (ids: number[]): Promise<ApprovalBatchResponse> =>
  apiRequest<ApprovalBatchResponse>('/api/web/approvals/batch-approve', {
    method: 'POST',
    body: { ids }
  });

export const batchApproveApprovalsMutationOptions = () =>
  mutationOptions({
    mutationFn: batchApproveApprovals
  });

export const batchRejectApprovals = (input: {
  ids: number[];
  reason: string;
}): Promise<ApprovalBatchResponse> =>
  apiRequest<ApprovalBatchResponse>('/api/web/approvals/batch-reject', {
    method: 'POST',
    body: { ids: input.ids, reason: input.reason }
  });

export const batchRejectApprovalsMutationOptions = () =>
  mutationOptions({
    mutationFn: batchRejectApprovals
  });

/**
 * 来源 API Key 名称映射。后端审批响应只给出 requested_by_api_key_id,
 * 名称需用 API Key 列表补齐; 无法映射时页面回退显示 `API Key #<id>`。
 *
 * 这里没有复用 api/apiKeys.ts (该模块归 API Key 设置页维护),
 * 单用户数据量小, 一次取 100 条即可覆盖, 超出时由回退文案兜底。
 */
export interface ApprovalAPIKeyRef {
  id: number;
  name: string;
}

export const approvalAPIKeyNamesQueryOptions = () =>
  queryOptions({
    queryKey: ['approvals', 'api-key-names'] as const,
    queryFn: ({ signal }) =>
      apiRequest<PageResponse<ApprovalAPIKeyRef>>('/api/web/api-keys?page=1&page_size=100', { signal }),
    // API Key 很少变化, 缓存更久以减少审批列表的额外请求。
    staleTime: 5 * 60_000
  });
