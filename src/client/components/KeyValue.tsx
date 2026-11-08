import React from 'react';

interface KeyValueProps {
  label: string;
  value?: React.ReactNode;
  children?: React.ReactNode;
  mono?: boolean;
}

export const KeyValue: React.FC<KeyValueProps> = ({ label, value, children, mono }) => (
  <div className="kv">
    <span className="kv__label">{label}</span>
    <span className={['kv__value', mono ? 'kv__value--mono' : ''].filter(Boolean).join(' ')}>
      {children !== undefined ? children : value}
    </span>
  </div>
);
