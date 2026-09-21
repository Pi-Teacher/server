import { ApiError, getApiErrorMessage } from '../../api/client';
import { TrashKind } from '../../api/trash';

/** 回收站对象的用户可见名称前缀。 */
export const trashKindLabel: Record<TrashKind, string> = {
  cards: 'Card',
  topics: 'Topic',
  glossary: '术语'
};

/**
 * 按错误码翻译回收站写操作的错误。
 * 恢复 Topic/Glossary 遇到 name_conflict 是业务提示而非系统故障, 单独说明。
 */
export const describeTrashErrorCode = (code: string, message: string): string => {
  switch (code) {
    case 'version_conflict':
      return `版本冲突: ${message}`;
    case 'not_found':
      return `对象不存在或已不在回收站: ${message}`;
    case 'name_conflict':
      return `同名正常对象已存在: ${message}`;
    case 'validation_error':
      return `请求校验失败: ${message}`;
    default:
      return message;
  }
};

export const trashErrorMessage = (error: unknown): string | undefined => {
  if (error === undefined) return undefined;
  if (error instanceof ApiError) return describeTrashErrorCode(error.code, error.message);
  return getApiErrorMessage(error);
};

// 批量恢复 / 永久删除是整批事务: 任一项失败整批回滚, 后端在 details.index
// (0 起) 给出失败项下标。前端据此定位到具体对象, 而不是笼统报“操作失败”。
export const batchFailureIndex = (error: unknown): number | undefined => {
  if (error instanceof ApiError) {
    const index = error.details?.index;
    if (typeof index === 'number') return index;
  }
  return undefined;
};

export const batchTrashErrorMessage = (
  error: unknown,
  itemIds: readonly number[],
  kind: TrashKind
): string | undefined => {
  const base = trashErrorMessage(error);
  if (base === undefined) return undefined;
  const index = batchFailureIndex(error);
  if (index === undefined) return base;
  const id = itemIds[index];
  const target =
    id === undefined
      ? `批量项目 ${index + 1}`
      : `批量项目 ${index + 1}（${trashKindLabel[kind]} #${id}）`;
  return `${target}：${base}`;
};
