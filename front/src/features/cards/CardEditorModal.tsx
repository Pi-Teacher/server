import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CardDetail,
  cardDetailQueryKey,
  cardDetailQueryOptions,
  createCardMutationOptions,
  updateCardMutationOptions
} from '../../api/cards';
import { ApiError, getApiErrorMessage } from '../../api/client';
import { Topic } from '../../api/topics';
import { MarkdownRenderer } from '../../components/MarkdownRenderer';
import { Button } from '../../components/ui/Button';
import { CardCheckPanel } from './CardCheckPanel';
import { ConflictDialog } from '../../components/ui/ConflictDialog';
import { Modal } from '../../components/ui/Modal';
import { Select, Textarea } from '../../components/ui/FormControls';
import { ErrorState, LoadingState } from '../../components/ui/States';

interface CardEditorModalProps {
  mode: 'create' | 'edit';
  cardId: number | null;
  open: boolean;
  topics: Topic[];
  onClose: () => void;
  onSaved: (card: CardDetail, mode: 'create' | 'edit') => void;
}

interface EditorValues {
  topicId: number | null;
  front: string;
  back: string;
  enableEmbedding: boolean;
}

const EMPTY_VALUES: EditorValues = {
  topicId: null,
  front: '',
  back: '',
  enableEmbedding: false
};

const valuesFromCard = (card: CardDetail): EditorValues => ({
  topicId: card.topic_id,
  front: card.front,
  back: card.back,
  enableEmbedding: card.enable_embedding
});

const validateValues = (values: EditorValues): { front?: string; back?: string } => {
  const errors: { front?: string; back?: string } = {};
  if (values.front.trim() === '') errors.front = 'Front 不能为空';
  if (values.back.trim() === '') errors.back = 'Back 不能为空';
  return errors;
};

const buildCopyText = (values: EditorValues): string =>
  [
    `Topic: ${values.topicId === null ? '无 Topic' : values.topicId}`,
    `Enable Embedding: ${values.enableEmbedding ? 'true' : 'false'}`,
    '',
    'Front:',
    values.front,
    '',
    'Back:',
    values.back
  ].join('\n');

export const CardEditorModal: React.FC<CardEditorModalProps> = ({
  mode,
  cardId,
  open,
  topics,
  onClose,
  onSaved
}) => {
  const queryClient = useQueryClient();
  const detailQuery = useQuery(cardDetailQueryOptions(mode === 'edit' && open ? cardId ?? 0 : 0));
  const createMutation = useMutation(createCardMutationOptions());
  const updateMutation = useMutation(updateCardMutationOptions());
  const [values, setValues] = useState<EditorValues>(EMPTY_VALUES);
  const [initialValues, setInitialValues] = useState<EditorValues | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ front?: string; back?: string }>({});
  const [submitError, setSubmitError] = useState<string>();
  const [isConflictOpen, setIsConflictOpen] = useState(false);
  const [previewSide, setPreviewSide] = useState<'front' | 'back'>('front');
  const loadedDetailRef = useRef<string>('');
  const submitLockRef = useRef(false);

  useEffect(() => {
    if (!open) {
      loadedDetailRef.current = '';
      return;
    }
    setFieldErrors({});
    setSubmitError(undefined);
    setIsConflictOpen(false);
    setPreviewSide('front');
    submitLockRef.current = false;
    if (mode === 'create') {
      setValues(EMPTY_VALUES);
      setInitialValues(EMPTY_VALUES);
      loadedDetailRef.current = 'create';
    }
  }, [mode, open]);

  useEffect(() => {
    if (!open || mode !== 'edit' || detailQuery.data === undefined) return;
    const key = `${detailQuery.data.id}:${detailQuery.data.version}:${detailQuery.dataUpdatedAt}`;
    if (loadedDetailRef.current === key) return;
    loadedDetailRef.current = key;
    const nextValues = valuesFromCard(detailQuery.data);
    setValues(nextValues);
    setInitialValues(nextValues);
    setFieldErrors({});
    setSubmitError(undefined);
  }, [detailQuery.data, detailQuery.dataUpdatedAt, mode, open]);

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const hasChanges = useMemo(() => {
    if (initialValues === null) return false;
    return (
      values.topicId !== initialValues.topicId ||
      values.front !== initialValues.front ||
      values.back !== initialValues.back ||
      values.enableEmbedding !== initialValues.enableEmbedding
    );
  }, [initialValues, values]);

  const handleClose = () => {
    if (isSubmitting) return;
    onClose();
  };

  const handleValidationError = (error: ApiError) => {
    const field = error.details?.field;
    if (field === 'front') setFieldErrors((current) => ({ ...current, front: error.message }));
    if (field === 'back') setFieldErrors((current) => ({ ...current, back: error.message }));
    setSubmitError(error.message);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (submitLockRef.current || isSubmitting || initialValues === null) return;

    const errors = validateValues(values);
    setFieldErrors(errors);
    if (errors.front !== undefined || errors.back !== undefined) return;

    setSubmitError(undefined);
    submitLockRef.current = true;
    if (mode === 'create') {
      createMutation.mutate(
        {
          topicId: values.topicId,
          front: values.front,
          back: values.back,
          enableEmbedding: values.enableEmbedding
        },
        {
          onSuccess: (card) => onSaved(card, 'create'),
          onError: (error: unknown) => {
            if (error instanceof ApiError && error.code === 'validation_error') {
              handleValidationError(error);
              return;
            }
            setSubmitError(getApiErrorMessage(error));
          },
          onSettled: () => {
            submitLockRef.current = false;
          }
        }
      );
      return;
    }

    if (detailQuery.data === undefined || cardId === null) {
      submitLockRef.current = false;
      return;
    }
    if (!hasChanges) {
      submitLockRef.current = false;
      setSubmitError('没有需要保存的修改');
      return;
    }

    const input: Parameters<typeof updateMutation.mutate>[0] = {
      id: cardId,
      expectedVersion: detailQuery.data.version
    };
    if (values.topicId !== initialValues.topicId) input.topicId = values.topicId;
    if (values.front !== initialValues.front) input.front = values.front;
    if (values.back !== initialValues.back) input.back = values.back;
    if (values.enableEmbedding !== initialValues.enableEmbedding) {
      input.enableEmbedding = values.enableEmbedding;
    }

    updateMutation.mutate(input, {
      onSuccess: (card) => {
        queryClient.setQueryData(cardDetailQueryKey(card.id), card);
        onSaved(card, 'edit');
      },
      onError: (error: unknown) => {
        if (error instanceof ApiError && error.code === 'version_conflict') {
          setIsConflictOpen(true);
          setSubmitError('Card 已被其他操作修改，当前内容尚未保存。');
          return;
        }
        if (error instanceof ApiError && error.code === 'validation_error') {
          handleValidationError(error);
          return;
        }
        setSubmitError(getApiErrorMessage(error));
      },
      onSettled: () => {
        submitLockRef.current = false;
      }
    });
  };

  const handleReloadConflict = async () => {
    if (cardId === null) return;
    setIsConflictOpen(false);
    loadedDetailRef.current = '';
    await queryClient.invalidateQueries({ queryKey: cardDetailQueryKey(cardId) });
  };

  const title = mode === 'create' ? '新建 Card' : '编辑 Card';
  let content: React.ReactNode;
  if (mode === 'edit' && detailQuery.isPending) {
    content = <LoadingState title="正在加载 Card" description="正在读取最新详情与 version。" />;
  } else if (mode === 'edit' && detailQuery.isError) {
    content = (
      <ErrorState
        title="Card 加载失败"
        description={getApiErrorMessage(detailQuery.error)}
        onRetry={() => void detailQuery.refetch()}
      />
    );
  } else {
    content = (
      <form onSubmit={handleSubmit} className="space-y-5">
        <Select
          label="Topic"
          value={values.topicId === null ? '' : String(values.topicId)}
          disabled={isSubmitting}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              topicId: event.target.value === '' ? null : Number(event.target.value)
            }))
          }
        >
          <option value="">无 Topic</option>
          {topics.map((topic) => (
            <option key={topic.id} value={String(topic.id)}>
              {topic.name}
            </option>
          ))}
        </Select>

        <Textarea
          label="Front"
          value={values.front}
          error={fieldErrors.front}
          disabled={isSubmitting}
          rows={6}
          maxLength={64 * 1024}
          placeholder="输入 Card 正面，支持 Markdown"
          onChange={(event) => {
            setValues((current) => ({ ...current, front: event.target.value }));
            setFieldErrors((current) => ({ ...current, front: undefined }));
          }}
        />

        <Textarea
          label="Back"
          value={values.back}
          error={fieldErrors.back}
          disabled={isSubmitting}
          rows={8}
          maxLength={64 * 1024}
          placeholder="输入 Card 背面，支持 Markdown"
          onChange={(event) => {
            setValues((current) => ({ ...current, back: event.target.value }));
            setFieldErrors((current) => ({ ...current, back: undefined }));
          }}
        />

        <label className="flex items-start gap-3 rounded-xl border border-outline-variant/45 bg-surface-container-low p-4">
          <input
            type="checkbox"
            checked={values.enableEmbedding}
            disabled={isSubmitting}
            onChange={(event) =>
              setValues((current) => ({ ...current, enableEmbedding: event.target.checked }))
            }
            className="mt-0.5 h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary/20"
          />
          <span>
            <span className="block text-[13px] font-semibold text-on-surface">启用 Embedding</span>
            <span className="mt-1 block text-[12px] leading-5 text-on-surface-variant">
              新建时默认关闭。启用后 Card 会进入后端 Embedding 处理队列。
            </span>
          </span>
        </label>

        <section className="overflow-hidden rounded-xl border border-outline-variant/40 bg-surface-container-lowest">
          <div className="flex items-center gap-1 border-b border-outline-variant/30 bg-surface-container-low p-1.5">
            <button
              type="button"
              onClick={() => setPreviewSide('front')}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold ${
                previewSide === 'front'
                  ? 'bg-surface-container-lowest text-primary shadow-subtle'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Front 预览
            </button>
            <button
              type="button"
              onClick={() => setPreviewSide('back')}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold ${
                previewSide === 'back'
                  ? 'bg-surface-container-lowest text-primary shadow-subtle'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Back 预览
            </button>
          </div>
          <div className="min-h-32 p-4">
            {(previewSide === 'front' ? values.front : values.back).trim() === '' ? (
              <p className="text-body-sm text-on-surface-variant">输入 Markdown 后在此安全预览。</p>
            ) : (
              <MarkdownRenderer content={previewSide === 'front' ? values.front : values.back} />
            )}
          </div>
        </section>

        <CardCheckPanel
          front={values.front}
          enableEmbedding={values.enableEmbedding}
          disabled={isSubmitting}
        />

        {submitError !== undefined && (
          <div role="alert" className="rounded-xl border border-error/25 bg-error-container px-4 py-3 text-body-sm text-on-error-container">
            {submitError}
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 border-t border-outline-variant/30 pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" disabled={isSubmitting} onClick={handleClose}>
            取消
          </Button>
          <Button
            type="submit"
            isLoading={isSubmitting}
            disabled={mode === 'edit' && !hasChanges}
          >
            {mode === 'create' ? '创建 Card' : '保存修改'}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <>
      <Modal open={open} size="lg" title={title} onClose={handleClose}>
        {content}
      </Modal>
      <ConflictDialog
        open={isConflictOpen}
        title="Card 版本冲突"
        description="服务端 Card 已经变化，当前编辑内容没有被覆盖或自动重试。你可以先复制当前内容，再重新加载最新版本。"
        copyText={buildCopyText(values)}
        closeLabel="继续编辑"
        reloadLabel="重新加载最新版本"
        onClose={() => setIsConflictOpen(false)}
        onReload={() => void handleReloadConflict()}
      />
    </>
  );
};
