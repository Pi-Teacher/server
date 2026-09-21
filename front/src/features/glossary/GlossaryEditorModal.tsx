import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Glossary,
  createGlossaryMutationOptions,
  glossaryDetailQueryKey,
  glossaryDetailQueryOptions,
  updateGlossaryMutationOptions
} from '../../api/glossary';
import { ApiError, getApiErrorMessage } from '../../api/client';
import { MarkdownRenderer } from '../../components/MarkdownRenderer';
import { Button } from '../../components/ui/Button';
import { ConflictDialog } from '../../components/ui/ConflictDialog';
import { Modal } from '../../components/ui/Modal';
import { Input, Textarea } from '../../components/ui/FormControls';
import { ErrorState, LoadingState } from '../../components/ui/States';

interface GlossaryEditorModalProps {
  mode: 'create' | 'edit';
  glossaryId: number | null;
  open: boolean;
  onClose: () => void;
  onSaved: (glossary: Glossary, mode: 'create' | 'edit') => void;
}

interface EditorValues {
  term: string;
  definition: string;
}

const EMPTY_VALUES: EditorValues = { term: '', definition: '' };

const valuesFromGlossary = (item: Glossary): EditorValues => ({
  term: item.term,
  definition: item.definition
});

// 与后端校验一致: term trim 后非空且不超过 200 个 Unicode 字符;
// definition 必填, trim 后非空 (与 Topic 的可选描述不同).
const validateValues = (values: EditorValues): { term?: string; definition?: string } => {
  const errors: { term?: string; definition?: string } = {};
  if (values.term.trim() === '') errors.term = '术语不能为空';
  else if ([...values.term.trim()].length > 200) errors.term = '术语不能超过 200 个字符';
  if (values.definition.trim() === '') errors.definition = '定义不能为空';
  return errors;
};

const buildCopyText = (values: EditorValues): string =>
  ['Term:', values.term, '', 'Definition:', values.definition].join('\n');

export const GlossaryEditorModal: React.FC<GlossaryEditorModalProps> = ({
  mode,
  glossaryId,
  open,
  onClose,
  onSaved
}) => {
  const queryClient = useQueryClient();
  const detailQuery = useQuery(glossaryDetailQueryOptions(mode === 'edit' && open ? glossaryId ?? 0 : 0));
  const createMutation = useMutation(createGlossaryMutationOptions());
  const updateMutation = useMutation(updateGlossaryMutationOptions());
  const [values, setValues] = useState<EditorValues>(EMPTY_VALUES);
  const [initialValues, setInitialValues] = useState<EditorValues | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ term?: string; definition?: string }>({});
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
    const nextValues = valuesFromGlossary(detailQuery.data);
    setValues(nextValues);
    setInitialValues(nextValues);
    setFieldErrors({});
    setSubmitError(undefined);
  }, [detailQuery.data, detailQuery.dataUpdatedAt, mode, open]);

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const hasChanges = useMemo(() => {
    if (initialValues === null) return false;
    return values.term !== initialValues.term || values.definition !== initialValues.definition;
  }, [initialValues, values]);

  const handleClose = () => {
    if (isSubmitting) return;
    onClose();
  };

  const handleValidationError = (error: ApiError) => {
    const field = error.details?.field;
    if (field === 'term' || field === 'definition') {
      setFieldErrors((current) => ({ ...current, [field]: error.message }));
    }
    setSubmitError(error.message);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (submitLockRef.current || isSubmitting || initialValues === null) return;

    const errors = validateValues(values);
    setFieldErrors(errors);
    if (errors.term !== undefined || errors.definition !== undefined) return;

    setSubmitError(undefined);
    submitLockRef.current = true;
    if (mode === 'create') {
      createMutation.mutate(
        { term: values.term, definition: values.definition },
        {
          onSuccess: (glossary) => onSaved(glossary, 'create'),
          onError: (error: unknown) => {
            if (error instanceof ApiError && error.code === 'validation_error') {
              handleValidationError(error);
              return;
            }
            if (error instanceof ApiError && error.code === 'name_conflict') {
              setFieldErrors((current) => ({ ...current, term: error.message }));
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

    if (detailQuery.data === undefined || glossaryId === null) {
      submitLockRef.current = false;
      return;
    }
    if (!hasChanges) {
      submitLockRef.current = false;
      setSubmitError('没有需要保存的修改');
      return;
    }

    const input: Parameters<typeof updateMutation.mutate>[0] = {
      id: glossaryId,
      expectedVersion: detailQuery.data.version
    };
    if (values.term !== initialValues.term) input.term = values.term;
    if (values.definition !== initialValues.definition) input.definition = values.definition;

    updateMutation.mutate(input, {
      onSuccess: (glossary) => {
        queryClient.setQueryData(glossaryDetailQueryKey(glossary.id), glossary);
        onSaved(glossary, 'edit');
      },
      onError: (error: unknown) => {
        if (error instanceof ApiError && error.code === 'version_conflict') {
          setIsConflictOpen(true);
          setSubmitError('术语已被其他操作修改，当前内容尚未保存。');
          return;
        }
        if (error instanceof ApiError && error.code === 'validation_error') {
          handleValidationError(error);
          return;
        }
        if (error instanceof ApiError && error.code === 'name_conflict') {
          setFieldErrors((current) => ({ ...current, term: error.message }));
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
    if (glossaryId === null) return;
    setIsConflictOpen(false);
    loadedDetailRef.current = '';
    await queryClient.invalidateQueries({ queryKey: glossaryDetailQueryKey(glossaryId) });
  };

  const title = mode === 'create' ? '新建术语' : '编辑术语';
  let content: React.ReactNode;
  if (mode === 'edit' && detailQuery.isPending) {
    content = <LoadingState title="正在加载术语" description="正在读取最新定义与 version。" />;
  } else if (mode === 'edit' && detailQuery.isError) {
    content = (
      <ErrorState
        title="术语加载失败"
        description={getApiErrorMessage(detailQuery.error)}
        onRetry={() => void detailQuery.refetch()}
      />
    );
  } else {
    content = (
      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          label="术语"
          value={values.term}
          error={fieldErrors.term}
          disabled={isSubmitting}
          maxLength={200}
          placeholder="输入术语名称"
          onChange={(event) => {
            setValues((current) => ({ ...current, term: event.target.value }));
            setFieldErrors((current) => ({ ...current, term: undefined }));
          }}
        />

        <Textarea
          label="定义 (必填, 支持 Markdown)"
          value={values.definition}
          error={fieldErrors.definition}
          disabled={isSubmitting}
          rows={8}
          maxLength={64 * 1024}
          placeholder="输入术语定义，支持 Markdown"
          onChange={(event) => {
            setValues((current) => ({ ...current, definition: event.target.value }));
            setFieldErrors((current) => ({ ...current, definition: undefined }));
          }}
        />

        <section className="overflow-hidden rounded-xl border border-outline-variant/40 bg-surface-container-lowest">
          <div className="border-b border-outline-variant/30 bg-surface-container-low px-4 py-2">
            <span className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">
              定义预览
            </span>
          </div>
          <div className="min-h-24 p-4">
            {values.definition.trim() === '' ? (
              <p className="text-body-sm text-on-surface-variant">输入 Markdown 后在此安全预览。</p>
            ) : (
              <MarkdownRenderer content={values.definition} />
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
            {mode === 'create' ? '创建术语' : '保存修改'}
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
        title="术语版本冲突"
        description="服务端术语已经变化，当前编辑内容没有被覆盖或自动重试。你可以先复制当前内容，再重新加载最新版本。"
        copyText={buildCopyText(values)}
        closeLabel="继续编辑"
        reloadLabel="重新加载最新版本"
        onClose={() => setIsConflictOpen(false)}
        onReload={() => void handleReloadConflict()}
      />
    </>
  );
};
