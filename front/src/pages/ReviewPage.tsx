import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ApiError, getApiErrorMessage } from '../api/client';
import {
  DueReviewItem,
  ReviewTopicFilter,
  reviewDueQueryKey,
  reviewDueQueryOptions,
  submitReviewMutationOptions
} from '../api/review';
import { topicsQueryOptions } from '../api/topics';
import { EmptyReview } from '../components/EmptyReview';
import { ReviewCardStage } from '../components/ReviewCardStage';
import { ReviewSummary } from '../components/ReviewSummary';
import { ConflictDialog } from '../components/ui/ConflictDialog';
import { ErrorState, LoadingState } from '../components/ui/States';
import { FSRSRating, RATING_SHORTCUT_MAP, ReviewSessionSummary } from '../types';

const createEmptySummary = (): ReviewSessionSummary => ({
  reviewedCount: 0,
  againCount: 0,
  hardCount: 0,
  goodCount: 0,
  easyCount: 0,
  averageTimeSeconds: 0,
  totalTimeSeconds: 0
});

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName;
  return (
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    target.isContentEditable ||
    target.closest('[contenteditable="true"]') !== null
  );
};

export const ReviewPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // null 表示全部 Topic, 0 表示请求无 Topic, 正整数表示具体 Topic.
  const [selectedTopicId, setSelectedTopicId] = useState<ReviewTopicFilter>(null);
  const [queue, setQueue] = useState<DueReviewItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [summary, setSummary] = useState<ReviewSessionSummary>(createEmptySummary);
  const [cardStartTime, setCardStartTime] = useState(() => Date.now());
  const [submitError, setSubmitError] = useState<string>();
  const [isConflictOpen, setIsConflictOpen] = useState(false);
  const submitLockRef = useRef(false);
  const loadedQueryResultRef = useRef('');

  const topicsQuery = useQuery(topicsQueryOptions());
  const dueQuery = useQuery(reviewDueQueryOptions(selectedTopicId));
  const submitMutation = useMutation(submitReviewMutationOptions());

  // 每次服务端返回新的队列对象时都重建本地会话. React Query 的 queryKey
  // 会隔离 Topic 请求, AbortSignal 则在旧查询不再需要时取消底层 fetch.
  useEffect(() => {
    if (dueQuery.data === undefined) return;
    const resultKey = `${selectedTopicId ?? 'all'}:${dueQuery.dataUpdatedAt}`;
    if (loadedQueryResultRef.current === resultKey) return;
    loadedQueryResultRef.current = resultKey;
    setQueue(dueQuery.data.items);
    setCurrentIndex(0);
    setIsRevealed(false);
    setIsFinished(false);
    setSummary(createEmptySummary());
    setCardStartTime(Date.now());
    setSubmitError(undefined);
    setIsConflictOpen(false);
    submitLockRef.current = false;
  }, [dueQuery.data, dueQuery.dataUpdatedAt, selectedTopicId]);

  const topicNameMap = useMemo(() => {
    const names = new Map<number, string>();
    topicsQuery.data?.items.forEach((topic) => names.set(topic.id, topic.name));
    return names;
  }, [topicsQuery.data]);

  const resetLocalSession = useCallback(() => {
    setQueue([]);
    setCurrentIndex(0);
    setIsRevealed(false);
    setIsFinished(false);
    setSummary(createEmptySummary());
    setCardStartTime(Date.now());
    setSubmitError(undefined);
    setIsConflictOpen(false);
    submitLockRef.current = false;
    submitMutation.reset();
  }, [submitMutation]);

  const reloadQueue = useCallback(async () => {
    resetLocalSession();
    await queryClient.invalidateQueries({ queryKey: reviewDueQueryKey(selectedTopicId) });
  }, [queryClient, resetLocalSession, selectedTopicId]);

  const handleTopicChange = useCallback(
    (value: string) => {
      resetLocalSession();
      setSelectedTopicId(value === '' ? null : Number(value));
    },
    [resetLocalSession]
  );

  const handleReveal = useCallback(() => {
    setSubmitError(undefined);
    setIsRevealed(true);
  }, []);

  const handleRate = useCallback(
    (rating: FSRSRating) => {
      const currentCard = queue[currentIndex];
      if (
        currentCard === undefined ||
        !isRevealed ||
        submitLockRef.current ||
        submitMutation.isPending
      ) {
        return;
      }

      // ref 锁在 React 提交下一次渲染前生效, 防止快速双击产生两个 mutation.
      submitLockRef.current = true;
      setSubmitError(undefined);
      const elapsedSeconds = (Date.now() - cardStartTime) / 1000;

      submitMutation.mutate(
        {
          cardId: currentCard.card_id,
          rating,
          expectedCardVersion: currentCard.card_version,
          expectedScheduleVersion: currentCard.schedule_version
        },
        {
          onSuccess: () => {
            setSummary((previous) => {
              const reviewedCount = previous.reviewedCount + 1;
              const totalTimeSeconds = previous.totalTimeSeconds + elapsedSeconds;
              return {
                reviewedCount,
                againCount: previous.againCount + (rating === 'again' ? 1 : 0),
                hardCount: previous.hardCount + (rating === 'hard' ? 1 : 0),
                goodCount: previous.goodCount + (rating === 'good' ? 1 : 0),
                easyCount: previous.easyCount + (rating === 'easy' ? 1 : 0),
                totalTimeSeconds,
                averageTimeSeconds: totalTimeSeconds / reviewedCount
              };
            });

            if (currentIndex + 1 < queue.length) {
              setCurrentIndex((index) => index + 1);
              setIsRevealed(false);
              setCardStartTime(Date.now());
            } else {
              setIsFinished(true);
            }
          },
          onError: (error: unknown) => {
            if (error instanceof ApiError && error.code === 'version_conflict') {
              setIsConflictOpen(true);
              setSubmitError('Card 或调度版本已经变化。请重新加载队列后再评分。');
              return;
            }
            setSubmitError(getApiErrorMessage(error));
          },
          onSettled: () => {
            submitLockRef.current = false;
          }
        }
      );
    }, [cardStartTime, currentIndex, isRevealed, queue, submitMutation]
  );

  const handleEscape = useCallback(() => {
    if (submitMutation.isPending) return;
    if (isConflictOpen) {
      setIsConflictOpen(false);
      return;
    }
    // 已确认的评分不能在前端回滚. Esc 只退出本地会话并重新读取服务端状态.
    void reloadQueue();
  }, [isConflictOpen, reloadQueue, submitMutation.isPending]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        handleEscape();
        return;
      }

      if (isFinished || queue.length === 0 || submitMutation.isPending) return;

      if (event.code === 'Space' || event.key === ' ') {
        event.preventDefault();
        if (!isRevealed) handleReveal();
        return;
      }

      if (isRevealed) {
        const rating = RATING_SHORTCUT_MAP[event.key];
        if (rating !== undefined) {
          event.preventDefault();
          handleRate(rating);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleEscape, handleRate, handleReveal, isFinished, isRevealed, queue.length, submitMutation.isPending]);

  const currentCard = queue[currentIndex];
  const returnedCount = dueQuery.data?.items.length ?? queue.length;
  const totalDue = dueQuery.data?.total ?? returnedCount;
  const completedCount = isFinished ? queue.length : currentIndex;
  const progressPercent = queue.length > 0 ? Math.round((completedCount / queue.length) * 100) : 0;
  const isReloading = dueQuery.isFetching;

  let content: React.ReactNode;
  if (topicsQuery.isPending) {
    content = <LoadingState title="正在加载 Topic" description="正在获取可用的复习范围。" />;
  } else if (topicsQuery.isError) {
    content = (
      <ErrorState
        title="Topic 加载失败"
        description={getApiErrorMessage(topicsQuery.error)}
        onRetry={() => void topicsQuery.refetch()}
      />
    );
  } else if (dueQuery.isPending || (isReloading && queue.length === 0)) {
    content = <LoadingState title="正在加载复习队列" description="正在获取当前到期卡片。" />;
  } else if (dueQuery.isError) {
    content = (
      <ErrorState
        title="复习队列加载失败"
        description={getApiErrorMessage(dueQuery.error)}
        onRetry={() => void dueQuery.refetch()}
      />
    );
  } else if (isFinished) {
    content = (
      <ReviewSummary
        summary={summary}
        onRestart={() => void reloadQueue()}
        isReloading={isReloading}
      />
    );
  } else if (queue.length === 0 || currentCard === undefined) {
    content = (
      <EmptyReview
        onGoCards={() => navigate('/cards')}
        onReload={() => void reloadQueue()}
        isReloading={isReloading}
      />
    );
  } else {
    content = (
      <ReviewCardStage
        card={currentCard}
        topicName={currentCard.topic_id === null ? undefined : topicNameMap.get(currentCard.topic_id)}
        isRevealed={isRevealed}
        isSubmitting={submitMutation.isPending}
        submitError={submitError}
        onReveal={handleReveal}
        onRate={handleRate}
      />
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col bg-surface lg:min-h-screen">
      <header className="sticky top-0 z-40 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-outline-variant/30 bg-surface-container-lowest/80 px-4 py-3 backdrop-blur-md sm:px-gutter">
        <div className="flex min-w-0 items-center gap-3">
          <div className="hidden items-center gap-2 sm:flex">
            <span className="material-symbols-outlined text-[20px] text-primary">filter_alt</span>
            <span className="font-mono text-[12px] uppercase tracking-wider text-on-surface-variant">
              复习范围
            </span>
          </div>
          <select
            aria-label="复习范围"
            value={selectedTopicId === null ? '' : String(selectedTopicId)}
            onChange={(event) => handleTopicChange(event.target.value)}
            disabled={submitMutation.isPending || topicsQuery.isError}
            className="max-w-[65vw] cursor-pointer rounded-lg border border-outline-variant/40 bg-surface-container-low px-3 py-1.5 text-[13px] font-medium text-on-surface transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-none"
          >
            <option value="">全部 Topic</option>
            {topicsQuery.data?.items.map((topic) => (
              <option key={topic.id} value={String(topic.id)}>
                {topic.name} ({topic.card_count})
              </option>
            ))}
            <option value="0">无 Topic</option>
          </select>
        </div>

        {!isFinished && queue.length > 0 && (
          <div className="hidden flex-col items-center md:flex">
            <div className="flex items-center gap-2 font-mono text-[12px] text-on-surface">
              <span>本轮</span>
              <span className="font-bold text-primary">{currentIndex + 1}</span>
              <span className="text-on-surface-variant">/ {queue.length}</span>
              {totalDue !== returnedCount && (
                <span className="text-on-surface-variant">· 到期共 {totalDue}</span>
              )}
            </div>
            <div className="mt-1 h-1.5 w-36 overflow-hidden rounded-full bg-surface-container-high">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-full border border-outline-variant/30 bg-surface-container-high/60 px-2.5 py-1 font-mono text-[11px] text-on-surface-variant xl:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-tertiary" />
            <span>Space 显示答案 · 1 Again · 2 Hard · 3 Good · 4 Easy · Esc 重新加载</span>
          </div>
          <button
            type="button"
            onClick={() => void reloadQueue()}
            disabled={submitMutation.isPending || isReloading}
            aria-label="重新加载队列"
            title="重新加载队列"
            className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-[20px] ${isReloading ? 'animate-spin' : ''}`}>
              {isReloading ? 'progress_activity' : 'refresh'}
            </span>
          </button>
        </div>
      </header>

      {!isFinished && queue.length > 0 && (
        <div className="h-1 w-full overflow-hidden bg-surface-container-high">
          <div
            className="h-full bg-primary-container transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      <main className="flex flex-1 flex-col justify-center px-4 py-8 sm:px-gutter">{content}</main>

      <footer className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-t border-outline-variant/20 bg-surface-container-lowest/50 px-4 py-2 font-mono text-[11px] text-on-surface-variant sm:px-gutter">
        <span>
          已加载 {returnedCount} 张{totalDue !== returnedCount ? ` / 到期共 ${totalDue} 张` : ''}
        </span>
        <span>Precision Cognition</span>
      </footer>

      <ConflictDialog
        open={isConflictOpen}
        title="复习版本冲突"
        description="Card 或调度版本已经变化，当前评分没有提交。请重新加载队列获取最新版本；系统不会自动重复提交。"
        closeLabel="保留当前卡片"
        reloadLabel="重新加载队列"
        onClose={() => setIsConflictOpen(false)}
        onReload={() => void reloadQueue()}
      />
    </div>
  );
};
