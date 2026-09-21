import React from 'react';
import { getApiErrorMessage } from '../../api/client';
import { GeneralSettings, LogLevel, buildScopedSettingsPatch, generalOnlyKeys } from '../../api/settings';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/FormControls';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { SettingsFeedback } from './SettingsFeedback';
import { SettingsSection } from './SettingsSection';
import { Toggle } from './Toggle';
import { useSettingsSection } from './useSettingsSection';

const logLevelOptions: LogLevel[] = ['debug', 'info', 'warn', 'error'];

/**
 * 通用页包含日历时区、标准输出日志级别, 以及数据库日志配置
 * (日志查看器已独立为侧栏入口 /logs, 不在此页展示)。
 */
type GeneralDraft = Pick<
  GeneralSettings,
  'calendar_timezone' | 'stdout_log_level' | 'database_log_enabled' | 'database_log_level'
> & {
  // 保留天数与最大行数用字符串保存, 允许用户清空后重新输入。
  database_retention_days: string;
  database_max_rows: string;
};

const buildDraft = (settings: GeneralSettings): GeneralDraft => ({
  calendar_timezone: settings.calendar_timezone,
  stdout_log_level: settings.stdout_log_level,
  database_log_enabled: settings.database_log_enabled,
  database_log_level: settings.database_log_level,
  database_retention_days: String(settings.database_retention_days),
  database_max_rows: String(settings.database_max_rows)
});

const validate = (draft: GeneralDraft): string | undefined => {
  const retention = Number(draft.database_retention_days);
  const maxRows = Number(draft.database_max_rows);
  if (!Number.isInteger(retention) || retention <= 0 || !Number.isInteger(maxRows) || maxRows <= 0) {
    return '日志保留天数与最大行数必须是正整数';
  }
  return undefined;
};

const buildPatch = (draft: GeneralDraft, server: GeneralSettings) =>
  buildScopedSettingsPatch(
    {
      calendar_timezone: server.calendar_timezone,
      stdout_log_level: server.stdout_log_level,
      database_log_enabled: server.database_log_enabled,
      database_log_level: server.database_log_level,
      database_retention_days: server.database_retention_days,
      database_max_rows: server.database_max_rows
    },
    {
      calendar_timezone: draft.calendar_timezone,
      stdout_log_level: draft.stdout_log_level,
      database_log_enabled: draft.database_log_enabled,
      database_log_level: draft.database_log_level,
      database_retention_days: Number(draft.database_retention_days),
      database_max_rows: Number(draft.database_max_rows)
    },
    generalOnlyKeys
  );

export const GeneralSettingsPage: React.FC = () => {
  const {
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
  } = useSettingsSection<GeneralDraft>({
    buildDraft,
    buildPatch,
    validate,
    successText: '通用设置已保存'
  });

  if (settingsQuery.isPending) {
    return <LoadingState title="正在加载通用设置" description="正在读取日历与日志设置。" />;
  }
  if (settingsQuery.isError) {
    return (
      <ErrorState
        title="通用设置加载失败"
        description={getApiErrorMessage(settingsQuery.error)}
        onRetry={() => void settingsQuery.refetch()}
      />
    );
  }
  if (draft === null) {
    return <LoadingState title="正在准备通用设置" />;
  }

  const updateField = <K extends keyof GeneralDraft>(key: K, value: GeneralDraft[K]) =>
    updateDraft((current) => ({ ...current, [key]: value }));

  return (
    <SettingsSection
      title="通用"
      description="日历归属时区、标准输出日志级别与数据库日志配置。修改后只提交发生变化的字段；日志查看在左侧「日志查看」页。"
      actions={
        <Button type="button" isLoading={isSubmitting} disabled={!canSave} onClick={save}>
          保存通用设置
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-2">
          <Input
            label="日历时区"
            name="calendar_timezone"
            value={draft.calendar_timezone}
            disabled={isSubmitting}
            hint="IANA 时区名, 例如 Asia/Shanghai, 用于自然日归属。"
            onChange={(event) => updateField('calendar_timezone', event.target.value)}
          />
          <Select
            label="标准输出日志级别"
            name="stdout_log_level"
            value={draft.stdout_log_level}
            disabled={isSubmitting}
            onChange={(event) => updateField('stdout_log_level', event.target.value as LogLevel)}
          >
            {logLevelOptions.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </Select>
        </div>

        <div className="rounded-xl border border-outline-variant/35 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-body-sm font-semibold text-on-surface">写入数据库日志</p>
              <p className="mt-0.5 text-body-sm text-on-surface-variant">
                开启后关键日志会写入 app_log, 可在左侧「日志查看」页检索。
              </p>
            </div>
            <Toggle
              label="写入数据库日志"
              checked={draft.database_log_enabled}
              disabled={isSubmitting}
              onChange={(checked) => updateField('database_log_enabled', checked)}
            />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Select
              label="数据库日志级别"
              name="database_log_level"
              value={draft.database_log_level}
              disabled={isSubmitting}
              onChange={(event) => updateField('database_log_level', event.target.value as LogLevel)}
            >
              {logLevelOptions.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </Select>
            <Input
              label="日志保留天数"
              name="database_retention_days"
              type="number"
              min={1}
              value={draft.database_retention_days}
              disabled={isSubmitting}
              onChange={(event) => updateField('database_retention_days', event.target.value)}
            />
            <Input
              label="日志最大行数"
              name="database_max_rows"
              type="number"
              min={1}
              value={draft.database_max_rows}
              disabled={isSubmitting}
              onChange={(event) => updateField('database_max_rows', event.target.value)}
            />
          </div>
        </div>

        <SettingsFeedback
          validationError={validationError}
          fieldError={fieldError}
          submitError={submitError}
          successMessage={successMessage}
        />
      </div>
    </SettingsSection>
  );
};
