import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface Toast {
  id: number;
  message: string;
  tone?: 'ok' | 'fail' | 'neutral';
}

let toastQueue: Array<(msg: string, tone?: 'ok' | 'fail' | 'neutral') => void> = [];

export function showToast(message: string, tone?: 'ok' | 'fail' | 'neutral') {
  toastQueue.forEach(fn => fn(message, tone));
}

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const fn = (msg: string, tone?: 'ok' | 'fail' | 'neutral') => {
      const id = Date.now() + Math.random();
      setToasts(prev => [...prev, { id, message: msg, tone }]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
    };
    toastQueue.push(fn);
    return () => { toastQueue = toastQueue.filter(f => f !== fn); };
  }, []);

  if (toasts.length === 0) return null;

  return createPortal(
    <div className="toast-container" role="status" aria-live="polite" aria-label="Notifications">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`toast ${t.tone === 'fail' ? 'toast--fail' : ''}`}
          data-testid="toast"
        >
          {t.message}
        </div>
      ))}
    </div>,
    document.body
  );
};
