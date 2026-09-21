import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { glossaryDetailQueryOptions } from '../../api/glossary';
import { getApiErrorMessage } from '../../api/client';
import { MarkdownRenderer } from '../../components/MarkdownRenderer';
import { Modal } from '../../components/ui/Modal';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { formatDateTime } from '../../utils/datetime';

interface GlossaryDetailModalProps {
  glossaryId: number | null;
  open: boolean;
  onClose: () => void;
}

// 详情弹窗打开时重新请求 /glossary/{id}, 不复用列表快照,
// 保证 version 与定义内容是最新的.
export const GlossaryDetailModal: React.FC<GlossaryDetailModalProps> = ({
  glossaryId,
  open,
  onClose
}) => {
  const detailQuery = useQuery(glossaryDetailQueryOptions(open ? glossaryId ?? 0 : 0));

  let content: React.ReactNode;
  if (detailQuery.isPending) {
    content = <LoadingState title="正在加载术语" description="正在读取最新定义与 version。" />;
  } else if (detailQuery.isError) {
    content = (
      <ErrorState
        title="术语加载失败"
        description={getApiErrorMessage(detailQuery.error)}
        onRetry={() => void detailQuery.refetch()}
      />
    );
  } else {
    const item = detailQuery.data;
    content = (
      <div className="space-y-5">
        <dl className="grid grid-cols-2 gap-3 rounded-xl border border-outline-variant/40 bg-surface-container-low p-4 font-mono text-[12px] sm:grid-cols-3">
          <div>
            <dt className="text-label-sm uppercase tracking-wider text-on-surface-variant">Version</dt>
            <dd className="mt-1 text-[14px] text-on-surface">v{item.version}</dd>
          </div>
          <div>
            <dt className="text-label-sm uppercase tracking-wider text-on-surface-variant">创建时间</dt>
            <dd className="mt-1 text-[12px] text-on-surface-variant">{formatDateTime(item.created_at)}</dd>
          </div>
          <div>
            <dt className="text-label-sm uppercase tracking-wider text-on-surface-variant">更新时间</dt>
            <dd className="mt-1 text-[12px] text-on-surface-variant">{formatDateTime(item.updated_at)}</dd>
          </div>
        </dl>

        <section>
          <h3 className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">定义</h3>
          <div className="mt-2 rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-4">
            <MarkdownRenderer content={item.definition} />
          </div>
        </section>
      </div>
    );
  }

  return (
    <Modal open={open} size="lg" title="术语详情" onClose={onClose}>
      {content}
    </Modal>
  );
};
