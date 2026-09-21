import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { topicDetailQueryOptions } from '../../api/topics';
import { getApiErrorMessage } from '../../api/client';
import { MarkdownRenderer } from '../../components/MarkdownRenderer';
import { Modal } from '../../components/ui/Modal';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { formatDateTime } from '../../utils/datetime';

interface TopicDetailModalProps {
  topicId: number | null;
  open: boolean;
  onClose: () => void;
}

// 详情弹窗打开时重新请求 /topics/{id}, 保证 card_count 与 version 是实时值,
// 不复用列表快照. 后端排序固定按更新时间, 列表数据可能已过期.
export const TopicDetailModal: React.FC<TopicDetailModalProps> = ({ topicId, open, onClose }) => {
  const detailQuery = useQuery(topicDetailQueryOptions(open ? topicId ?? 0 : 0));

  let content: React.ReactNode;
  if (detailQuery.isPending) {
    content = <LoadingState title="正在加载 Topic" description="正在读取最新详情与关联卡数量。" />;
  } else if (detailQuery.isError) {
    content = (
      <ErrorState
        title="Topic 加载失败"
        description={getApiErrorMessage(detailQuery.error)}
        onRetry={() => void detailQuery.refetch()}
      />
    );
  } else {
    const topic = detailQuery.data;
    content = (
      <div className="space-y-5">
        <dl className="grid grid-cols-2 gap-3 rounded-xl border border-outline-variant/40 bg-surface-container-low p-4 font-mono text-[12px] sm:grid-cols-4">
          <div>
            <dt className="text-label-sm uppercase tracking-wider text-on-surface-variant">Card 数量</dt>
            <dd className="mt-1 text-[14px] text-on-surface">{topic.card_count}</dd>
          </div>
          <div>
            <dt className="text-label-sm uppercase tracking-wider text-on-surface-variant">Version</dt>
            <dd className="mt-1 text-[14px] text-on-surface">v{topic.version}</dd>
          </div>
          <div>
            <dt className="text-label-sm uppercase tracking-wider text-on-surface-variant">创建时间</dt>
            <dd className="mt-1 text-[12px] text-on-surface-variant">{formatDateTime(topic.created_at)}</dd>
          </div>
          <div>
            <dt className="text-label-sm uppercase tracking-wider text-on-surface-variant">更新时间</dt>
            <dd className="mt-1 text-[12px] text-on-surface-variant">{formatDateTime(topic.updated_at)}</dd>
          </div>
        </dl>

        <section>
          <h3 className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">描述</h3>
          <div className="mt-2 rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-4">
            {topic.description === '' ? (
              <p className="text-body-sm text-on-surface-variant">该 Topic 暂无描述。</p>
            ) : (
              <MarkdownRenderer content={topic.description} />
            )}
          </div>
        </section>
      </div>
    );
  }

  return (
    <Modal open={open} size="lg" title="Topic 详情" onClose={onClose}>
      {content}
    </Modal>
  );
};
