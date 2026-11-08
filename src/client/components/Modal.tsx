import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ open, onClose, title, children, footer }) => {
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
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal" ref={ref} tabIndex={-1}>
        <div className="modal__header">
          <span className="modal__title" id="modal-title">{title}</span>
          <button className="btn btn--ghost btn--sm" onClick={onClose} aria-label="Close dialog">
            <X size={16} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
};
