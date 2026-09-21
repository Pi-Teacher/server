import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getApiErrorMessage } from '../../api/client';
import { AppLogItem, LogsListParams, logsListQueryOptions } from '../../api/logs';
import { LogLevel } from '../../api/settings';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Pagination } from '../../components/ui/Pagination';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { SettingsSection } from './SettingsSection';

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 300;

const levelTone: Record<LogLevel, 'neutral' | 'primary' | 'warning' | 'danger'> = {
  debug: 'neutral',
  info: 'primary',
  warn: 'warning',
  error: 'danger'
};

const formatDateTime = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const LogRow: React.FC<{ item: AppLogItem }> = ({ item }) => {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = item.details !== null && item.details !== '';
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={levelTone[item.level]}>{item.level}</Badge>
        <code className="font-mono text-[12px] text-primary">{item.event}</code>
        <span className="font-mono text-[11px] text-on-surface-variant">{formatDateTime(item.logged_at)}</span>
      </div>
      <p className="mt-1 break-words text-body-sm text-on-surface">{item.message}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-on-surface-variant">
        {/* 后端无值的字段输出 null, 前端不渲染占位。 */}
        {item.source !== null && <span>source: {item.source}</span>}
        {item.entity_type !== null && (
          <span>
            entity: {item.entity_type}
            {item.entity_id !== null ? ` #${item.entity_id}` : ''}
          </span>
        )}
        {item.request_id !== null && <span>request_id: {item.request_id}</span>}
        {hasDetails && (
          <button
            type="button"
            className="text-primary underline decoration-primary/30 underline-offset-2"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? '收起 details' : '展开 details'}
          </button>
        )}
      </div>
      {expanded && hasDetails && (
        <pre className="mt-2 overflow-x-auto rounded-lg border border-outline-variant/40 bg-surface-container-low p-3 font-mono text-[12px] text-on-surface">
          {item.details}
        </pre>
      )}
    </li>
  );
};

export const LogsPanel: React.FC = () => {
  const [level, setLevel] = useState<LogLevel | ''>('');
  const [eventInput, setEventInput] = useState('');
  const [requestIdInput, setRequestIdInput] = useState('');
  const [debouncedEvent, setDebouncedEvent] = useState('');
  const [debouncedRequestId, setDebouncedRequestId] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedEvent(eventInput);
      setDebouncedRequestId(requestIdInput);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [eventInput, requestIdInput]);

  const params = useMemo<LogsListParams>(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      level,
      event: debouncedEvent,
      requestId: debouncedRequestId
    }),
    [debouncedEvent, debouncedRequestId, level, page]
  );

  const logsQuery = useQuery(logsListQueryOptions(params));

  const resetToFirstPage = () => setPage(1);

  const handleLevelChange = (value: LogLevel | '') => {
    setLevel(value);
    resetToFirstPage();
  };
  const handleReset = () => {
    setLevel('');
    setEventInput('');
    setRequestIdInput('');
    setDebouncedEvent('');
    setDebouncedRequestId('');
    resetToFirstPage();
  };

  const controlClassName =
    'h-10 rounded-xl border border-outline-variant/60 bg-surface-container-lowest px-3 text-[13px] text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60';

  return (
    <SettingsSection
      title="运行日志"
      description="查询写入 app_log 的关键事件。级别、事件名与 request_id 均为精确匹配，事件名不做子串匹配。"
      actions={
        <Button
          variant="secondary"
          onClick={() => void logsQuery.refetch()}
          disabled={logsQuery.isFetching}
          isLoading={logsQuery.isFetching}
        >
          刷新日志
        </Button>
      }
    >
      <div className="grid gap-3 lg:grid-cols-[10rem_1fr_1fr_auto]">
        <label className="block">
          <span className="text-label-md text-on-surface">级别</span>
          <select
            aria-label="日志级别"
            value={level}
            onChange={(event) => handleLevelChange(event.target.value as LogLevel | '')}
            className={`mt-2 w-full ${controlClassName}`}
          >
            <option value="">全部</option>
            <option value="debug">debug</option>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
          </select>
        </label>
        <label className="block">
          <span className="text-label-md text-on-surface">事件名</span>
          <input
            aria-label="事件名"
            type="text"
            value={eventInput}
            placeholder="card_created"
            onChange={(event) => {
              setEventInput(event.target.value);
              resetToFirstPage();
            }}
            className={`mt-2 w-full ${controlClassName}`}
          />
        </label>
        <label className="block">
          <span className="text-label-md text-on-surface">Request ID</span>
          <input
            aria-label="Request ID"
            type="text"
            value={requestIdInput}
            placeholder="精确匹配"
            onChange={(event) => {
              setRequestIdInput(event.target.value);
              resetToFirstPage();
            }}
            className={`mt-2 w-full ${controlClassName}`}
          />
        </label>
        <div className="flex items-end">
          <Button variant="ghost" onClick={handleReset}>
            重置筛选
          </Button>
        </div>
      </div>

      <div className="mt-4">
        {logsQuery.isPending ? (
          <LoadingState title="正在加载日志" description="正在读取 app_log 记录。" />
        ) : logsQuery.isError ? (
          <ErrorState
            title="日志加载失败"
            description={getApiErrorMessage(logsQuery.error)}
            onRetry={() => void logsQuery.refetch()}
          />
        ) : logsQuery.data.items.length === 0 ? (
          <EmptyState
            title="暂无日志记录"
            description="当前筛选条件下没有日志。可在通用设置中开启数据库日志后等待新事件写入。"
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 font-mono text-[11px] text-on-surface-variant">
              <span>
                当前页 {logsQuery.data.items.length} 条，筛选结果共 {logsQuery.data.total} 条
              </span>
            </div>
            <ul className="mt-2 divide-y divide-outline-variant/25">
              {logsQuery.data.items.map((item) => (
                <LogRow key={item.id} item={item} />
              ))}
            </ul>
            <div className="mt-4">
              <Pagination
                page={logsQuery.data.page}
                pageSize={logsQuery.data.page_size}
                total={logsQuery.data.total}
                onPageChange={setPage}
              />
            </div>
          </>
        )}
      </div>
    </SettingsSection>
  );
};
