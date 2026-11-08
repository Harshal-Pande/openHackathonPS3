import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => (
  <div className="empty-state">
    {icon && <div className="empty-state__icon" aria-hidden>{icon}</div>}
    <div className="empty-state__title">{title}</div>
    {description && <div className="empty-state__desc">{description}</div>}
    {action}
  </div>
);
