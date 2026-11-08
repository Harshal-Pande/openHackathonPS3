import React from 'react';

interface LogoProps {
  size?: number;
}

export const Logo: React.FC<LogoProps> = ({ size = 24 }) => (
  <svg
    className="logo__svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    {/* Lens shape — circle outline */}
    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    {/* Lens dot — accent */}
    <circle cx="11" cy="11" r="2.5" fill="var(--lens)" />
    {/* Handle */}
    <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);
