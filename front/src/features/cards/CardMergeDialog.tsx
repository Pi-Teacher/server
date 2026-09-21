import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CardDetail,
  cardDetailQueryOptions,
  mergeCardsMutationOptions
} from '../../api/cards';
import { ApiError, getApiErrorMessage } from '../../api/client';
import { Topic } from '../../api/topics';
import { MarkdownRenderer } from '../../components/MarkdownRenderer';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Select, Textarea } from '../../components/ui/FormControls';
import { ErrorState, LoadingState } from '../../components/ui/States';

interface CardMergeDialogProps {
  open: boolean;
  sourceCardIds: [number, number] | null;
  topics: Topic[];
  onClose: () => void;
  onMerged: (card: CardDetail) => void;
}

// 后端没有 "inherit" 这类语义: topic_id 与 enable_embedding 要么缺省,
// 要么显式给出具体值. 这里统一改为客户端始终推导并提交显式值:
// 两张来源卡一致时预选该共同值, 不一致时必须让用户明确选择.
type TopicSelection = 'unset' | 'none' | `topic:${number}`;
type EmbeddingSelection = 'unset' | 'enabled' | 'disabled';

interface MergeValues {
  front: string;
  back: string;
  topicSelection: TopicSelection;
  embeddingSelection: EmbeddingSelection;
}

const EMPTY_VALUES: MergeValues = {
  front: '',
  back: '',
  topicSelection: 'unset',
  embeddingSelection: 'unset'
};

const topicValue = (topicId: number | null): TopicSelection =>
  topicId === null ? 'none' : `topic:${topicId}`;

const defaultTopicSelection = (first: CardDetail, second: CardDetail): TopicSelection =>
  first.topic_id === second.topic_id ? topicValue(first.topic_id) : 'unset';

const defaultEmbeddingSelection = (first: CardDetail, second: CardDetail): EmbeddingSelection =>
  first.enable_embedding === second.enable_embedding
    ? first.enable_embedding
      ? 'enabled'
      : 'disabled'
    : 'unset';

const sourceContent = (first: CardDetail, second: CardDetail) => ({
  front: `Q1: ${first.front}\nQ2: ${second.front}`,
  back: `Q1: ${first.back}\nQ2: ${second.back}`
});

const topicSelectionLabel = (selection: TopicSelection, topics: Topic[]): string => {
  if (selection === 'unset') return '未选择';
  if (selection === 'none') return '无 Topic';
  const id = Number(selection.slice('topic:'.length));
  return topics.find((topic) => topic.id === id)?.name ?? `Topic #${id}`;
};

export const CardMergeDialog: React.FC<CardMergeDialogProps> = ({
  open,
  sourceCardIds,
  topics,
  onClose,
  onMerged
}) => {
  const queryClient = useQueryClient();
  const firstQuery = useQuery(cardDetailQueryOptions(open && sourceCardIds !== null ? sourceCardIds[0] : 0));
  const secondQuery = useQuery(cardDetailQueryOptions(open && sourceCardIds !== null ? sourceCardIds[1] : 0));
  const mergeMutation = useMutation(mergeCardsMutationOptions());
  const [values, setValues] = useState<MergeValues>(EMPTY_VALUES);
  const [submitError, setSubmitError] = useState<string>();
  const [previewSide, setPreviewSide] = useState<'front' | 'back'>('front');
  const appliedSourceRef = useRef<string>('');

  useEffect(() => {
    if (!open) appliedSourceRef.current = '';
  }, [open]);

  const sourceCards = firstQuery.data !== undefined && secondQuery.data !== undefined
    ? ([firstQuery.data, secondQuery.data] as const)
    : null;

  // 来源卡加载完成后推导一次默认值; 同一对来源卡不重复覆盖用户已做的选择.
  useEffect(() => {
    if (!open || sourceCards === null) return;
    const key = `${sourceCards[0].id}:${sourceCards[1].id}`;
    if (appliedSourceRef.current === key) return;
    appliedSourceRef.current = key;
    setValues({
      ...EMPTY_VALUES,
      topicSelection: defaultTopicSelection(sourceCards[0], sourceCards[1]),
      embeddingSelection: defaultEmbeddingSelection(sourceCards[0], sourceCards[1])
    });
    setSubmitError(undefined);
    setPreviewSide('front');
    mergeMutation.reset();
  }, [open, sourceCards]);

  const generatedContent = useMemo(
    () => (sourceCards === null ? null : sourceContent(sourceCards[0], sourceCards[1])),
    [sourceCards]
  );
  const previewContent = values[previewSide] || generatedContent?.[previewSide] || '';
  const isLoading = firstQuery.isPending || secondQuery.isPending || mergeMutation.isPending;
  const topicsDiffer = sourceCards !== null && sourceCards[0].topic_id !== sourceCards[1].topic_id;
  const embeddingDiffers =
    sourceCards !== null && sourceCards[0].enable_embedding !== sourceCards[1].enable_embedding;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (sourceCardIds === null || sourceCards === null || mergeMutation.isPending) return;
    setSubmitError(undefined);

    if (values.topicSelection === 'unset') {
      setSubmitError('两张来源 Card 的 Topic 不同，请选择合并后的 Topic。');
      return;
    }
    if (values.embeddingSelection === 'unset') {
      setSubmitError('两张来源 Card 的 Embedding 开关不同，请选择合并后的状态。');
      return;
    }

    const input: Parameters<typeof mergeMutation.mutate>[0] = {
      sourceCardIds,
      topicId:
        values.topicSelection === 'none'
          ? null
          : Number(values.topicSelection.slice('topic:'.length)),
      enableEmbedding: values.embeddingSelection === 'enabled',
      ...(values.front === '' ? {} : { front: values.front }),
      ...(values.back === '' ? {} : { back: values.back })
    };

    mergeMutation.mutate(input, {
      onSuccess: (card) => {
        queryClient.setQueryData(['cards', 'detail', card.id], card);
        onMerged(card);
      },
      onError: (error: unknown) => setSubmitError(getApiErrorMessage(error))
    });
  };

  let content: React.ReactNode;
  if (firstQuery.isPending || secondQuery.isPending) {
    content = <LoadingState title="正在加载来源 Card" description="正在读取两张来源 Card 的最新内容。" />;
  } else if (firstQuery.isError || secondQuery.isError) {
    content = (
      <ErrorState
        title="来源 Card 加载失败"
        description={getApiErrorMessage(firstQuery.error ?? secondQuery.error)}
        onRetry={() => {
          void firstQuery.refetch();
          void secondQuery.refetch();
        }}
      />
    );
  } else if (sourceCards !== null && generatedContent !== null) {
    content = (
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="rounded-xl border border-outline-variant/35 bg-surface-container-low p-3 text-[12px] text-on-surface-variant">
          <span className="font-mono">来源 Card: #{sourceCards[0].id} + #{sourceCards[1].id}</span>
          <p className="mt-1">缺省 Front/Back 时，后端会按 Q1/Q2 规则生成。显式填写后只覆盖对应字段。</p>
        </div>

        <Textarea
          label="Front（可选）"
          value={values.front}
          disabled={mergeMutation.isPending}
          rows={5}
          placeholder="留空则由服务端按 Q1/Q2 拼接"
          onChange={(event) => setValues((current) => ({ ...current, front: event.target.value }))}
        />
        <Textarea
          label="Back（可选）"
          value={values.back}
          disabled={mergeMutation.isPending}
          rows={6}
          placeholder="留空则由服务端按 Q1/Q2 拼接"
          onChange={(event) => setValues((current) => ({ ...current, back: event.target.value }))}
        />

        <div className="space-y-1">
          <Select
            label="合并后的 Topic"
            value={values.topicSelection}
            disabled={mergeMutation.isPending}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                topicSelection: event.target.value as TopicSelection
              }))
            }
          >
            {topicsDiffer && (
              <option value="unset" disabled>
                请选择合并后的 Topic
              </option>
            )}
            <option value="none">无 Topic</option>
            {topics.map((topic) => (
              <option key={topic.id} value={`topic:${topic.id}`}>
                {topic.name}
              </option>
            ))}
          </Select>
          <p className="text-[12px] text-on-surface-variant">
            来源：#1 {topicSelectionLabel(topicValue(sourceCards[0].topic_id), topics)} / #2{' '}
            {topicSelectionLabel(topicValue(sourceCards[1].topic_id), topics)}
            {topicsDiffer ? '（不一致，必须显式选择）' : '（一致）'}
          </p>
        </div>

        <div className="space-y-1">
          <Select
            label="合并后的 Embedding"
            value={values.embeddingSelection}
            disabled={mergeMutation.isPending}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                embeddingSelection: event.target.value as EmbeddingSelection
              }))
            }
          >
            {embeddingDiffers && (
              <option value="unset" disabled>
                请选择合并后的 Embedding
              </option>
            )}
            <option value="enabled">启用 Embedding</option>
            <option value="disabled">禁用 Embedding</option>
          </Select>
          <p className="text-[12px] text-on-surface-variant">
            来源：#1 {sourceCards[0].enable_embedding ? '启用' : '禁用'} / #2{' '}
            {sourceCards[1].enable_embedding ? '启用' : '禁用'}
            {embeddingDiffers ? '（不一致，必须显式选择）' : '（一致）'}
          </p>
        </div>

        <section className="overflow-hidden rounded-xl border border-outline-variant/40 bg-surface-container-lowest">
          <div className="flex items-center gap-1 border-b border-outline-variant/30 bg-surface-container-low p-1.5">
            <button
              type="button"
              onClick={() => setPreviewSide('front')}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold ${previewSide === 'front' ? 'bg-surface-container-lowest text-primary shadow-subtle' : 'text-on-surface-variant'}`}
            >
              Front 预览
            </button>
            <button
              type="button"
              onClick={() => setPreviewSide('back')}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold ${previewSide === 'back' ? 'bg-surface-container-lowest text-primary shadow-subtle' : 'text-on-surface-variant'}`}
            >
              Back 预览
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto p-4">
            <MarkdownRenderer content={previewContent} />
          </div>
        </section>

        {submitError !== undefined && (
          <div role="alert" className="rounded-xl border border-error/25 bg-error-container px-4 py-3 text-body-sm text-on-error-container">
            {submitError}
            {mergeMutation.error instanceof ApiError && mergeMutation.error.code === 'merge_topic_required' && (
              <span className="mt-1 block">请选择无 Topic 或指定一个 Topic。</span>
            )}
            {mergeMutation.error instanceof ApiError && mergeMutation.error.code === 'merge_embedding_required' && (
              <span className="mt-1 block">请选择启用或禁用 Embedding。</span>
            )}
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 border-t border-outline-variant/30 pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={mergeMutation.isPending}>
            取消
          </Button>
          <Button type="submit" isLoading={mergeMutation.isPending} disabled={isLoading}>
            合并并放入回收站
          </Button>
        </div>
      </form>
    );
  } else {
    content = null;
  }

  return (
    <Modal
      open={open}
      size="lg"
      title="合并 Card"
      onClose={() => (mergeMutation.isPending ? undefined : onClose())}
    >
      {content}
    </Modal>
  );
};
