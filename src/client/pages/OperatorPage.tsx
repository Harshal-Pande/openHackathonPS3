import React, { useState, useEffect } from 'react';
import { Panel } from '../components/Panel.js';
import { Button } from '../components/Button.js';
import { Chip } from '../components/Chip.js';
import { KeyValue } from '../components/KeyValue.js';
import { CopyButton } from '../components/CopyButton.js';
import { Modal } from '../components/Modal.js';
import { showToast } from '../components/Toast.js';
import { quoteStatusTone } from '../lib/status.js';
import { shortAddr, celoscanAddr, celoscanTx } from '../lib/format.js';
import type { BuyQuoteSummary, PurchaseAttemptRecord, BuyHealthStatus } from '../lib/types.js';
import { Lock, Unlock, ShieldAlert, AlertTriangle, RefreshCw, Zap, ExternalLink } from 'lucide-react';

export const OperatorPage: React.FC = () => {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<BuyQuoteSummary[]>([]);
  const [purchases, setPurchases] = useState<PurchaseAttemptRecord[]>([]);
  const [buyHealth, setBuyHealth] = useState<BuyHealthStatus | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<BuyQuoteSummary | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [confirmCheckbox, setConfirmCheckbox] = useState(false);
  const [hashConfirmInput, setHashConfirmInput] = useState('');
  const [approveError, setApproveError] = useState<string | null>(null);
  const [approveSuccess, setApproveSuccess] = useState<string | null>(null);
  const [executingQuoteId, setExecutingQuoteId] = useState<string | null>(null);
  const [resolvingPurchaseId, setResolvingPurchaseId] = useState<string | null>(null);
  const [killSwitchState, setKillSwitchState] = useState<'UNKNOWN' | 'ENGAGED' | 'DISENGAGED'>('UNKNOWN');
  const [killSwitchTimestamp, setKillSwitchTimestamp] = useState<string | null>(null);
  const [disengageModalOpen, setDisengageModalOpen] = useState(false);

  // Fetch quotes, health and purchases when unlocked
  const fetchQuotes = async (authToken: string) => {
    try {
      const res = await fetch('/api/operator/quotes', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.status === 401) {
        setToken(null);
        showToast('Operator session expired', 'fail');
        return;
      }
      const json = await res.json();
      if (json.data && Array.isArray(json.data)) {
        setQuotes(json.data);
      }
    } catch {
      showToast('Failed to load quotes', 'fail');
    }
  };

  const fetchPurchases = async (authToken: string) => {
    try {
      const res = await fetch('/api/operator/purchases', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data && Array.isArray(json.data)) {
          setPurchases(json.data);
        }
      }
    } catch {
      // ignore
    }
  };

  const fetchBuyHealth = async (authToken: string) => {
    try {
      const res = await fetch('/api/operator/buy-health', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setBuyHealth(json.data);
          if (json.data.killSwitchActive !== undefined) {
            setKillSwitchState(json.data.killSwitchActive ? 'ENGAGED' : 'DISENGAGED');
          }
        }
      }
    } catch {
      // ignore
    }
  };

  const refreshAll = (authToken: string) => {
    fetchQuotes(authToken);
    fetchPurchases(authToken);
    fetchBuyHealth(authToken);
  };

  useEffect(() => {
    if (token) {
      refreshAll(token);
    }
  }, [token]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    try {
      const res = await fetch('/api/operator/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setLoginError(json.error?.message || 'Invalid operator credentials.');
        return;
      }
      if (json.data?.token) {
        setToken(json.data.token);
        setPassword('');
        showToast('Operator console unlocked');
      }
    } catch (err: any) {
      setLoginError(err.message || 'Login request failed.');
    }
  };

  const handleLogout = async () => {
    if (token) {
      fetch('/api/operator/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    setToken(null);
    setQuotes([]);
    setPassword('');
    showToast('Operator console locked');
  };

  const handleApproveQuote = async () => {
    if (!token || !selectedQuote) return;
    setApproveError(null);
    setApproveSuccess(null);

    try {
      const res = await fetch(`/api/operator/quotes/${selectedQuote.quoteId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ expectedBodySha256: selectedQuote.bodySha256 }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        setApproveError(json.error?.message || 'Failed to approve quote.');
        return;
      }

      setApproveSuccess('Approved. No payment was executed (paidExecutionTriggered: false).');
      showToast('Quote approved');
      refreshAll(token);
    } catch (err: any) {
      setApproveError(err.message || 'Error executing approval.');
    }
  };

  const handleExecuteQuote = async (quote: BuyQuoteSummary) => {
    if (!token || !quote.approvalId) return;
    setExecutingQuoteId(quote.quoteId);

    try {
      const res = await fetch(`/api/operator/quotes/${quote.quoteId}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ approvalId: quote.approvalId }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        const msg = json.error?.message || 'Execution failed.';
        showToast(msg, 'fail');
      } else {
        const status = json.data?.result?.status || json.data?.purchaseAttempt?.status || 'PROCESSED';
        showToast(`Purchase execution: ${status}`, status === 'SETTLED' ? 'ok' : 'neutral');
      }
      refreshAll(token);
    } catch (err: any) {
      showToast(err.message || 'Execution error', 'fail');
    } finally {
      setExecutingQuoteId(null);
    }
  };

  const handleResolvePurchase = async (purchaseId: string) => {
    if (!token) return;
    setResolvingPurchaseId(purchaseId);
    try {
      const res = await fetch(`/api/operator/purchases/${purchaseId}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        showToast(json.error?.message || 'Resolution failed', 'fail');
      } else {
        showToast(json.data?.message || 'Settlement checked', 'neutral');
      }
      refreshAll(token);
    } catch {
      showToast('Resolution error', 'fail');
    } finally {
      setResolvingPurchaseId(null);
    }
  };

  const handleKillSwitch = async (enabled: boolean) => {
    if (!token) return;
    try {
      const res = await fetch('/api/operator/kill-switch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled }),
      });

      if (!res.ok) {
        showToast('Failed to toggle kill switch', 'fail');
        return;
      }

      setKillSwitchState(enabled ? 'ENGAGED' : 'DISENGAGED');
      setKillSwitchTimestamp(new Date().toLocaleTimeString());
      setDisengageModalOpen(false);
      showToast(`Kill switch ${enabled ? 'engaged' : 'disengaged'}`);
    } catch {
      showToast('Error updating kill switch', 'fail');
    }
  };

  // Last 6 chars verification
  const expectedLast6 = selectedQuote ? selectedQuote.bodySha256.slice(-6).toLowerCase() : '';
  const typedLast6 = hashConfirmInput.trim().toLowerCase();
  const hashMatches = Boolean(expectedLast6 && typedLast6 === expectedLast6);
  const canApprove = Boolean(
    selectedQuote?.status === 'AWAITING_OPERATOR_APPROVAL' &&
    confirmCheckbox &&
    hashMatches
  );

  return (
    <div className="operator-page stack" style={{ gap: 'var(--s-5)' }}>
      {/* 1px Warn-line Operator Area Banner */}
      <div
        className="operator-banner"
        style={{
          borderBottom: '1px solid var(--warn-line)',
          background: 'var(--warn-bg)',
          padding: 'var(--s-2) var(--s-3)',
          borderRadius: 'var(--r-md)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s-2)',
          color: 'var(--warn-text)',
          fontSize: '13px',
          fontWeight: 500,
        }}
      >
        <ShieldAlert size={16} />
        <span>Operator area — actions here can approve project-wallet payment quotes.</span>
      </div>

      {!token ? (
        /* Locked State */
        <div style={{ maxWidth: '440px', margin: '40px auto', width: '100%' }}>
          <Panel title="Operator Authentication" tag="Restricted">
            <form onSubmit={handleLogin} className="stack" style={{ gap: 'var(--s-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', color: 'var(--text-2)', fontSize: '13px' }}>
                <Lock size={16} />
                <span>Enter operator secret to manage payment quotes and security controls.</span>
              </div>

              <div>
                <label htmlFor="operatorPassword" style={{ display: 'block', marginBottom: 'var(--s-1)', fontSize: '13px', fontWeight: 500 }}>
                  Operator secret
                </label>
                <input
                  id="operatorPassword"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="off"
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 var(--s-3)',
                    background: 'var(--ink-850)',
                    border: '1px solid var(--border-strong)',
                    borderRadius: 'var(--r-md)',
                    color: 'var(--text-1)',
                    fontSize: '14px',
                  }}
                />
              </div>

              {loginError && (
                <p className="text-fail" role="alert" style={{ fontSize: '13px' }}>
                  {loginError}
                </p>
              )}

              <p className="text-3" style={{ fontSize: '12px' }}>
                Session is held in memory only; reloading locks the console.
              </p>

              <Button type="submit" variant="primary" icon={<Unlock size={14} />}>
                Unlock
              </Button>
            </form>
          </Panel>
        </div>
      ) : (
        /* Unlocked State */
        <div className="stack" style={{ gap: 'var(--s-5)' }}>
          {/* Header controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
              <span className="chip chip--ok">Unlocked</span>
              <span className="text-2" style={{ fontSize: '13px' }}>Authenticated Operator Session</span>
            </div>
            <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
              <Button variant="ghost" size="sm" onClick={() => refreshAll(token)} icon={<RefreshCw size={14} />}>
                Refresh
              </Button>
              <Button variant="secondary" size="sm" onClick={handleLogout} icon={<Lock size={14} />}>
                Lock
              </Button>
            </div>
          </div>

          {/* Buy CLI & Wallet Status Panel */}
          <Panel title="Buy CLI & Agent Wallet Readiness" tag="Payment Infrastructure">
            <div className="stack" style={{ gap: 'var(--s-3)' }}>
              <div className="grid grid--2col">
                <KeyValue label="Paying Wallet Address">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-1)' }}>
                    <span className="mono" style={{ fontSize: '13px' }}>
                      {buyHealth?.account ? shortAddr(buyHealth.account) : '0x3e1b...8e52'}
                    </span>
                    {buyHealth?.account && (
                      <a
                        href={celoscanAddr(buyHealth.account)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn--ghost btn--sm"
                        title="View on CeloScan"
                        style={{ padding: '2px 4px' }}
                      >
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                </KeyValue>
                <KeyValue label="Buy CLI Version">
                  <span className="mono">{buyHealth?.cliVersion || '@celo/buy@latest (0.8.5)'}</span>
                </KeyValue>
                <KeyValue label="Network">
                  <span className="mono">Celo Mainnet (Chain ID 42220)</span>
                </KeyValue>
                <KeyValue label="Wallet Readiness">
                  <Chip tone={buyHealth?.funded ? 'ok' : 'warn'}>
                    {buyHealth?.funded ? 'Funded & Ready' : 'Unfunded (0 CELO, 0 USDC)'}
                  </Chip>
                </KeyValue>
              </div>

              {!buyHealth?.funded && (
                <div
                  className="card"
                  style={{
                    padding: 'var(--s-2) var(--s-3)',
                    background: 'var(--warn-bg)',
                    borderColor: 'var(--warn-line)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--s-2)',
                    fontSize: '12px',
                    color: 'var(--warn-text)',
                  }}
                >
                  <AlertTriangle size={16} />
                  <span>
                    <strong>Wallet unfunded:</strong> Paid on-chain settlement is blocked until the agent wallet (<code>{buyHealth?.account || '0x3e1bef07824cd0E076F4907641F0A0EF27898e52'}</code>) is funded with CELO for gas and USDC for inference.
                  </span>
                </div>
              )}
            </div>
          </Panel>

          {/* Kill Switch Panel */}
          <Panel title="Global Kill Switch" tag="Emergency Control">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--s-3)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', marginBottom: 'var(--s-1)' }}>
                  <Chip tone={killSwitchState === 'ENGAGED' ? 'fail' : killSwitchState === 'DISENGAGED' ? 'neutral' : 'warn'}>
                    {killSwitchState === 'ENGAGED' ? 'Engaged' : killSwitchState === 'DISENGAGED' ? 'Disengaged' : 'State unknown'}
                  </Chip>
                  {killSwitchTimestamp && (
                    <span className="text-3" style={{ fontSize: '12px' }}>Updated {killSwitchTimestamp}</span>
                  )}
                </div>
                <p className="text-2" style={{ fontSize: '13px' }}>
                  Engaging blocks new quotes and approvals immediately across all endpoints.
                </p>
              </div>

              <div>
                {killSwitchState !== 'ENGAGED' ? (
                  <Button variant="danger" size="sm" onClick={() => handleKillSwitch(true)} icon={<AlertTriangle size={14} />}>
                    Engage kill switch
                  </Button>
                ) : (
                  <Button variant="secondary" size="sm" onClick={() => setDisengageModalOpen(true)}>
                    Disengage kill switch
                  </Button>
                )}
              </div>
            </div>
          </Panel>

          {/* Quotes Table */}
          <Panel title="Service Payment Quotes" tag="x402 Ledger">
            {quotes.length === 0 ? (
              <p className="text-3" style={{ padding: 'var(--s-4) 0', textAlign: 'center' }}>
                No quotes recorded.
              </p>
            ) : (
              <div className="table-container">
                <table className="quotes-table">
                  <thead>
                    <tr>
                      <th>Quote ID</th>
                      <th>Capability</th>
                      <th>Amount</th>
                      <th>Payee</th>
                      <th>Status</th>
                      <th>Expires</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.map(q => (
                      <tr key={q.quoteId}>
                        <td className="mono text-2">{q.quoteId.slice(0, 10)}...</td>
                        <td className="mono text-1" style={{ fontSize: '13px' }}>{q.capabilityId}</td>
                        <td className="text-1" style={{ fontSize: '13px' }}>
                          <strong>{q.amountDisplay}</strong> <span className="text-3">({q.amountAtomic} {q.tokenSymbol})</span>
                        </td>
                        <td className="mono text-2">{shortAddr(q.recipient)}</td>
                        <td>
                          <Chip tone={quoteStatusTone(q.status)}>
                            {q.status}
                          </Chip>
                        </td>
                        <td className="text-2" style={{ fontSize: '12px' }}>
                          {q.expiry ? new Date(q.expiry).toLocaleTimeString() : '—'}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 'var(--s-1)', justifyContent: 'flex-end' }}>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setSelectedQuote(q);
                                setConfirmCheckbox(false);
                                setHashConfirmInput('');
                                setApproveError(null);
                                setApproveSuccess(null);
                                setReviewModalOpen(true);
                              }}
                            >
                              Review
                            </Button>
                            {q.status === 'APPROVED' && q.approvalId && (
                              <Button
                                variant="primary"
                                size="sm"
                                disabled={executingQuoteId === q.quoteId}
                                onClick={() => handleExecuteQuote(q)}
                                icon={<Zap size={14} />}
                              >
                                {executingQuoteId === q.quoteId ? 'Executing...' : 'Execute'}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {/* Purchases & Settlement Ledger */}
          <Panel title="Purchases & Settlement Ledger" tag="On-Chain Settlement">
            {purchases.length === 0 ? (
              <p className="text-3" style={{ padding: 'var(--s-4) 0', textAlign: 'center' }}>
                No purchases executed yet.
              </p>
            ) : (
              <div className="table-container">
                <table className="quotes-table">
                  <thead>
                    <tr>
                      <th>Attempt ID</th>
                      <th>Quote ID</th>
                      <th>Capability</th>
                      <th>Status</th>
                      <th>Settlement TX</th>
                      <th>Date</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.map(p => (
                      <tr key={p.id}>
                        <td className="mono text-2">{p.id.slice(0, 10)}...</td>
                        <td className="mono text-2">{p.quoteId.slice(0, 10)}...</td>
                        <td className="mono text-1" style={{ fontSize: '13px' }}>{p.capabilityId}</td>
                        <td>
                          <Chip tone={p.status === 'SETTLED' ? 'ok' : p.status === 'SETTLEMENT_UNKNOWN' ? 'warn' : p.status === 'FAILED' ? 'fail' : 'neutral'}>
                            {p.status}
                          </Chip>
                        </td>
                        <td className="mono text-2">
                          {p.settlementTxHash ? (
                            <a
                              href={celoscanTx(p.settlementTxHash)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-link"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                            >
                              {p.settlementTxHash.slice(0, 10)}... <ExternalLink size={10} />
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="text-2" style={{ fontSize: '12px' }}>
                          {new Date(p.createdAt).toLocaleTimeString()}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {p.status === 'SETTLEMENT_UNKNOWN' && (
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={resolvingPurchaseId === p.id}
                              onClick={() => handleResolvePurchase(p.id)}
                            >
                              Resolve
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* Review & Approve Modal */}
      {selectedQuote && (
        <Modal
          open={reviewModalOpen}
          onClose={() => setReviewModalOpen(false)}
          title={`Review Quote ${selectedQuote.quoteId.slice(0, 10)}...`}
        >
          <div className="stack" style={{ gap: 'var(--s-3)' }}>
            <div className="card" style={{ padding: 'var(--s-2) var(--s-3)', background: 'var(--warn-bg)', borderColor: 'var(--warn-line)' }}>
              <p className="text-warn" style={{ fontSize: '12px' }}>
                Approving records operator consent for this exact quote. This app does not execute the payment.
              </p>
            </div>

            <div className="grid grid--2col">
              <KeyValue label="Capability">
                <span className="mono">{selectedQuote.capabilityId}</span>
              </KeyValue>
              <KeyValue label="Method / URL">
                <span className="mono">{selectedQuote.method} {selectedQuote.url}</span>
              </KeyValue>
              <KeyValue label="Quoted Price">
                <span className="mono">{selectedQuote.amountDisplay} ({selectedQuote.amountAtomic} {selectedQuote.tokenSymbol})</span>
              </KeyValue>
              <KeyValue label="Payee">
                <span className="mono">{shortAddr(selectedQuote.recipient)}</span>
                <a href={celoscanAddr(selectedQuote.recipient)} target="_blank" rel="noopener noreferrer" className="btn btn--ghost btn--sm">
                  ↗
                </a>
              </KeyValue>
            </div>

            <div>
              <span className="text-3" style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>
                Full Request Body SHA-256:
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-1)' }}>
                <pre className="code-well" style={{ flex: 1, padding: '6px', fontSize: '11px', margin: 0 }}>
                  {selectedQuote.bodySha256}
                </pre>
                <CopyButton text={selectedQuote.bodySha256} label="Copy SHA-256" onCopy={() => showToast('Hash copied')} />
              </div>
            </div>

            {selectedQuote.status === 'AWAITING_OPERATOR_APPROVAL' ? (
              <div className="approval-controls stack" style={{ gap: 'var(--s-2)', borderTop: '1px solid var(--border)', paddingTop: 'var(--s-3)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', fontSize: '13px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={confirmCheckbox}
                    onChange={e => setConfirmCheckbox(e.target.checked)}
                  />
                  <span>I reviewed the amount, payee and request hash</span>
                </label>

                <div>
                  <label htmlFor="hashConfirm" style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '4px' }}>
                    Type the last 6 characters of the request hash (<code>{expectedLast6}</code>):
                  </label>
                  <input
                    id="hashConfirm"
                    type="text"
                    value={hashConfirmInput}
                    onChange={e => setHashConfirmInput(e.target.value)}
                    placeholder={expectedLast6}
                    style={{
                      width: '120px',
                      height: '32px',
                      fontFamily: 'var(--font-mono)',
                      padding: '0 8px',
                      background: 'var(--ink-850)',
                      border: '1px solid var(--border-strong)',
                      borderRadius: 'var(--r-sm)',
                      color: 'var(--text-1)'
                    }}
                  />
                </div>

                {approveError && (
                  <p className="text-fail" role="alert" style={{ fontSize: '12px' }}>{approveError}</p>
                )}

                {approveSuccess && (
                  <p className="text-ok" role="status" style={{ fontSize: '12px' }}>{approveSuccess}</p>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--s-2)', marginTop: 'var(--s-2)' }}>
                  <Button variant="ghost" size="sm" onClick={() => setReviewModalOpen(false)}>
                    Close
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!canApprove}
                    onClick={handleApproveQuote}
                  >
                    Approve quote
                  </Button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--s-3)' }}>
                <Button variant="ghost" size="sm" onClick={() => setReviewModalOpen(false)}>
                  Close
                </Button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Disengage Confirmation Modal */}
      <Modal
        open={disengageModalOpen}
        onClose={() => setDisengageModalOpen(false)}
        title="Confirm Kill Switch Disengagement"
      >
        <div className="stack" style={{ gap: 'var(--s-3)' }}>
          <p className="text-2" style={{ fontSize: '13px' }}>
            Disengaging the kill switch will allow new payment quote requests and operator approvals to resume.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--s-2)' }}>
            <Button variant="ghost" size="sm" onClick={() => setDisengageModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="secondary" size="sm" onClick={() => handleKillSwitch(false)}>
              Confirm Disengage
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
