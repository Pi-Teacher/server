import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { APIKey, apiKeysQueryKey, apiKeysQueryOptions, createAPIKeyMutationOptions, deleteAPIKeyMutationOptions } from '../../api/apiKeys';
import { ApiError, getApiErrorMessage } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Input } from '../../components/ui/FormControls';
import { Pagination } from '../../components/ui/Pagination';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { Toast } from '../../components/ui/Toast';
import { SettingsSection } from './SettingsSection';

const formatDateTime = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const APIKeyRow: React.FC<{
  item: APIKey;
  disabled: boolean;
  onRevoke: (item: APIKey) => void;
}> = ({ item, disabled, onRevoke }) => (
  <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0">
      <p className="text-body-md font-semibold text-on-surface">{item.name}</p>
      {/* 后端明文返回完整 Key, 按用户要求直接展示明文, 不再做视觉隐藏。 */}
      <code className="mt-1 block break-all rounded border border-outline-variant/40 bg-surface-container-high px-1.5 py-0.5 font-mono text-[12px] text-primary">
        {item.api_key}
      </code>
      <p className="mt-1 font-mono text-[11px] text-on-surface-variant">
        创建于 {formatDateTime(item.created_at)}
      </p>
    </div>
    <div className="shrink-0">
      <Button variant="danger" disabled={disabled} onClick={() => onRevoke(item)}>
        删除
      </Button>
    </div>
  </li>
);

export const APIKeysPanel: React.FC = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string>();
  const [submitError, setSubmitError] = useState<string>();
  const [successMessage, setSuccessMessage] = useState<string>();
  const [revokeTarget, setRevokeTarget] = useState<APIKey | null>(null);

  const keysQuery = useQuery(apiKeysQueryOptions(page));
  const createMutation = useMutation(createAPIKeyMutationOptions());
  const deleteMutation = useMutation(deleteAPIKeyMutationOptions());

  const isSubmitting = createMutation.isPending || deleteMutation.isPending;

  const handleCreate = () => {
    const trimmed = name.trim();
    if (trimmed === '') {
      setNameError('名称不能为空');
      return;
    }
    setNameError(undefined);
    setSubmitError(undefined);
    setSuccessMessage(undefined);
    createMutation.mutate(trimmed, {
      onSuccess: (created) => {
        setName('');
        setSuccessMessage(`API Key「${created.name}」已创建，请立即复制保存。`);
        void queryClient.invalidateQueries({ queryKey: apiKeysQueryKey(1) });
        void queryClient.invalidateQueries({ queryKey: apiKeysQueryKey(page) });
      },
      onError: (error: unknown) => {
        if (error instanceof ApiError && error.code === 'validation_error') {
          const field = error.details?.field;
          setNameError(typeof field === 'string' ? error.message : getApiErrorMessage(error));
          return;
        }
        setSubmitError(getApiErrorMessage(error));
      }
    });
  };

  const handleRevoke = () => {
    if (revokeTarget === null) return;
    setSubmitError(undefined);
    deleteMutation.mutate(revokeTarget.id, {
      onSuccess: () => {
        setSuccessMessage(`API Key「${revokeTarget.name}」已删除`);
        setRevokeTarget(null);
        void queryClient.invalidateQueries({ queryKey: apiKeysQueryKey(page) });
      },
      onError: (error: unknown) => {
        // 404 说明已被其他操作删除, 关闭确认框并提示, 不留在原地重试。
        if (error instanceof ApiError && error.code === 'not_found') {
          setRevokeTarget(null);
          setSubmitError('该 API Key 已不存在，可能已被其他操作删除。');
          void queryClient.invalidateQueries({ queryKey: apiKeysQueryKey(page) });
          return;
        }
        setSubmitError(getApiErrorMessage(error));
      }
    });
  };

  let content: React.ReactNode;
  if (keysQuery.isPending) {
    content = <LoadingState title="正在加载 API Key" description="正在读取已创建的 Key 列表。" />;
  } else if (keysQuery.isError) {
    content = (
      <ErrorState
        title="API Key 加载失败"
        description={getApiErrorMessage(keysQuery.error)}
        onRetry={() => void keysQuery.refetch()}
      />
    );
  } else if (keysQuery.data.items.length === 0) {
    content = (
      <EmptyState
        title="还没有 API Key"
        description="创建后可用于 CLI 或 agent 通过 Bearer 认证访问本实例。"
      />
    );
  } else {
    content = (
      <>
        <ul className="divide-y divide-outline-variant/25">
          {keysQuery.data.items.map((item) => (
            <APIKeyRow key={item.id} item={item} disabled={isSubmitting} onRevoke={setRevokeTarget} />
          ))}
        </ul>
        <div className="mt-4">
          <Pagination
            page={keysQuery.data.page}
            pageSize={keysQuery.data.page_size}
            total={keysQuery.data.total}
            onPageChange={setPage}
          />
        </div>
      </>
    );
  }

  return (
    <SettingsSection
      title="API Key"
      description="API Key 用于 CLI 与 agent 认证。列表展示名称、Key 与创建时间；后端以明文返回完整 Key。"
    >
      <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/35 bg-surface-container-low p-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Input
            label="新建 API Key 名称"
            name="api-key-name"
            value={name}
            disabled={isSubmitting}
            error={nameError}
            placeholder="my-agent"
            onChange={(event) => {
              setName(event.target.value);
              setNameError(undefined);
              setSuccessMessage(undefined);
            }}
          />
        </div>
        <Button type="button" isLoading={createMutation.isPending} disabled={isSubmitting} onClick={handleCreate}>
          创建 API Key
        </Button>
      </div>

      {submitError !== undefined && (
        <p role="alert" className="mt-3 rounded-xl border border-error/25 bg-error-container px-3 py-2.5 text-body-sm text-on-error-container">
          {submitError}
        </p>
      )}
      {successMessage !== undefined && <div className="mt-3"><Toast message={successMessage} tone="success" /></div>}

      <div className="mt-4">{content}</div>

      <ConfirmDialog
        open={revokeTarget !== null}
        title="删除 API Key"
        description={
          revokeTarget === null
            ? ''
            : `确定删除「${revokeTarget.name}」吗？删除后使用该 Key 的 CLI 或 agent 将立即失效，且不可恢复。`
        }
        confirmLabel="删除"
        danger
        isSubmitting={deleteMutation.isPending}
        onConfirm={handleRevoke}
        onClose={() => {
          if (deleteMutation.isPending) return;
          setRevokeTarget(null);
        }}
      />
    </SettingsSection>
  );
};
