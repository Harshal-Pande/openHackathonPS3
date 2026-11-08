// lib/router.ts — Hash-based client router hook
import { useState, useEffect, useCallback } from 'react';

export type Route =
  | { page: 'investigate' }
  | { page: 'report'; id: string }
  | { page: 'history' }
  | { page: 'about' }
  | { page: 'operator' }
  | { page: 'notfound' };

function parseHash(hash: string): Route {
  const h = hash.replace(/^#/, '');
  if (!h || h === '/') return { page: 'investigate' };
  const m = h.match(/^\/investigation\/([^/]+)$/);
  if (m) return { page: 'report', id: m[1] };
  if (h === '/history') return { page: 'history' };
  if (h === '/about') return { page: 'about' };
  if (h === '/operator') return { page: 'operator' };
  return { page: 'notfound' };
}

export function useRouter(): [Route, (hash: string) => void] {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const handler = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const navigate = useCallback((hash: string) => {
    window.location.hash = hash;
  }, []);

  return [route, navigate];
}

export function navigate(hash: string) {
  window.location.hash = hash;
}

let cachedReport: any = null;

export function setCachedReport(report: any) {
  cachedReport = report;
}

export function getCachedReport(id?: string) {
  if (id && cachedReport && cachedReport.investigationId !== id) {
    return null;
  }
  return cachedReport;
}
