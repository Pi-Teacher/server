import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, getApiErrorMessage } from '../../api/client';
import {
  EmbeddingConfig,
  EmbeddingCoverage,
  EmbeddingTestResult,
  buildEmbeddingConfigPatch,
  embeddingConfigQueryKey,
  embeddingConfigQueryOptions,
  embeddingStatusQueryKey,
  embeddingStatusQueryOptions,
  rebuildEmbeddingMutationOptions,
  retryFailedEmbeddingMutationOptions,
  testEmbeddingMutationOptions,
  updateEmbeddingConfigMutationOptions
} from '../../api/embedding';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Input } from '../../components/ui/FormControls';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { Toast } from '../../components/ui/Toast';
import { SettingsSection } from './SettingsSection';

type NumericField = 'dimensions' | 'timeout_seconds' | 'worker_batch_size' | 'similarity_min_ready_percent';

type ConfigDraft = Omit<EmbeddingConfig, NumericField> & Record<NumericField, string>;

const toDraft = (config: EmbeddingConfig): ConfigDraft => ({
  ...config,
  dimensions: String(config.dimensions),
  timeout_seconds: String(config.timeout_seconds),
  worker_batch_size: String(config.worker_batch_size),
  similarity_min_ready_percent: String(config.similarity_min_ready_percent)
});

const CoverageSummary: React.FC<{ coverage: EmbeddingCoverage }> = ({ coverage }) => (
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

export const EmbeddingPanel: React.FC = () => {
  const queryClient = useQueryClient();
  const configQuery = useQuery(embeddingConfigQueryOptions());
  // rebuilding 进行中时定时轮询状态, 让覆盖率进度与结束后的开关自动刷新。
  const statusQuery = useQuery({
    ...embeddingStatusQueryOptions(),
    refetchInterval: (query) => (query.state.data?.rebuilding ? 3000 : false)
  });

  const configMutation = useMutation(updateEmbeddingConfigMutationOptions());
  const testMutation = useMutation(testEmbeddingMutationOptions());
  const rebuildMutation = useMutation(rebuildEmbeddingMutationOptions());
  const retryMutation = useMutation(retryFailedEmbeddingMutationOptions());

  const [draft, setDraft] = useState<ConfigDraft | null>(null);
  const [testResult, setTestResult] = useState<EmbeddingTestResult>();
  const [fieldError, setFieldError] = useState<string>();
  const [submitError, setSubmitError] = useState<string>();
  const [successMessage, setSuccessMessage] = useState<string>();
  const [isRebuildConfirmOpen, setIsRebuildConfirmOpen] = useState(false);

  useEffect(() => {
    const data = configQuery.data;
    if (data === undefined) return;
    setDraft(toDraft(data));
  }, [configQuery.data]);

  const rebuilding = statusQuery.data?.rebuilding ?? false;
  const isConfigSubmitting = configMutation.isPending;
  const isBusy = isConfigSubmitting || testMutation.isPending || rebuildMutation.isPending || retryMutation.isPending;

  const { patch, validationError } = useMemo(() => {
    if (draft === null || configQuery.data === undefined) {
      return { patch: {}, validationError: undefined as string | undefined };
    }
    const parsed: EmbeddingConfig = {
      ...draft,
      dimensions: Number(draft.dimensions),
      timeout_seconds: Number(draft.timeout_seconds),
      worker_batch_size: Number(draft.worker_batch_size),
      similarity_min_ready_percent: Number(draft.similarity_min_ready_percent)
    };
    const positiveFields: NumericField[] = ['dimensions', 'timeout_seconds', 'worker_batch_size'];
    if (positiveFields.some((field) => !Number.isInteger(parsed[field]) || parsed[field] <= 0)) {
      return { patch: {}, validationError: '维度、超时秒数与批次大小必须是正整数' };
    }
    if (
      !Number.isInteger(parsed.similarity_min_ready_percent) ||
      parsed.similarity_min_ready_percent < 0 ||
      parsed.similarity_min_ready_percent > 100
    ) {
      return { patch: {}, validationError: '最低覆盖率必须在 0 到 100 之间' };
    }
    return { patch: buildEmbeddingConfigPatch(configQuery.data, parsed), validationError: undefined };
  }, [draft, configQuery.data]);

  const isDirty = Object.keys(patch).length > 0;
  // rebuilding 期间后端会拒绝任意字段修改, 前端提前禁用保存与两个重建操作。
  const canSave =
    configQuery.data !== undefined && isDirty && validationError === undefined && !rebuilding && !isBusy;

  const updateField = <K extends keyof ConfigDraft>(key: K, value: ConfigDraft[K]) => {
    setDraft((previous) => (previous === null ? previous : { ...previous, [key]: value }));
    setSuccessMessage(undefined);
    setSubmitError(undefined);
    setFieldError(undefined);
  };

  const handleSave = () => {
    if (!canSave) return;
    setSuccessMessage(undefined);
    setSubmitError(undefined);
    configMutation.mutate(patch, {
      onSuccess: (config) => {
        queryClient.setQueryData(embeddingConfigQueryKey, config);
        setSuccessMessage('Embedding 配置已保存。存量向量不会自动重建，如需生效请手动触发重建。');
      },
      onError: (error: unknown) => {
        if (error instanceof ApiError && error.code === 'rebuilding') {
          setSubmitError('Embedding 正在重建，暂时不能修改配置或触发重建，请稍后重试。');
          return;
        }
        if (error instanceof ApiError && error.code === 'validation_error') {
          const field = error.details?.field;
          setFieldError(typeof field === 'string' ? `字段 ${field} 校验失败: ${error.message}` : error.message);
          return;
        }
        setSubmitError(getApiErrorMessage(error));
      }
    });
  };

  const handleTest = () => {
    setTestResult(undefined);
    setSubmitError(undefined);
    testMutation.mutate(undefined, {
      // 探测失败是业务失败, 仍按 ok=false 的结果展示, 不进入错误分支。
      onSuccess: (result) => setTestResult(result)
    });
  };

  const handleRebuild = () => {
    setSuccessMessage(undefined);
    setSubmitError(undefined);
    rebuildMutation.mutate(undefined, {
      onSuccess: () => {
        setIsRebuildConfirmOpen(false);
        setSuccessMessage('已触发完整重建，覆盖率会随 worker 处理进度更新。');
        void queryClient.invalidateQueries({ queryKey: embeddingStatusQueryKey });
      },
      onError: (error: unknown) => {
        setIsRebuildConfirmOpen(false);
        if (error instanceof ApiError && error.code === 'rebuilding') {
          setSubmitError('Embedding 正在重建，请等待当前重建结束后再试。');
          return;
        }
        setSubmitError(getApiErrorMessage(error));
      }
    });
  };

  const handleRetryFailed = () => {
    setSuccessMessage(undefined);
    setSubmitError(undefined);
    retryMutation.mutate(undefined, {
      onSuccess: () => {
        setSuccessMessage('已触发失败项重试，覆盖率会随 worker 处理进度更新。');
        void queryClient.invalidateQueries({ queryKey: embeddingStatusQueryKey });
      },
      onError: (error: unknown) => {
        if (error instanceof ApiError && error.code === 'rebuilding') {
          setSubmitError('Embedding 正在重建，请等待当前重建结束后再试。');
          return;
        }
        setSubmitError(getApiErrorMessage(error));
      }
    });
  };

  if (configQuery.isPending || statusQuery.isPending) {
    return <LoadingState title="正在加载 Embedding" description="正在读取配置与覆盖率状态。" />;
  }
  if (configQuery.isError) {
    return (
      <ErrorState
        title="Embedding 配置加载失败"
        description={getApiErrorMessage(configQuery.error)}
        onRetry={() => void configQuery.refetch()}
      />
    );
  }
  if (statusQuery.isError) {
    return (
      <ErrorState
        title="Embedding 状态加载失败"
        description={getApiErrorMessage(statusQuery.error)}
        onRetry={() => void statusQuery.refetch()}
      />
    );
  }
  if (draft === null || statusQuery.data === undefined) {
    return <LoadingState title="正在准备 Embedding 设置" />;
  }

  return (
    <SettingsSection
      title="Embedding"
      description="配置 OpenAI 兼容的向量服务并管理向量覆盖率。保存配置不会自动重建已存在的向量。"
      actions={
        <>
          <Badge tone={statusQuery.data.rebuilding ? 'warning' : 'success'}>
            {statusQuery.data.rebuilding ? '重建中' : '空闲'}
          </Badge>
          <Badge tone={statusQuery.data.similarity_enabled ? 'success' : 'neutral'}>
            {statusQuery.data.similarity_enabled ? '语义查重已开放' : '语义查重未开放'}
          </Badge>
        </>
      }
    >
      {rebuilding && (
        <div role="status" className="mt-4 rounded-xl border border-fsrs-hard-border bg-fsrs-hard-bg px-3 py-2.5 text-body-sm text-fsrs-hard-text">
          Embedding 正在重建，配置保存、重建与重试按钮暂时不可用。
        </div>
      )}

      <div className="mt-4">
        <CoverageSummary coverage={statusQuery.data.coverage} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Input
          label="Base URL"
          name="embedding_base_url"
          value={draft.base_url}
          disabled={isConfigSubmitting || rebuilding}
          placeholder="http://localhost:11434/v1"
          hint="OpenAI 兼容的 embeddings 服务地址。"
          onChange={(event) => updateField('base_url', event.target.value)}
        />
        <Input
          label="模型名"
          name="embedding_model"
          value={draft.model}
          disabled={isConfigSubmitting || rebuilding}
          placeholder="qwen3-embedding:0.6b"
          onChange={(event) => updateField('model', event.target.value)}
        />
        <Input
          label="API Key"
          name="embedding_api_key"
          value={draft.api_key}
          disabled={isConfigSubmitting || rebuilding}
          autoComplete="off"
          hint="后端以明文保存与回显。"
          className="font-mono"
          onChange={(event) => updateField('api_key', event.target.value)}
        />
        <Input
          label="向量维度"
          name="embedding_dimensions"
          type="number"
          min={1}
          value={draft.dimensions}
          disabled={isConfigSubmitting || rebuilding}
          onChange={(event) => updateField('dimensions', event.target.value)}
        />
        <Input
          label="请求超时（秒）"
          name="embedding_timeout_seconds"
          type="number"
          min={1}
          value={draft.timeout_seconds}
          disabled={isConfigSubmitting || rebuilding}
          onChange={(event) => updateField('timeout_seconds', event.target.value)}
        />
        <Input
          label="Worker 批次大小"
          name="embedding_worker_batch_size"
          type="number"
          min={1}
          value={draft.worker_batch_size}
          disabled={isConfigSubmitting || rebuilding}
          onChange={(event) => updateField('worker_batch_size', event.target.value)}
        />
        <Input
          label="开放语义查重的最低覆盖率（%）"
          name="embedding_similarity_min_ready_percent"
          type="number"
          min={0}
          max={100}
          value={draft.similarity_min_ready_percent}
          disabled={isConfigSubmitting || rebuilding}
          onChange={(event) => updateField('similarity_min_ready_percent', event.target.value)}
        />
      </div>

      {validationError !== undefined && (
        <p role="alert" className="mt-4 rounded-xl border border-error/25 bg-error-container px-3 py-2.5 text-body-sm text-on-error-container">
          {validationError}
        </p>
      )}
      {fieldError !== undefined && (
        <p role="alert" className="mt-4 rounded-xl border border-error/25 bg-error-container px-3 py-2.5 text-body-sm text-on-error-container">
          {fieldError}
        </p>
      )}
      {submitError !== undefined && (
        <p role="alert" className="mt-4 rounded-xl border border-error/25 bg-error-container px-3 py-2.5 text-body-sm text-on-error-container">
          {submitError}
        </p>
      )}

      {testResult !== undefined && (
        <div
          role="status"
          className={`mt-4 rounded-xl border px-3 py-2.5 text-body-sm ${
            testResult.ok
              ? 'border-tertiary/30 bg-tertiary-fixed text-on-tertiary-fixed'
              : 'border-error/25 bg-error-container text-on-error-container'
          }`}
        >
          {testResult.ok
            ? `连接成功，返回向量维度 ${testResult.dimensions ?? '未知'}`
            : `连接失败：${testResult.error ?? '未知错误'}`}
        </div>
      )}

      {successMessage !== undefined && <div className="mt-4"><Toast message={successMessage} tone="success" /></div>}

      <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
        <Button
          type="button"
          variant="secondary"
          isLoading={testMutation.isPending}
          disabled={isBusy || rebuilding}
          onClick={handleTest}
        >
          测试连接
        </Button>
        <Button
          type="button"
          variant="secondary"
          isLoading={retryMutation.isPending}
          disabled={isBusy || rebuilding}
          onClick={handleRetryFailed}
        >
          重试失败项
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={isBusy || rebuilding}
          onClick={() => setIsRebuildConfirmOpen(true)}
        >
          重建全部向量
        </Button>
        <Button
          type="button"
          isLoading={isConfigSubmitting}
          disabled={!canSave}
          onClick={handleSave}
        >
          保存 Embedding 配置
        </Button>
      </div>

      <ConfirmDialog
        open={isRebuildConfirmOpen}
        title="重建全部向量"
        description="重建会清空全部启用 Card 的现有向量并重新生成，期间语义查重能力会暂时关闭。确定继续吗？"
        confirmLabel="开始重建"
        danger
        isSubmitting={rebuildMutation.isPending}
        onConfirm={handleRebuild}
        onClose={() => {
          if (rebuildMutation.isPending) return;
          setIsRebuildConfirmOpen(false);
        }}
      />
    </SettingsSection>
  );
};
