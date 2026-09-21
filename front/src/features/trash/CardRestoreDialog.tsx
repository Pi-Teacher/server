import React, { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CardRestoreResult, RestoreSingleResult, TrashedCard, restoreTrashItemMutationOptions } from '../../api/trash';
import { Topic } from '../../api/topics';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/FormControls';
import { Modal } from '../../components/ui/Modal';
import { trashErrorMessage } from './trashErrors';

interface CardRestoreDialogProps {
  open: boolean;
  card: TrashedCard | null;
  topics: Topic[];
  onClose: () => void;
  /** 恢复成功后由父层失效缓存并提示; 弹窗并入服务端返回的新 Card ID。 */
  onRestored: (result: CardRestoreResult) => void;
}

// “无 Topic”用哨兵值区分于具体 Topic id。
const NO_TOPIC = 'none';

/**
 * 回收站 Card 恢复弹窗。
 *
 * 回收站 Card 不保存原 Topic, 因此只提供两种选择: 恢复到无 Topic, 或指定一个
 * 当前正常 Topic。不出现“保留原 Topic”选项。恢复会生成全新 Card ID, 结果以
 * 服务端返回的 new_card_id 为准。
 */
export const CardRestoreDialog: React.FC<CardRestoreDialogProps> = ({
  open,
  card,
  topics,
  onClose,
  onRestored
}) => {
  const restoreMutation = useMutation(restoreTrashItemMutationOptions());
  const [target, setTarget] = useState<string>(NO_TOPIC);
  const [result, setResult] = useState<CardRestoreResult | null>(null);
  const [error, setError] = useState<unknown>();

  // 每次打开重置选择、错误与上次结果。
  useEffect(() => {
    if (!open) return;
    setTarget(NO_TOPIC);
    setResult(null);
    setError(undefined);
  }, [open]);

  const isSubmitting = restoreMutation.isPending;

  const handleConfirm = () => {
    if (card === null || isSubmitting) return;
    setError(undefined);
    restoreMutation.mutate(
      {
        kind: 'cards',
        id: card.id,
        expectedVersion: card.version,
        topicId: target === NO_TOPIC ? null : Number(target)
      },
      {
        onSuccess: (result: RestoreSingleResult) => {
          if (result.kind !== 'cards') return;
          setResult(result.card);
          onRestored(result.card);
        },
        onError: (err: unknown) => setError(err)
      }
    );
  };

  const errorMessage = trashErrorMessage(error);

  return (
    <Modal open={open} title="恢复 Card" onClose={isSubmitting ? () => undefined : onClose}>
      {result !== null ? (
        <div className="space-y-5">
          <p className="text-body-md text-on-surface-variant">
            回收站 Card
            <span className="mx-1 font-mono text-on-surface">#{result.trash_card_id}</span>
            已恢复为新的 Card
            <span className="mx-1 font-mono text-on-surface">#{result.new_card_id}</span>
            。恢复会生成全新 Card ID，后续操作请使用新 ID。
          </p>
          <div className="flex justify-end">
            <Button onClick={onClose}>关闭</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-body-md text-on-surface-variant">
            将恢复回收站 Card
            <span className="mx-1 font-mono text-on-surface">#{card?.id}</span>
            （version <span className="font-mono">{card?.version}</span>）。该 Card 不保存原 Topic，请为恢复后的对象选择归属。
          </p>

          <Select
            label="恢复后的 Topic"
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
            <Button isLoading={isSubmitting} onClick={handleConfirm}>
              恢复 Card
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};
