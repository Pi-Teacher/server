import { describe, expect, it } from 'vitest';
import { LogsListParams, buildLogsListPath } from './logs';

const base: LogsListParams = {
  page: 2,
  pageSize: 20,
  level: '',
  event: '',
  requestId: ''
};

describe('buildLogsListPath', () => {
  it('空筛选只带分页参数', () => {
    const url = new URL(buildLogsListPath(base), 'http://localhost');
    expect(url.pathname).toBe('/api/web/logs');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('page_size')).toBe('20');
    expect(url.searchParams.has('level')).toBe(false);
    expect(url.searchParams.has('event')).toBe(false);
    expect(url.searchParams.has('request_id')).toBe(false);
  });

  it('带筛选时编码 level/event/request_id', () => {
    const url = new URL(
      buildLogsListPath({ ...base, level: 'error', event: 'card_created', requestId: 'abc123' }),
      'http://localhost'
    );
    expect(url.searchParams.get('level')).toBe('error');
    expect(url.searchParams.get('event')).toBe('card_created');
    expect(url.searchParams.get('request_id')).toBe('abc123');
  });
});
