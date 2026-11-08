import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'warn';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  icon,
  className = '',
  children,
  ...rest
}) => {
  const cls = [
    'btn',
    `btn--${variant}`,
    size !== 'md' ? `btn--${size}` : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button className={cls} {...rest}>
      {icon && <span className="btn__icon" style={{ display: 'inline-flex', alignItems: 'center' }}>{icon}</span>}
      {children}
    </button>
  );
};
