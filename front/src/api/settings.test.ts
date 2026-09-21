import { describe, expect, it } from 'vitest';
import { GeneralSettings, buildGeneralSettingsPatch } from './settings';

const server: GeneralSettings = {
  enable_cli_card_create_approval: true,
  enable_cli_card_update_approval: true,
  enable_cli_card_trash_approval: true,
  enable_cli_card_restore_approval: true,
  enable_cli_card_merge_approval: true,
  enable_cli_topic_create_approval: true,
  enable_cli_topic_update_approval: true,
  enable_cli_topic_trash_approval: true,
  enable_cli_topic_restore_approval: true,
  enable_cli_glossary_create_approval: true,
  enable_cli_glossary_update_approval: true,
  enable_cli_glossary_trash_approval: true,
  enable_cli_glossary_restore_approval: true,
  calendar_timezone: 'UTC',
  stdout_log_level: 'info',
  database_log_enabled: false,
  database_log_level: 'info',
  database_retention_days: 30,
  database_max_rows: 10000
};

describe('buildGeneralSettingsPatch', () => {
  it('无差异时返回空对象', () => {
    expect(buildGeneralSettingsPatch(server, { ...server })).toEqual({});
  });

  it('只包含被修改的字段', () => {
    const patch = buildGeneralSettingsPatch(server, {
      ...server,
      enable_cli_card_create_approval: false,
      database_max_rows: 5000
    });
    expect(patch).toEqual({
      enable_cli_card_create_approval: false,
      database_max_rows: 5000
    });
  });

  it('布尔 false 与数字 0 差异也能被识别', () => {
    const patch = buildGeneralSettingsPatch(
      { ...server, database_log_enabled: true },
      { ...server, database_log_enabled: false }
    );
    expect(patch).toEqual({ database_log_enabled: false });
  });
});

describe('buildScopedSettingsPatch', () => {
  const scopeFixture = {
    calendar_timezone: 'UTC',
    stdout_log_level: 'info' as const,
    database_log_enabled: false,
    database_log_level: 'info' as const,
    database_retention_days: 30,
    database_max_rows: 10000
  };

  it('只比较并返回指定 key 子集的差异', async () => {
    const { buildScopedSettingsPatch, generalOnlyKeys } = await import('./settings');
    const patch = buildScopedSettingsPatch(
      scopeFixture,
      { ...scopeFixture, calendar_timezone: 'Asia/Shanghai' },
      generalOnlyKeys
    );
    expect(patch).toEqual({ calendar_timezone: 'Asia/Shanghai' });
  });

  it('子集无差异时返回空对象', async () => {
    const { buildScopedSettingsPatch, generalOnlyKeys } = await import('./settings');
    const patch = buildScopedSettingsPatch(
      scopeFixture,
      { ...scopeFixture, database_log_level: 'warn' as const },
      generalOnlyKeys
    );
    expect(patch).toEqual({ database_log_level: 'warn' });
  });
});
