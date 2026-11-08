import React from 'react';
import type { Tone } from '../lib/status.js';

interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone | 'lens';
  children: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}

export const Chip: React.FC<ChipProps> = ({ tone = 'neutral', children, className = '', icon, ...rest }) => {
  const cls = ['chip', `chip--${tone}`, className].filter(Boolean).join(' ');
  return (
    <span className={cls} {...rest}>
      {icon}
      {children}
    </span>
  );
};
