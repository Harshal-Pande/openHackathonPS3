import React, { useState, useEffect } from 'react';
import { Logo } from './Logo.js';
import { navigate } from '../lib/router.js';
import type { Route } from '../lib/router.js';
import type { HealthResponse } from '../lib/types.js';
import { Menu } from 'lucide-react';
import { Drawer } from './Drawer.js';

interface TopBarProps {
  currentRoute: Route;
}

export const TopBar: React.FC<TopBarProps> = ({ currentRoute }) => {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(j => { if (j.data) setHealth(j.data); })
      .catch(() => {});
  }, []);

  const networkLabel = health
    ? `Celo Mainnet · ${health.chainId}`
    : 'Celo Mainnet · 42220';

  const isActive = (page: string) => currentRoute.page === page;

  const NavLinks: React.FC<{ onClick?: () => void }> = ({ onClick }) => (
    <>
      <a
        href="#/"
        className="topbar__nav-link"
        aria-current={isActive('investigate') ? 'page' : undefined}
        onClick={onClick}
      >
        Investigate
      </a>
      <a
        href="#/history"
        className="topbar__nav-link"
        aria-current={isActive('history') ? 'page' : undefined}
        onClick={onClick}
      >
        History
      </a>
      <a
        href="#/about"
        className="topbar__nav-link"
        aria-current={isActive('about') ? 'page' : undefined}
        onClick={onClick}
      >
        About
      </a>
      <a
        href="#/operator"
        className="topbar__nav-link"
        aria-current={isActive('operator') ? 'page' : undefined}
        onClick={onClick}
      >
        Operator
      </a>
    </>
  );

  return (
    <header className="topbar" role="banner">
      <a
        href="#/"
        className="topbar__logo"
        data-testid="app-title-link"
        aria-label="RevertLens home"
        onClick={e => { e.preventDefault(); navigate('#/'); }}
      >
        <Logo size={22} />
        <span className="topbar__wordmark">RevertLens</span>
      </a>

      <nav className="topbar__nav" aria-label="Main navigation">
        <NavLinks />
      </nav>

      <div className="topbar__right">
        <span className="topbar__network-pill" title={`RPC configured: ${health?.rpcConfigured}`}>
          {networkLabel}
        </span>
      </div>

      <button
        className="topbar__hamburger btn btn--ghost btn--sm"
        aria-label="Open navigation menu"
        onClick={() => setDrawerOpen(true)}
      >
        <Menu size={20} strokeWidth={1.75} aria-hidden />
      </button>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Navigation"
        position="left"
      >
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }} aria-label="Mobile navigation">
          <NavLinks onClick={() => setDrawerOpen(false)} />
        </nav>
      </Drawer>
    </header>
  );
};
