import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, getApiErrorMessage } from '../../api/client';
import {
  GeneralSettings,
  GeneralSettingsPatch,
  generalSettingsQueryKey,
  generalSettingsQueryOptions,
  updateGeneralSettingsMutationOptions
} from '../../api/settings';

export interface UseSettingsSectionOptions<D> {
  /** 由服务端完整设置构造本页草稿 (例如把数字字段转为字符串便于输入)。 */
  buildDraft: (settings: GeneralSettings) => D;
  /** 由草稿与服务端状态计算本页负责字段的差异。 */
  buildPatch: (draft: D, server: GeneralSettings) => GeneralSettingsPatch;
  /** 可选的前端校验, 返回错误文案表示不可提交。 */
  validate?: (draft: D) => string | undefined;
  /** 保存成功后的提示文案。 */
  successText: string;
}

/**
 * 三个基于 /api/web/settings 的设置页 (通用 / 审批开关 / 日志) 共享的表单逻辑:
 * 查询、草稿同步、范围化 diff、提交与错误反馈。各页只提交自己负责的字段,
 * 避免在其他页面上误改不属于该页的键。
 */
export const useSettingsSection = <D>({
  buildDraft,
  buildPatch,
  validate,
  successText
}: UseSettingsSectionOptions<D>) => {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery(generalSettingsQueryOptions());
  const updateMutation = useMutation(updateGeneralSettingsMutationOptions());

  const [draft, setDraft] = useState<D | null>(null);
  const [fieldError, setFieldError] = useState<string>();
  const [submitError, setSubmitError] = useState<string>();
  const [successMessage, setSuccessMessage] = useState<string>();

  const server = settingsQuery.data;

  useEffect(() => {
    if (server === undefined) return;
    // 只在服务端数据变化时重建草稿: 初始化, 以及每次保存成功覆盖缓存后的对齐。
    // buildDraft 每次渲染都是新引用, 故意不纳入依赖, 避免输入过程中草稿被重置。
    setDraft(buildDraft(server));
  }, [server]);

  const validationError = draft === null ? undefined : validate?.(draft);

  const patch = useMemo(() => {
    if (draft === null || server === undefined) return {};
    // buildPatch 每次渲染都是新引用, 保持简单重算 (代价很低)。
    return buildPatch(draft, server);
  }, [draft, server]);

  const isDirty = Object.keys(patch).length > 0;
  const isSubmitting = updateMutation.isPending;
  const canSave = server !== undefined && isDirty && validationError === undefined && !isSubmitting;

  const clearFeedback = () => {
    setFieldError(undefined);
    setSubmitError(undefined);
    setSuccessMessage(undefined);
  };

  const updateDraft = (updater: (current: D) => D) => {
    setDraft((current) => (current === null ? current : updater(current)));
    clearFeedback();
  };

  const save = () => {
    if (!canSave) return;
    clearFeedback();
    updateMutation.mutate(patch, {
      onSuccess: (settings) => {
        // 用服务端返回的完整设置覆盖缓存, 不在前端自行推算。
        queryClient.setQueryData(generalSettingsQueryKey, settings);
        setSuccessMessage(successText);
      },
      onError: (error: unknown) => {
        if (error instanceof ApiError && error.code === 'validation_error') {
          const field = error.details?.field;
          setFieldError(typeof field === 'string' ? `字段 ${field} 校验失败: ${error.message}` : error.message);
          return;
        }
        setSubmitError(getApiErrorMessage(error));
      }
    });
  };

  return {
    settingsQuery,
    draft,
    updateDraft,
    validationError,
    fieldError,
    submitError,
    successMessage,
    canSave,
    isSubmitting,
    save
  };
};
