import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Topic,
  createTopicMutationOptions,
  topicDetailQueryKey,
  topicDetailQueryOptions,
  updateTopicMutationOptions
} from '../../api/topics';
import { ApiError, getApiErrorMessage } from '../../api/client';
import { MarkdownRenderer } from '../../components/MarkdownRenderer';
import { Button } from '../../components/ui/Button';
import { ConflictDialog } from '../../components/ui/ConflictDialog';
import { Modal } from '../../components/ui/Modal';
import { Input, Textarea } from '../../components/ui/FormControls';
import { ErrorState, LoadingState } from '../../components/ui/States';

interface TopicEditorModalProps {
  mode: 'create' | 'edit';
  topicId: number | null;
  open: boolean;
  onClose: () => void;
  onSaved: (topic: Topic, mode: 'create' | 'edit') => void;
}

interface EditorValues {
  name: string;
  description: string;
}

const EMPTY_VALUES: EditorValues = { name: '', description: '' };

const valuesFromTopic = (topic: Topic): EditorValues => ({
  name: topic.name,
  description: topic.description
});

// 名称与后端校验一致: trim 后非空且不超过 200 个 Unicode 字符.
const validateValues = (values: EditorValues): { name?: string } => {
  const errors: { name?: string } = {};
  if (values.name.trim() === '') errors.name = '名称不能为空';
  else if ([...values.name.trim()].length > 200) errors.name = '名称不能超过 200 个字符';
  return errors;
};

const buildCopyText = (values: EditorValues): string =>
  ['Name:', values.name, '', 'Description:', values.description].join('\n');

export const TopicEditorModal: React.FC<TopicEditorModalProps> = ({
  mode,
  topicId,
  open,
  onClose,
  onSaved
}) => {
  const queryClient = useQueryClient();
  const detailQuery = useQuery(topicDetailQueryOptions(mode === 'edit' && open ? topicId ?? 0 : 0));
  const createMutation = useMutation(createTopicMutationOptions());
  const updateMutation = useMutation(updateTopicMutationOptions());
  const [values, setValues] = useState<EditorValues>(EMPTY_VALUES);
  const [initialValues, setInitialValues] = useState<EditorValues | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string }>({});
  const [submitError, setSubmitError] = useState<string>();
  const [isConflictOpen, setIsConflictOpen] = useState(false);
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
    const nextValues = valuesFromTopic(detailQuery.data);
    setValues(nextValues);
    setInitialValues(nextValues);
    setFieldErrors({});
    setSubmitError(undefined);
  }, [detailQuery.data, detailQuery.dataUpdatedAt, mode, open]);

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const hasChanges = useMemo(() => {
    if (initialValues === null) return false;
    return values.name !== initialValues.name || values.description !== initialValues.description;
  }, [initialValues, values]);

  const handleClose = () => {
    if (isSubmitting) return;
    onClose();
  };

  const handleValidationError = (error: ApiError) => {
    const field = error.details?.field;
    if (field === 'name' || field === 'description') {
      setFieldErrors((current) => ({ ...current, [field]: error.message }));
    }
    setSubmitError(error.message);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (submitLockRef.current || isSubmitting || initialValues === null) return;

    const errors = validateValues(values);
    setFieldErrors(errors);
    if (errors.name !== undefined) return;

    setSubmitError(undefined);
    submitLockRef.current = true;
    if (mode === 'create') {
      createMutation.mutate(
        { name: values.name, description: values.description },
        {
          onSuccess: (topic) => onSaved(topic, 'create'),
          onError: (error: unknown) => {
            if (error instanceof ApiError && error.code === 'validation_error') {
              handleValidationError(error);
              return;
            }
            if (error instanceof ApiError && error.code === 'name_conflict') {
              setFieldErrors((current) => ({ ...current, name: error.message }));
              setSubmitError(error.message);
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

    if (detailQuery.data === undefined || topicId === null) {
      submitLockRef.current = false;
      return;
    }
    if (!hasChanges) {
      submitLockRef.current = false;
      setSubmitError('没有需要保存的修改');
      return;
    }

    const input: Parameters<typeof updateMutation.mutate>[0] = {
      id: topicId,
      expectedVersion: detailQuery.data.version
    };
    if (values.name !== initialValues.name) input.name = values.name;
    if (values.description !== initialValues.description) input.description = values.description;

    updateMutation.mutate(input, {
      onSuccess: (topic) => {
        queryClient.setQueryData(topicDetailQueryKey(topic.id), topic);
        onSaved(topic, 'edit');
      },
      onError: (error: unknown) => {
        if (error instanceof ApiError && error.code === 'version_conflict') {
          setIsConflictOpen(true);
          setSubmitError('Topic 已被其他操作修改，当前内容尚未保存。');
          return;
        }
        if (error instanceof ApiError && error.code === 'validation_error') {
          handleValidationError(error);
          return;
        }
        if (error instanceof ApiError && error.code === 'name_conflict') {
          setFieldErrors((current) => ({ ...current, name: error.message }));
          setSubmitError(error.message);
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
    if (topicId === null) return;
    setIsConflictOpen(false);
    loadedDetailRef.current = '';
    await queryClient.invalidateQueries({ queryKey: topicDetailQueryKey(topicId) });
  };

  const title = mode === 'create' ? '新建 Topic' : '编辑 Topic';
  let content: React.ReactNode;
  if (mode === 'edit' && detailQuery.isPending) {
    content = <LoadingState title="正在加载 Topic" description="正在读取最新详情与 version。" />;
  } else if (mode === 'edit' && detailQuery.isError) {
    content = (
      <ErrorState
        title="Topic 加载失败"
        description={getApiErrorMessage(detailQuery.error)}
        onRetry={() => void detailQuery.refetch()}
      />
    );
  } else {
    content = (
      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          label="名称"
          value={values.name}
          error={fieldErrors.name}
          disabled={isSubmitting}
          maxLength={200}
          placeholder="输入 Topic 名称"
          onChange={(event) => {
            setValues((current) => ({ ...current, name: event.target.value }));
            setFieldErrors((current) => ({ ...current, name: undefined }));
          }}
        />

        <Textarea
          label="描述 (可选, 支持 Markdown)"
          value={values.description}
          disabled={isSubmitting}
          rows={8}
          maxLength={64 * 1024}
          placeholder="输入 Topic 描述，支持 Markdown"
          onChange={(event) =>
            setValues((current) => ({ ...current, description: event.target.value }))
          }
        />

        <section className="overflow-hidden rounded-xl border border-outline-variant/40 bg-surface-container-lowest">
          <div className="border-b border-outline-variant/30 bg-surface-container-low px-4 py-2">
            <span className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">
              描述预览
            </span>
          </div>
          <div className="min-h-24 p-4">
            {values.description.trim() === '' ? (
              <p className="text-body-sm text-on-surface-variant">输入 Markdown 后在此安全预览。</p>
            ) : (
              <MarkdownRenderer content={values.description} />
            )}
          </div>
        </section>

        {submitError !== undefined && (
          <div
            role="alert"
            className="rounded-xl border border-error/25 bg-error-container px-4 py-3 text-body-sm text-on-error-container"
          >
            {submitError}
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 border-t border-outline-variant/30 pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" disabled={isSubmitting} onClick={handleClose}>
            取消
          </Button>
          <Button type="submit" isLoading={isSubmitting} disabled={mode === 'edit' && !hasChanges}>
            {mode === 'create' ? '创建 Topic' : '保存修改'}
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
        title="Topic 版本冲突"
        description="服务端 Topic 已经变化，当前编辑内容没有被覆盖或自动重试。你可以先复制当前内容，再重新加载最新版本。"
        copyText={buildCopyText(values)}
        closeLabel="继续编辑"
        reloadLabel="重新加载最新版本"
        onClose={() => setIsConflictOpen(false)}
        onReload={() => void handleReloadConflict()}
      />
    </>
  );
};
