import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Topic,
  TopicTrashPreviewResponse,
  TopicTrashResponse,
  topicTrashPreviewQueryOptions,
  trashTopicMutationOptions
} from '../../api/topics';
import { ApiError, getApiErrorMessage } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { ErrorState, LoadingState } from '../../components/ui/States';

interface TopicTrashDialogProps {
  topic: Topic | null;
  open: boolean;
  onClose: () => void;
  // previewAffectedCards 用于对比预览与实际回收的 Card 数, 解释并发变化.
  onTrashed: (response: TopicTrashResponse, includeCards: boolean, previewAffectedCards: number) => void;
}

type TrashChoice = 'topic-only' | 'with-cards';

export const TopicTrashDialog: React.FC<TopicTrashDialogProps> = ({
  topic,
  open,
  onClose,
  onTrashed
}) => {
  const queryClient = useQueryClient();
  const previewQuery = useQuery(topicTrashPreviewQueryOptions(open && topic !== null ? [topic.id] : []));
  const trashMutation = useMutation(trashTopicMutationOptions());
  const [choice, setChoice] = useState<TrashChoice>('topic-only');
  const [submitError, setSubmitError] = useState<string>();
  const [previewAffectedCards, setPreviewAffectedCards] = useState<number>(0);

  // 关闭时重置选择与错误; 不在这里 reset mutation,
  // useMutation 返回对象每次渲染都是新引用, 作为 effect 依赖会引发无限循环.
  useEffect(() => {
    if (!open) {
      setChoice('topic-only');
      setSubmitError(undefined);
    }
  }, [open]);

  useEffect(() => {
    if (previewQuery.data !== undefined) {
      setPreviewAffectedCards(previewQuery.data.affected_cards);
    }
  }, [previewQuery.data]);

  const isSubmitting = trashMutation.isPending;

  const handleConfirm = () => {
    if (isSubmitting || topic === null) return;
    setSubmitError(undefined);
    trashMutation.mutate(
      {
        id: topic.id,
        expectedVersion: topic.version,
        includeCards: choice === 'with-cards'
      },
      {
        onSuccess: (response) => {
          onTrashed(response, choice === 'with-cards', previewAffectedCards);
        },
        onError: (error: unknown) => {
          if (error instanceof ApiError && error.code === 'version_conflict') {
            // 行数据已过期: 失效列表让用户重新加载后再试, 不自动重试危险写操作.
            void queryClient.invalidateQueries({ queryKey: ['topics', 'list'] });
            setSubmitError('Topic 已被其他操作修改，请关闭后重新操作。');
            return;
          }
          if (error instanceof ApiError && error.code === 'not_found') {
            void queryClient.invalidateQueries({ queryKey: ['topics', 'list'] });
            setSubmitError('Topic 不存在或已在回收站。');
            return;
          }
          setSubmitError(getApiErrorMessage(error));
        }
      }
    );
  };

  const renderPreview = (preview: TopicTrashPreviewResponse) => (
    <p className="text-body-md leading-6 text-on-surface-variant">
      将回收 Topic
      {topic !== null && (
        <span className="mx-1 font-mono text-on-surface">「{topic.name}」</span>
      )}
      （version <span className="font-mono">{topic?.version}</span>），其当前关联
      <span className="mx-1 font-mono text-on-surface">{preview.affected_cards}</span>
      张 Card。
      {preview.already_trashed > 0 && (
        <span className="mt-1 block text-body-sm text-on-surface-variant">
          另有 {preview.already_trashed} 个同 ID Topic 已在回收站。
        </span>
      )}
    </p>
  );

  let content: React.ReactNode;
  if (previewQuery.isPending) {
    content = <LoadingState title="正在获取回收影响" description="正在统计关联 Card 数量。" />;
  } else if (previewQuery.isError) {
    content = (
      <ErrorState
        title="回收预览失败"
        description={getApiErrorMessage(previewQuery.error)}
        onRetry={() => void previewQuery.refetch()}
      />
    );
  } else {
    const preview = previewQuery.data;
    content = (
      <div className="space-y-5">
        {renderPreview(preview)}

        <fieldset className="space-y-2.5">
          <legend className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">
            回收方式
          </legend>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-outline-variant/50 bg-surface-container-lowest p-3.5 transition-colors has-checked:border-primary has-checked:bg-primary-fixed/30">
            <input
              type="radio"
              name="topic-trash-choice"
              value="topic-only"
              checked={choice === 'topic-only'}
              disabled={isSubmitting}
              onChange={() => setChoice('topic-only')}
              className="mt-1 accent-primary"
            />
            <span>
              <span className="block text-body-md text-on-surface">仅回收 Topic</span>
              <span className="mt-0.5 block text-body-sm text-on-surface-variant">
                关联的 {preview.affected_cards} 张 Card 将变为“无 Topic”，Card 本身保留。
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-outline-variant/50 bg-surface-container-lowest p-3.5 transition-colors has-checked:border-primary has-checked:bg-primary-fixed/30">
            <input
              type="radio"
              name="topic-trash-choice"
              value="with-cards"
              checked={choice === 'with-cards'}
              disabled={isSubmitting}
              onChange={() => setChoice('with-cards')}
              className="mt-1 accent-primary"
            />
            <span>
              <span className="block text-body-md text-on-surface">连同关联 Card 一起回收</span>
              <span className="mt-0.5 block text-body-sm text-on-surface-variant">
                {preview.affected_cards} 张关联 Card 一并放入回收站。
              </span>
            </span>
          </label>
        </fieldset>

        {submitError !== undefined && (
          <div
            role="alert"
            className="rounded-xl border border-error/25 bg-error-container px-4 py-3 text-body-sm text-on-error-container"
          >
            {submitError}
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 border-t border-outline-variant/30 pt-4 sm:flex-row sm:justify-end">
          <Button variant="secondary" disabled={isSubmitting} onClick={onClose}>
            取消
          </Button>
          <Button variant="danger" isLoading={isSubmitting} onClick={handleConfirm}>
            放入回收站
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Modal open={open} size="md" title="放入回收站" onClose={isSubmitting ? () => undefined : onClose}>
      {content}
    </Modal>
  );
};
