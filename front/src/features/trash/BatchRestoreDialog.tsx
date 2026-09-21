import React, { useEffect, useState } from 'react';
import { TrashKind } from '../../api/trash';
import { Topic } from '../../api/topics';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/FormControls';
import { Modal } from '../../components/ui/Modal';

interface BatchRestoreDialogProps {
  open: boolean;
  kind: TrashKind;
  count: number;
  topics: Topic[];
  isSubmitting: boolean;
  errorMessage?: string;
  onClose: () => void;
  /**
   * kind=cards 时回传统一的 topicId (null 表示恢复到无 Topic);
   * 其余类型忽略该参数。批量恢复是整批事务, 所有项共享同一目标 Topic。
   */
  onConfirm: (topicId: number | null) => void;
}

const NO_TOPIC = 'none';

const kindLabel: Record<TrashKind, string> = {
  cards: 'Card',
  topics: 'Topic',
  glossary: '术语'
};

/**
 * 批量恢复确认弹窗。
 * Card 批量恢复需要选择统一的恢复目标 Topic (不提供“保留原 Topic”);
 * Topic/Glossary 批量恢复只做高危确认。
 */
export const BatchRestoreDialog: React.FC<BatchRestoreDialogProps> = ({
  open,
  kind,
  count,
  topics,
  isSubmitting,
  errorMessage,
  onClose,
  onConfirm
}) => {
  const [target, setTarget] = useState<string>(NO_TOPIC);

  useEffect(() => {
    if (!open) return;
    setTarget(NO_TOPIC);
  }, [open]);

  return (
    <Modal open={open} title={`批量恢复${kindLabel[kind]}`} onClose={isSubmitting ? () => undefined : onClose}>
      <div className="space-y-5">
        <p className="text-body-md text-on-surface-variant">
          将恢复选中的 <span className="font-mono text-on-surface">{count}</span> 个{kindLabel[kind]}。
          批量恢复整批执行，任一项失败会整批回滚。
        </p>

        {kind === 'cards' && (
          <div className="space-y-2">
            <Select
              label="统一恢复到 Topic"
              value={target}
              disabled={isSubmitting}
              onChange={(event) => setTarget(event.target.value)}
            >
              <option value={NO_TOPIC}>恢复到无 Topic</option>
              {topics.map((topic) => (
                <option key={topic.id} value={String(topic.id)}>
                  {topic.name}
                </option>
              ))}
            </Select>
            <p className="text-body-sm text-on-surface-variant">
              回收站 Card 不保留原 Topic，批量恢复会将这些 Card 归入同一 Topic。
            </p>
          </div>
        )}

        {errorMessage !== undefined && (
          <div
            role="alert"
            className="rounded-xl border border-error/25 bg-error-container px-4 py-3 text-body-sm text-on-error-container"
          >
            {errorMessage}
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 border-t border-outline-variant/30 pt-4 sm:flex-row sm:justify-end">
          <Button variant="secondary" disabled={isSubmitting} onClick={onClose}>
            取消
          </Button>
          <Button
            isLoading={isSubmitting}
            onClick={() => onConfirm(target === NO_TOPIC ? null : Number(target))}
          >
            批量恢复
          </Button>
        </div>
      </div>
    </Modal>
  );
};
