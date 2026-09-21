import { mutationOptions, queryOptions } from '@tanstack/react-query';
import { apiRequest } from './client';

/**
 * 通用设置 (/api/web/settings)。
 *
 * 后端只暴露 approval / calendar / log 三组 key, embedding 与 user_profile
 * 各有独立资源端点, 因此这里只声明通用端点实际返回的 18 个字段, 不多声明。
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface GeneralSettings {
  // 13 个 CLI 审批开关, 默认全部开启。
  enable_cli_card_create_approval: boolean;
  enable_cli_card_update_approval: boolean;
  enable_cli_card_trash_approval: boolean;
  enable_cli_card_restore_approval: boolean;
  enable_cli_card_merge_approval: boolean;
  enable_cli_topic_create_approval: boolean;
  enable_cli_topic_update_approval: boolean;
  enable_cli_topic_trash_approval: boolean;
  enable_cli_topic_restore_approval: boolean;
  enable_cli_glossary_create_approval: boolean;
  enable_cli_glossary_update_approval: boolean;
  enable_cli_glossary_trash_approval: boolean;
  enable_cli_glossary_restore_approval: boolean;
  /** IANA 时区名, 例如 Asia/Shanghai。 */
  calendar_timezone: string;
  stdout_log_level: LogLevel;
  database_log_enabled: boolean;
  database_log_level: LogLevel;
  database_retention_days: number;
  database_max_rows: number;
}

/** PATCH 请求体只包含实际修改的字段。 */
export type GeneralSettingsPatch = Partial<GeneralSettings>;

/** 13 个 CLI 审批开关键名, 由"审批开关控制"页面独占管理。 */
export const approvalSwitchKeys = [
  'enable_cli_card_create_approval',
  'enable_cli_card_update_approval',
  'enable_cli_card_trash_approval',
  'enable_cli_card_restore_approval',
  'enable_cli_card_merge_approval',
  'enable_cli_topic_create_approval',
  'enable_cli_topic_update_approval',
  'enable_cli_topic_trash_approval',
  'enable_cli_topic_restore_approval',
  'enable_cli_glossary_create_approval',
  'enable_cli_glossary_update_approval',
  'enable_cli_glossary_trash_approval',
  'enable_cli_glossary_restore_approval'
] as const;

export type ApprovalSwitchKey = (typeof approvalSwitchKeys)[number];

/**
 * "通用"页面管理的字段: 日历归属时区、标准输出日志级别, 以及数据库日志配置。
 * 数据库日志设置已并入通用页; 日志查看器独立为侧栏入口 `/logs`。
 */
export const generalOnlyKeys = [
  'calendar_timezone',
  'stdout_log_level',
  'database_log_enabled',
  'database_log_level',
  'database_retention_days',
  'database_max_rows'
] as const;

interface SettingsResponse {
  settings: GeneralSettings;
}

export const generalSettingsQueryKey = ['settings', 'general'] as const;

export const fetchGeneralSettings = (signal?: AbortSignal): Promise<GeneralSettings> =>
  apiRequest<SettingsResponse>('/api/web/settings', { signal }).then((response) => response.settings);

export const generalSettingsQueryOptions = () =>
  queryOptions({
    queryKey: generalSettingsQueryKey,
    queryFn: ({ signal }) => fetchGeneralSettings(signal)
  });

/**
 * PATCH /api/web/settings。请求体即"要修改的 key 子集", 后端成功返回完整设置,
 * 这里直接取 settings 交给页面覆盖缓存。
 */
export const updateGeneralSettings = (
  patch: GeneralSettingsPatch
): Promise<GeneralSettings> =>
  apiRequest<SettingsResponse>('/api/web/settings', {
    method: 'PATCH',
    body: patch
  }).then((response) => response.settings);

export const updateGeneralSettingsMutationOptions = () =>
  mutationOptions({
    mutationFn: updateGeneralSettings
  });

/**
 * 计算服务端状态与编辑草稿之间的差异, 只返回被改动的字段。
 * 后端 PATCH 语义是增量, 提交未修改字段虽不报错但会掩盖真实意图,
 * 因此前端先 diff, 保证请求体最小且可观测。
 */
export const buildGeneralSettingsPatch = (
  server: GeneralSettings,
  draft: GeneralSettings
): GeneralSettingsPatch => diffSettings(server, draft);

/**
 * 在给定 key 子集上做差异比较。各设置页面只提交自己负责的字段,
 * 避免在其他页面上误改不属于该页的键。
 */
export const buildScopedSettingsPatch = <K extends keyof GeneralSettings>(
  server: Pick<GeneralSettings, K>,
  draft: Pick<GeneralSettings, K>,
  keys: readonly K[]
): Partial<Pick<GeneralSettings, K>> => {
  const patch: Partial<Pick<GeneralSettings, K>> = {};
  keys.forEach((key) => {
    if (draft[key] !== server[key]) {
      patch[key] = draft[key];
    }
  });
  return patch;
};

const diffSettings = (
  server: GeneralSettings,
  draft: GeneralSettings
): GeneralSettingsPatch => {
  const patch: GeneralSettingsPatch = {};
  (Object.keys(draft) as (keyof GeneralSettings)[]).forEach((key) => {
    if (draft[key] !== server[key]) {
      // 逐字段比较后逐个赋值, 避免整体展开时把未修改字段也带进请求体。
      patch[key] = draft[key] as never;
    }
  });
  return patch;
};
