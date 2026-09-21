import React from 'react';
import { Button } from './Button';
import { Modal } from './Modal';

interface ConflictDialogProps {
  open: boolean;
  onReload: () => void;
  onClose: () => void;
  copyText?: string;
  title?: string;
  description?: string;
  closeLabel?: string;
  reloadLabel?: string;
}

export const ConflictDialog: React.FC<ConflictDialogProps> = ({
  open,
  onReload,
  onClose,
  copyText,
  title = '内容已被修改',
  description = '服务端版本已经变化. 为避免覆盖新内容, 请先复制当前编辑内容, 再重新加载最新数据.',
  closeLabel = '继续查看',
  reloadLabel = '重新加载'
}) => {
  const handleCopy = async () => {
    if (copyText !== undefined) await navigator.clipboard.writeText(copyText);
  };

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <p className="text-body-md text-on-surface-variant">{description}</p>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        {copyText !== undefined && (
          <Button variant="secondary" onClick={() => void handleCopy()}>
            复制当前内容
          </Button>
        )}
        <Button variant="secondary" onClick={onClose}>{closeLabel}</Button>
        <Button onClick={onReload}>{reloadLabel}</Button>
      </div>
    </Modal>
  );
};
