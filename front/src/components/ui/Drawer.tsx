import React, { useEffect } from 'react';

interface DrawerProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export const Drawer: React.FC<DrawerProps> = ({ open, title, onClose, children }) => {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] bg-inverse-surface/30" role="presentation" onMouseDown={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
        className="ml-auto flex h-full w-full max-w-xl flex-col border-l border-outline-variant/40 bg-surface-container-lowest shadow-card"
      >
        <header className="flex items-center justify-between border-b border-outline-variant/30 px-6 py-4">
          <h2 className="text-headline-sm text-on-surface">{title}</h2>
          <button type="button" aria-label="关闭" onClick={onClose} className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high">
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </aside>
    </div>
  );
};
