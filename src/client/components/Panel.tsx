import React from 'react';

interface PanelProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  tag?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  tone?: 'fail' | 'warn' | 'ok' | 'info' | null;
  className?: string;
  noPad?: boolean;
}

export const Panel: React.FC<PanelProps> = ({
  title, tag, actions, children, tone, className = '', noPad, ...rest
}) => {
  const cls = [
    'panel',
    tone ? `panel--tone-${tone}` : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={cls} {...rest}>
      {(title || tag || actions) && (
        <div className="panel__header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {tag && <span className="panel__tag">{tag}</span>}
            {title && <span className="panel__title">{title}</span>}
          </div>
          {actions && <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>{actions}</div>}
        </div>
      )}
      {noPad ? children : <div className="panel__body">{children}</div>}
    </div>
  );
};
