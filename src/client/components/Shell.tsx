import React from 'react';
import { TopBar } from './TopBar.js';
import { ToastContainer } from './Toast.js';
import type { Route } from '../lib/router.js';

interface ShellProps {
  currentRoute: Route;
  wide?: boolean;
  children: React.ReactNode;
}

export const Shell: React.FC<ShellProps> = ({ currentRoute, wide, children }) => (
  <div className="shell">
    <a href="#main" id="skip-to-content">Skip to main content</a>
    <TopBar currentRoute={currentRoute} />
    <main
      id="main"
      className={['shell__main', wide ? 'shell__main--wide' : ''].filter(Boolean).join(' ')}
    >
      {children}
    </main>
    <footer className="shell__footer">
      RevertLens · Non-custodial transaction forensics · Celo Mainnet · No wallet connection required
    </footer>
    <ToastContainer />
  </div>
);
