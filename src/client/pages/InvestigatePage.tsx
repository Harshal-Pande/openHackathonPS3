import React, { useState, useEffect, useRef } from 'react';
import { Panel } from '../components/Panel.js';
import { Button } from '../components/Button.js';
import { Chip } from '../components/Chip.js';
import { HashInput } from '../components/HashInput.js';
import { extractHash, isValidHash } from '../lib/extractHash.js';
import { createInvestigation, getRecentInvestigations } from '../lib/api.js';
import { getErrorInfo } from '../lib/errors.js';
import { CAUSALITY_LEGEND } from '../lib/causality.js';
import { txStatusTone, txStatusLabel } from '../lib/status.js';
import { shortHash, relativeTime } from '../lib/format.js';
import { navigate, setCachedReport } from '../lib/router.js';
import type { InvestigationReport, RecentInvestigationItem } from '../lib/types.js';
import { AlertCircle, Check, Clock, ChevronDown } from 'lucide-react';

const SAMPLE_HASH = '0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445';

interface InvestigatePageProps {
  onReportLoaded?: (report: InvestigationReport) => void;
}

export const InvestigatePage: React.FC<InvestigatePageProps> = () => {
  const [hash, setHash] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<{ code?: string; message?: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [recentList, setRecentList] = useState<RecentInvestigationItem[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const timerIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    getRecentInvestigations(5)
      .then(items => setRecentList(items))
      .catch(() => {});
  }, []);

  // Timer for loading state
  useEffect(() => {
    if (isLoading) {
      setElapsedSeconds(0);
      const start = performance.now();
      timerIntervalRef.current = window.setInterval(() => {
        setElapsedSeconds(Math.floor((performance.now() - start) / 1000));
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isLoading]);

  const handleHashChange = (val: string) => {
    setHash(val);
    if (validationError) setValidationError(null);
    if (apiError) setApiError(null);
  };

  const handleUseSample = () => {
    setHash(SAMPLE_HASH);
    setValidationError(null);
    if (apiError) setApiError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = hash.trim();
    const extracted = extractHash(clean);

    if (!extracted || !isValidHash(extracted)) {
      setValidationError('Enter a 0x-prefixed, 64-character hexadecimal transaction hash.');
      return;
    }

    setValidationError(null);
    setApiError(null);
    setIsLoading(true);

    abortControllerRef.current = new AbortController();

    try {
      const report = await createInvestigation(extracted, abortControllerRef.current.signal);
      setCachedReport(report);
      navigate(`/investigation/${report.investigationId}`);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setApiError({ code: 'CANCELLED', message: 'Investigation was cancelled in your browser.' });
      } else {
        setApiError({ code: err.code || 'UNKNOWN', message: err.message });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsLoading(false);
  };

  const formatTimer = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remainder = sec % 60;
    return `${mins}:${remainder.toString().padStart(2, '0')}`;
  };

  const errorInfo = apiError ? getErrorInfo(apiError.code, apiError.message) : null;

  return (
    <div className="investigate-page">
      {/* Title & One-sentence Lead */}
      <div className="investigate-page__hero">
        <h1 className="investigate-page__title" data-testid="page-title">
          Your Celo transaction failed. Find out why.
        </h1>
        <p className="investigate-page__subtitle text-2">
          Paste a Celo Mainnet transaction hash. RevertLens reads the receipt and execution trace, shows where the call failed, and states what the evidence does and does not prove.
        </p>
      </div>

      {/* Main Search Panel */}
      <form onSubmit={handleSubmit} className="investigate-form">
        <Panel title="Investigate Transaction">
          <div className="stack" style={{ gap: 'var(--s-3)' }}>
            <div>
              <label htmlFor="txHash" className="form-label" style={{ display: 'block', marginBottom: 'var(--s-1)', fontSize: '13px', fontWeight: 500 }}>
                Transaction hash
              </label>
              <HashInput
                id="txHash"
                value={hash}
                onChange={handleHashChange}
                disabled={isLoading}
                hasError={Boolean(validationError)}
                data-testid="tx-input"
              />
              {validationError && (
                <div
                  className="form-error"
                  role="alert"
                  data-testid="input-error"
                  style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-1)', marginTop: 'var(--s-1)', color: 'var(--fail-text)', fontSize: '13px' }}
                >
                  <AlertCircle size={14} />
                  <span>{validationError}</span>
                </div>
              )}
              <p className="text-3" style={{ fontSize: '12px', marginTop: 'var(--s-1)' }}>
                Celo Mainnet only (chain ID 42220). Read-only — no wallet or keys needed.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--s-2)', marginTop: 'var(--s-1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleUseSample}
                  disabled={isLoading}
                  data-testid="sample-button"
                >
                  Use sample failed transaction
                </Button>
                <span className="text-3" style={{ fontSize: '11px' }}>
                  (Known reverted swap, block 52,460,432)
                </span>
              </div>

              <Button
                type="submit"
                variant="primary"
                disabled={isLoading}
                data-testid="submit-investigate"
              >
                Investigate transaction
              </Button>
            </div>
          </div>
        </Panel>
      </form>

      {/* Honest In-Flight Loading State */}
      {isLoading && (
        <div className="loading-container" data-testid="loading-panel" style={{ marginTop: 'var(--s-4)' }}>
          <Panel>
            <div className="loading-bar-indicator" />
            <div className="stack" style={{ gap: 'var(--s-3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Investigating on Celo Mainnet</h3>
                <span className="mono text-lens" data-testid="loading-timer" style={{ fontSize: '15px', fontWeight: 600 }}>
                  {formatTimer(elapsedSeconds)}
                </span>
              </div>

              <p className="text-2" style={{ fontSize: '13px' }}>
                The server is reading the transaction, receipt and execution trace, then building the evidence ledger. This usually takes a few seconds.
              </p>

              <div className="loading-steps" style={{ fontSize: '13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', color: 'var(--ok-text)', marginBottom: 'var(--s-1)' }}>
                  <Check size={14} />
                  <span>Request sent</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', color: 'var(--lens)' }}>
                  <Clock size={14} className="pulse-icon" />
                  <span>Waiting for the server's response…</span>
                </div>
              </div>

              {elapsedSeconds > 20 && (
                <p className="text-warn" style={{ fontSize: '12px' }}>
                  Taking longer than usual. The RPC provider may be slow or rate-limiting.
                </p>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--s-2)' }}>
                <Button variant="ghost" size="sm" onClick={handleCancel}>
                  Cancel
                </Button>
              </div>
            </div>
          </Panel>
        </div>
      )}

      {/* Error Banner */}
      {errorInfo && !isLoading && (
        <div className="error-banner card" role="alert" style={{ marginTop: 'var(--s-4)', borderColor: 'var(--fail-line)', background: 'var(--fail-bg)', padding: 'var(--s-3)' }}>
          <div style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'flex-start' }}>
            <AlertCircle size={18} className="text-fail" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1 }}>
              <h4 className="text-fail" style={{ fontSize: '14px', fontWeight: 600, marginBottom: 'var(--s-1)' }}>
                {errorInfo.title}
              </h4>
              <p className="text-2" style={{ fontSize: '13px', marginBottom: errorInfo.actions.length ? 'var(--s-2)' : 0 }}>
                {errorInfo.detail}
              </p>
              {errorInfo.actions.length > 0 && (
                <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
                  {errorInfo.actions.map((act, i) => (
                    <Button key={i} variant="secondary" size="sm" onClick={() => setApiError(null)}>
                      {act}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* What the Outcomes Mean Collapsible Reference */}
      <div style={{ marginTop: 'var(--s-5)' }}>
        <details className="panel" style={{ background: 'var(--petrol-800)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 'var(--s-3)' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="text-2">What the outcomes mean</span>
            <ChevronDown size={14} className="text-3" />
          </summary>
          <div style={{ marginTop: 'var(--s-3)', borderTop: '1px solid var(--border)', paddingTop: 'var(--s-3)' }}>
            <div className="stack" style={{ gap: 'var(--s-2)' }}>
              {CAUSALITY_LEGEND.map(c => (
                <div key={c.status} style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center', fontSize: '13px' }}>
                  <Chip tone={c.info.tone}>{c.info.label}</Chip>
                  <span className="text-2">{c.info.meaning}</span>
                </div>
              ))}
            </div>
          </div>
        </details>
      </div>

      {/* Recent Investigations */}
      {recentList.length > 0 && (
        <div style={{ marginTop: 'var(--s-5)' }}>
          <Panel
            title="Recent Investigations"
            actions={
              <a href="#/history" className="text-lens" style={{ fontSize: '13px', textDecoration: 'none' }}>
                View all →
              </a>
            }
          >
            <div className="table-container">
              <table className="recent-table">
                <thead>
                  <tr>
                    <th>Transaction</th>
                    <th>Status</th>
                    <th>Investigated</th>
                  </tr>
                </thead>
                <tbody>
                  {recentList.map(item => (
                    <tr
                      key={item.id}
                      className="recent-row"
                      data-testid="recent-row"
                      onClick={() => navigate(`/investigation/${item.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="mono text-lens">
                        {shortHash(item.txHash)}
                      </td>
                      <td>
                        <Chip tone={txStatusTone(item.status)}>
                          {txStatusLabel(item.status)}
                        </Chip>
                      </td>
                      <td className="text-3" style={{ fontSize: '12px' }}>
                        {relativeTime(item.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
};
