import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  position?: 'left' | 'bottom';
}

export const Drawer: React.FC<DrawerProps> = ({ open, onClose, title, children, position = 'bottom' }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      prev?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div
        className={`drawer drawer--${position}`}
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="drawer__header">
          <span className="drawer__title">{title}</span>
          <button className="btn btn--ghost btn--sm" onClick={onClose} aria-label="Close drawer">
            <X size={16} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
        <div className="drawer__body">{children}</div>
      </div>
    </>,
    document.body
  );
};
