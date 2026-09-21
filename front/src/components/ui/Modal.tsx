import React, { useEffect, useRef } from 'react';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  /**
   * 控制弹窗最大宽度. 默认 md, 与既有确认类弹窗保持一致.
   * 卡片编辑和合并内容较多, 使用 lg.
   */
  size?: ModalSize;
  children: React.ReactNode;
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl'
};

export const Modal: React.FC<ModalProps> = ({ open, title, onClose, size = 'md', children }) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previous?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-inverse-surface/35 p-4" role="presentation" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        className={`flex max-h-[calc(100dvh-2rem)] w-full flex-col rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-6 shadow-card outline-none ${sizeClasses[size]}`}
      >
        <h2 className="shrink-0 text-headline-sm text-on-surface">{title}</h2>
        {/*
          内容区独立滚动: 手机端小屏时, 弹窗高度受限于视口, 正文可上下滑动,
          底部操作按钮始终能滚动到并点击. min-h-0 让 flex 子项正确收缩.
        */}
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};
