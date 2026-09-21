import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  CardCheckCoverage,
  CardCheckMatch,
  checkCardMutationOptions
} from '../../api/cards';
import { ApiError, getApiErrorMessage } from '../../api/client';
import { Button } from '../../components/ui/Button';

interface CardCheckPanelProps {
  front: string;
  enableEmbedding: boolean;
  disabled?: boolean;
}

const formatSimilarity = (value: number): string => `${(value * 100).toFixed(1)}%`;

const topicLabel = (topicId: number | null): string => (topicId === null ? '无 Topic' : `Topic #${topicId}`);

const CoverageSummary: React.FC<{ coverage: CardCheckCoverage }> = ({ coverage }) => (
  <div className="grid grid-cols-2 gap-2 rounded-xl border border-outline-variant/35 bg-surface-container-low p-3 text-[12px] sm:grid-cols-3">
    <div>
      <span className="block text-on-surface-variant">启用总数</span>
      <strong className="mt-1 block font-mono text-on-surface">{coverage.total_enabled}</strong>
    </div>
    <div>
      <span className="block text-on-surface-variant">已就绪</span>
      <strong className="mt-1 block font-mono text-tertiary">{coverage.ready}</strong>
    </div>
    <div>
      <span className="block text-on-surface-variant">就绪比例</span>
      <strong className="mt-1 block font-mono text-primary">{coverage.ready_percent.toFixed(1)}%</strong>
    </div>
    <div>
      <span className="block text-on-surface-variant">待处理</span>
      <strong className="mt-1 block font-mono text-on-surface">{coverage.pending}</strong>
    </div>
    <div>
      <span className="block text-on-surface-variant">处理中</span>
      <strong className="mt-1 block font-mono text-on-surface">{coverage.processing}</strong>
    </div>
    <div>
      <span className="block text-on-surface-variant">失败</span>
      <strong className="mt-1 block font-mono text-error">{coverage.failed}</strong>
    </div>
  </div>
);

const MatchItem: React.FC<{ match: CardCheckMatch; semantic: boolean }> = ({ match, semantic }) => (
  <li className="rounded-xl border border-outline-variant/35 bg-surface-container-lowest p-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <span className="font-mono text-[11px] text-on-surface-variant">Card #{match.id}</span>
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[11px] text-on-surface-variant">
          {topicLabel(match.topic_id)}
        </span>
        {semantic && match.similarity !== undefined && (
          <span className="rounded-full bg-primary-fixed px-2 py-0.5 font-mono text-[11px] font-semibold text-on-primary-fixed">
            {formatSimilarity(match.similarity)}
          </span>
        )}
      </div>
    </div>
    <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-[13px] font-semibold leading-5 text-on-surface">
      {match.front}
    </p>
    <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[12px] leading-5 text-on-surface-variant">
      {match.back}
    </p>
  </li>
);

export const CardCheckPanel: React.FC<CardCheckPanelProps> = ({
  front,
  enableEmbedding,
  disabled = false
}) => {
  const checkMutation = useMutation(checkCardMutationOptions());
  const [topK, setTopK] = useState('5');

  const handleCheck = () => {
    if (checkMutation.isPending || disabled || front.trim() === '') return;
    const parsedTopK = Number(topK);
    checkMutation.mutate({
      front,
      enableEmbedding,
      ...(enableEmbedding && topK.trim() !== '' && Number.isInteger(parsedTopK)
        ? { topK: parsedTopK }
        : {})
    });
  };

  const error = checkMutation.error;
  const coverage =
    error instanceof ApiError && error.code === 'similarity_disabled' &&
    error.details?.coverage !== undefined &&
    typeof error.details.coverage === 'object' &&
    error.details.coverage !== null
      ? (error.details.coverage as CardCheckCoverage)
      : undefined;

  return (
    <section className="rounded-xl border border-secondary/20 bg-secondary/5 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-[14px] font-semibold text-on-surface">查重</h3>
          <p className="mt-1 text-[12px] leading-5 text-on-surface-variant">
            所有请求先执行 exact 查重。{enableEmbedding ? '没有完全重复时，再进行 semantic 比对。' : '未启用 Embedding 时不会继续进行 semantic 比对。'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {enableEmbedding && (
            <label className="flex items-center gap-2 text-[12px] text-on-surface-variant">
              <span>Top K</span>
              <input
                aria-label="查重 Top K"
                type="number"
                min={1}
                max={50}
                value={topK}
                disabled={disabled || checkMutation.isPending}
                onChange={(event) => setTopK(event.target.value)}
                className="h-9 w-16 rounded-lg border border-outline-variant/60 bg-surface-container-lowest px-2 text-center font-mono text-[12px] text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </label>
          )}
          <Button
            type="button"
            variant="secondary"
            isLoading={checkMutation.isPending}
            disabled={disabled || front.trim() === ''}
            onClick={handleCheck}
          >
            {!checkMutation.isPending && <span aria-hidden="true" className="material-symbols-outlined text-[17px]">fact_check</span>}
            开始查重
          </Button>
        </div>
      </div>

      {checkMutation.isError && (
        <div role="alert" className="mt-3 rounded-xl border border-error/25 bg-error-container px-3 py-2.5 text-[12px] leading-5 text-on-error-container">
          {getApiErrorMessage(error)}
          {error instanceof ApiError && error.code === 'similarity_disabled' && (
            <span className="mt-1 block">当前没有精确重复，语义查重暂不可用。</span>
          )}
          {error instanceof ApiError && error.code === 'embedding_unavailable' && (
            <span className="mt-1 block">当前没有精确重复，无法生成查询向量。</span>
          )}
          {coverage !== undefined && (
            <div className="mt-3">
              <CoverageSummary coverage={coverage} />
            </div>
          )}
        </div>
      )}

      {checkMutation.data !== undefined && (
        <div className="mt-4 space-y-3" role="region" aria-label="查重结果">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">
                {checkMutation.data.match_type === 'exact' ? 'Exact 结果' : 'Semantic 结果'}
              </span>
              <p className="mt-1 text-[12px] text-on-surface-variant">
                {checkMutation.data.matches.length === 0
                  ? checkMutation.data.match_type === 'exact'
                    ? '没有发现完全重复的 Card。'
                    : '没有返回语义相似候选。'
                  : `发现 ${checkMutation.data.matches.length} 个候选。`}
              </p>
            </div>
            {checkMutation.data.match_type === 'exact' && (
              <span className="rounded-full bg-fsrs-hard-bg px-2.5 py-1 font-mono text-[11px] text-fsrs-hard-text">
                完全重复，已停止继续查重
              </span>
            )}
          </div>

          {checkMutation.data.coverage !== undefined && (
            <CoverageSummary coverage={checkMutation.data.coverage} />
          )}

          {checkMutation.data.matches.length > 0 && (
            <ul className="space-y-2">
              {checkMutation.data.matches.map((match) => (
                <MatchItem
                  key={match.id}
                  match={match}
                  semantic={checkMutation.data?.match_type === 'semantic'}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};
