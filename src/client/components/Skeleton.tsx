import React from 'react';

interface SkeletonProps {
  variant?: 'text' | 'heading' | 'block';
  width?: string;
  height?: number | string;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({ variant = 'text', width, height, style }) => (
  <div
    className={`skeleton skeleton--${variant}`}
    style={{
      width,
      height: typeof height === 'number' ? `${height}px` : height,
      ...style,
    }}
    aria-hidden="true"
  />
);

export const SkeletonReport: React.FC = () => (
  <div className="stack" aria-label="Loading report..." aria-busy="true">
    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
      <Skeleton variant="text" width="80px" />
      <Skeleton variant="text" width="120px" />
      <Skeleton variant="text" width="100px" />
    </div>
    <Skeleton variant="heading" width="400px" />
    <Skeleton variant="text" width="100%" />
    <Skeleton variant="text" width="80%" />
    <div style={{ height: '16px' }} />
    <Skeleton variant="block" height={100} />
    <Skeleton variant="block" height={100} />
  </div>
);
