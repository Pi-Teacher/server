import { describe, expect, it } from 'vitest';
import { buildReviewDuePath } from './review';

describe('buildReviewDuePath', () => {
  it('全部 Topic 不传 topic_id', () => {
    const url = new URL(buildReviewDuePath(null), 'http://localhost');
    expect(url.searchParams.has('topic_id')).toBe(false);
    expect(url.searchParams.get('limit')).toBe('100');
  });

  it('具体 Topic 传正整数', () => {
    const url = new URL(buildReviewDuePath(12), 'http://localhost');
    expect(url.searchParams.get('topic_id')).toBe('12');
  });

  it('无 Topic 传 topic_id=0', () => {
    const url = new URL(buildReviewDuePath(0), 'http://localhost');
    expect(url.searchParams.get('topic_id')).toBe('0');
  });

  it('到期总数查询使用 limit=1 且不带 topic_id', () => {
    const url = new URL(buildReviewDuePath(null, 1), 'http://localhost');
    expect(url.searchParams.get('limit')).toBe('1');
    expect(url.searchParams.has('topic_id')).toBe(false);
  });
});
