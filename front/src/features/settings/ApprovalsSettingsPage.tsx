import React from 'react';
import { getApiErrorMessage } from '../../api/client';
import { GeneralSettings, approvalSwitchKeys } from '../../api/settings';
import { Button } from '../../components/ui/Button';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { SettingsFeedback } from './SettingsFeedback';
import { SettingsSection } from './SettingsSection';
import { Toggle } from './Toggle';
import { approvalGroups } from './approvalGroups';
import { useSettingsSection } from './useSettingsSection';

/** 审批开关页只负责 13 个 CLI 审批开关。 */
type ApprovalDraft = Record<(typeof approvalSwitchKeys)[number], boolean>;

const buildDraft = (settings: GeneralSettings): ApprovalDraft =>
  approvalSwitchKeys.reduce((draft, key) => {
    draft[key] = settings[key];
    return draft;
  }, {} as ApprovalDraft);

const buildPatch = (draft: ApprovalDraft, server: GeneralSettings) => {
  const patch: Partial<Record<keyof ApprovalDraft, boolean>> = {};
  approvalSwitchKeys.forEach((key) => {
    if (draft[key] !== server[key]) patch[key] = draft[key];
  });
  return patch;
};

export const ApprovalsSettingsPage: React.FC = () => {
  const { settingsQuery, draft, updateDraft, fieldError, submitError, successMessage, canSave, isSubmitting, save } =
    useSettingsSection<ApprovalDraft>({
      buildDraft,
      buildPatch,
      successText: '审批开关已保存'
    });

  if (settingsQuery.isPending) {
    return <LoadingState title="正在加载审批开关" description="正在读取 CLI 审批开关状态。" />;
  }
  if (settingsQuery.isError) {
    return (
      <ErrorState
        title="审批开关加载失败"
        description={getApiErrorMessage(settingsQuery.error)}
        onRetry={() => void settingsQuery.refetch()}
      />
    );
  }
  if (draft === null) {
    return <LoadingState title="正在准备审批开关" />;
  }

  return (
    <SettingsSection
      title="CLI 审批开关"
      description="开启表示 CLI 的对应操作会先进入审批队列；关闭后直接写入。修改后只提交发生变化的开关。"
      actions={
        <Button type="button" isLoading={isSubmitting} disabled={!canSave} onClick={save}>
          保存审批开关
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="space-y-3">
          {approvalGroups.map((group) => (
            <div key={group.title} className="rounded-xl border border-outline-variant/35 p-3">
              <p className="font-mono text-label-sm uppercase tracking-widest text-primary">{group.title}</p>
              <ul className="mt-2 divide-y divide-outline-variant/25">
                {group.items.map((item) => (
                  <li key={item.key} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-body-sm text-on-surface">{item.label}</span>
                    <Toggle
                      label={item.label}
                      checked={Boolean(draft[item.key])}
                      disabled={isSubmitting}
                      onChange={(checked) => updateDraft((current) => ({ ...current, [item.key]: checked }))}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <SettingsFeedback fieldError={fieldError} submitError={submitError} successMessage={successMessage} />
      </div>
    </SettingsSection>
  );
};
