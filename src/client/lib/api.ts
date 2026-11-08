// lib/api.ts — Fetch wrappers with envelope parsing and AppError throwing
import { AppError, type ApiEnvelope } from './types.js';

async function request<T>(url: string, options?: RequestInit, token?: string): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (_err) {
    throw new AppError('NETWORK_ERROR', 'Network request failed. Check your connection.', 0);
  }

  let json: { data?: T; error?: { code?: string; message?: string }; requestId?: string };
  try {
    json = await res.json();
  } catch {
    throw new AppError('PARSE_ERROR', `Server returned non-JSON response (HTTP ${res.status})`, res.status);
  }

  if (!res.ok || json.error) {
    const code = json.error?.code ?? `HTTP_${res.status}`;
    const message = json.error?.message ?? `Request failed with status ${res.status}`;
    throw new AppError(code, message, res.status, json.requestId);
  }

  return (json as ApiEnvelope<T>).data;
}

export const api = {
  getHealth: () => request<import('./types.js').HealthResponse>('/api/health'),

  postInvestigation: (txHash: string, signal?: AbortSignal) =>
    request<import('./types.js').InvestigationReport>('/api/investigations', {
      method: 'POST',
      body: JSON.stringify({ txHash }),
      signal,
    }),

  getInvestigation: (id: string) =>
    request<import('./types.js').InvestigationReport>(`/api/investigations/${id}`),

  listInvestigations: (limit = 100) =>
    request<import('./types.js').RecentInvestigation[]>(`/api/investigations?limit=${limit}`),

  getAgentMetadata: () =>
    request<import('./types.js').AgentMetadata>('/api/agent/metadata'),

  operatorLogin: (password: string) =>
    request<{ token: string; session: string }>('/api/operator/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  operatorLogout: (token: string) =>
    request<unknown>('/api/operator/logout', { method: 'POST' }, token),

  listQuotes: (token: string) =>
    request<import('./types.js').OperatorQuote[]>('/api/operator/quotes', {}, token),

  approveQuote: (id: string, expectedBodySha256: string, token: string) =>
    request<unknown>(
      `/api/operator/quotes/${id}/approve`,
      { method: 'POST', body: JSON.stringify({ expectedBodySha256 }) },
      token
    ),

  setKillSwitch: (enabled: boolean, token: string) =>
    request<unknown>('/api/operator/kill-switch', {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }, token),
};

export const createInvestigation = api.postInvestigation;
export const getInvestigation = api.getInvestigation;
export const getRecentInvestigations = api.listInvestigations;
export const getHealth = api.getHealth;
