import { ApiError, getApiErrorMessage } from '../../api/client';

/**
 * 批准/拒绝与批量结果的错误码文案。
 * 批量结果里的 error.code 与单条请求的错误码一致 (含后端约定的 `stale`),
 * 集中一处避免各弹窗文案漂移。
 */
export const describeApprovalErrorCode = (code: string, message: string): string => {
  switch (code) {
    case 'approval_not_pending':
      return '该提案已被处理, 请刷新列表查看最新状态。';
    case 'stale':
      return `目标已变化, 该提案已失效, 未执行修改${message !== '' ? `（${message}）` : ''}`;
    case 'not_found':
      return '提案不存在, 可能已被删除。';
    case 'name_conflict':
      return `名称已被占用, 提案保持待审批: ${message}`;
    case 'version_conflict':
      return `版本冲突, 提案保持待审批: ${message}`;
    case 'validation_error':
      return `请求校验失败: ${message}`;
    case 'internal_error':
      return `服务端内部错误: ${message}`;
    default:
      return message !== '' ? message : code;
  }
};

/** 单条请求错误的用户文案。 */
export const describeApprovalError = (error: unknown): string => {
  if (error instanceof ApiError) return describeApprovalErrorCode(error.code, error.message);
  return getApiErrorMessage(error);
};
