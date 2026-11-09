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
import type {
  BuyQuoteSummary,
  PurchaseAttemptRecord,
  BuyHealthStatus,
  Erc8004StatusResponse,
  SystemStatusResponse,
} from '../lib/types.js';
import {
  Lock,
  Unlock,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  Zap,
  ExternalLink,
  Wallet,
  CheckCircle2,
  AlertCircle,
  Radio,
  Loader2,
  Server,
  Database,
  Activity,
} from 'lucide-react';

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

  // ERC-8004 Registration State
  const [erc8004Data, setErc8004Data] = useState<Erc8004StatusResponse | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const [isSwitchingChain, setIsSwitchingChain] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [confirmRegistryCheckbox, setConfirmRegistryCheckbox] = useState(false);
  const [confirmPhraseInput, setConfirmPhraseInput] = useState('');
  const [registrationBroadcastTx, setRegistrationBroadcastTx] = useState<string | null>(null);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [registrationSuccess, setRegistrationSuccess] = useState<string | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatusResponse | null>(null);

  // Detect injected browser wallet
  useEffect(() => {
    const eth = typeof window !== 'undefined' ? (window as any).ethereum : null;
    if (!eth) return;

    eth
      .request({ method: 'eth_accounts' })
      .then((accounts: string[]) => {
        if (accounts && accounts.length > 0) {
          setWalletAddress(accounts[0]);
        }
      })
      .catch(() => {});

    eth
      .request({ method: 'eth_chainId' })
      .then((chainHex: string) => {
        if (chainHex) {
          setWalletChainId(parseInt(chainHex, 16));
        }
      })
      .catch(() => {});

    const handleAccountsChanged = (accounts: string[]) => {
      setWalletAddress(accounts && accounts.length > 0 ? accounts[0] : null);
    };

    const handleChainChanged = (chainHex: string) => {
      setWalletChainId(parseInt(chainHex, 16));
    };

    eth.on?.('accountsChanged', handleAccountsChanged);
    eth.on?.('chainChanged', handleChainChanged);

    return () => {
      eth.removeListener?.('accountsChanged', handleAccountsChanged);
      eth.removeListener?.('chainChanged', handleChainChanged);
    };
  }, []);

  // Fetch quotes, health, purchases and ERC-8004 status when unlocked
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

  const fetchErc8004Status = async (authToken: string) => {
    try {
      const res = await fetch('/api/operator/erc8004/status', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.agent && json.livePreflight) {
          setErc8004Data(json);
        }
      }
    } catch {
      // ignore
    }
  };

  const fetchSystemStatus = async (authToken: string) => {
    try {
      const res = await fetch('/api/operator/system-status', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.version && json.database) {
          setSystemStatus(json);
        }
      }
    } catch {
      // ignore
    }
  };

  const refreshAll = (authToken: string) => {
    fetchSystemStatus(authToken);
    fetchQuotes(authToken);
    fetchPurchases(authToken);
    fetchBuyHealth(authToken);
    fetchErc8004Status(authToken);
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

  const handleConnectWallet = async () => {
    const eth = typeof window !== 'undefined' ? (window as any).ethereum : null;
    if (!eth) {
      showToast('No injected Web3 browser wallet detected (install MetaMask or Rabby)', 'fail');
      return;
    }
    setIsConnectingWallet(true);
    try {
      const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' });
      if (accounts && accounts.length > 0) {
        setWalletAddress(accounts[0]);
        const chainHex: string = await eth.request({ method: 'eth_chainId' });
        setWalletChainId(parseInt(chainHex, 16));
        showToast('Browser wallet connected', 'ok');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to connect wallet', 'fail');
    } finally {
      setIsConnectingWallet(false);
    }
  };

  const handleSwitchNetwork = async () => {
    const eth = typeof window !== 'undefined' ? (window as any).ethereum : null;
    if (!eth) return;
    setIsSwitchingChain(true);
    try {
      await eth.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0xa4ec' }], // Celo Mainnet 42220
      });
      setWalletChainId(42220);
      showToast('Switched to Celo Mainnet', 'ok');
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        try {
          await eth.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: '0xa4ec',
                chainName: 'Celo Mainnet',
                nativeCurrency: { name: 'CELO', symbol: 'CELO', decimals: 18 },
                rpcUrls: ['https://forno.celo.org'],
                blockExplorerUrls: ['https://celoscan.io'],
              },
            ],
          });
          setWalletChainId(42220);
          showToast('Added and switched to Celo Mainnet', 'ok');
        } catch (addError: any) {
          showToast(addError.message || 'Failed to add Celo Mainnet', 'fail');
        }
      } else {
        showToast(switchError.message || 'Failed to switch network', 'fail');
      }
    } finally {
      setIsSwitchingChain(false);
    }
  };

  const REQUIRED_REGISTRATION_PHRASE = 'REGISTER REVERTLENS ON CELO MAINNET';
  const phraseMatches = confirmPhraseInput.trim() === REQUIRED_REGISTRATION_PHRASE;

  const handleBroadcastRegistration = async () => {
    if (!token || !erc8004Data) return;
    const eth = typeof window !== 'undefined' ? (window as any).ethereum : null;
    if (!eth || !walletAddress) {
      showToast('Wallet not connected', 'fail');
      return;
    }
    if (walletChainId !== 42220) {
      showToast('Wallet must be on Celo Mainnet (Chain ID 42220)', 'fail');
      return;
    }
    if (!phraseMatches) {
      setRegistrationError(`You must type "${REQUIRED_REGISTRATION_PHRASE}" exactly.`);
      return;
    }
    if (!confirmRegistryCheckbox) {
      setRegistrationError('Please verify the destination registry and attribution acknowledgement.');
      return;
    }

    setRegistrationError(null);
    setRegistrationSuccess(null);
    setIsBroadcasting(true);

    try {
      // Fetch latest prepared registration transaction payload
      const txRes = await fetch('/api/agent/erc8004-registration-tx');
      const txJson = await txRes.json();
      if (!txJson.transaction || !txJson.transaction.data) {
        throw new Error(txJson.error?.message || 'Failed to fetch registration payload.');
      }

      const txTo = txJson.transaction.to;
      const txData = txJson.transaction.data;

      // Broadcast transaction via injected wallet
      const txHash: string = await eth.request({
        method: 'eth_sendTransaction',
        params: [
          {
            from: walletAddress,
            to: txTo,
            data: txData,
            value: '0x0',
            gas: '0x55730', // 350,000 gas limit in hex
          },
        ],
      });

      if (!txHash || typeof txHash !== 'string' || !txHash.startsWith('0x')) {
        throw new Error('Wallet did not return a valid transaction hash.');
      }

      setRegistrationBroadcastTx(txHash);
      showToast(`Registration broadcast! Hash: ${txHash.slice(0, 10)}...`, 'ok');

      // Record pending broadcast in SQLite database
      await fetch('/api/operator/erc8004/record-pending', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          txHash,
          fromAddress: walletAddress,
        }),
      });

      // Refresh status immediately
      fetchErc8004Status(token);

      // Start automatic receipt verification polling
      pollVerification(txHash, token);
    } catch (err: any) {
      const msg = err.message || 'Broadcast rejected or failed.';
      setRegistrationError(msg);
      showToast(msg, 'fail');
    } finally {
      setIsBroadcasting(false);
    }
  };

  const pollVerification = async (txHash: string, authToken: string) => {
    setIsVerifying(true);
    let attempts = 0;
    const maxAttempts = 20;

    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch('/api/operator/erc8004/verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ txHash }),
        });
        const json = await res.json();

        if (json.verified && (json.status === 'VERIFIED_REGISTERED' || json.status === 'CONFIRMED')) {
          clearInterval(interval);
          setIsVerifying(false);
          setRegistrationSuccess(`Agent verified on Celo Mainnet! Registered Agent ID: #${json.agentId}`);
          showToast(`Agent verified on-chain! ID #${json.agentId}`, 'ok');
          fetchErc8004Status(authToken);
        } else if (json.status === 'REVERTED') {
          clearInterval(interval);
          setIsVerifying(false);
          setRegistrationError(`Registration transaction reverted on-chain: ${json.reason || 'Reverted'}`);
          showToast('Registration transaction reverted', 'fail');
          fetchErc8004Status(authToken);
        } else if (attempts >= maxAttempts) {
          clearInterval(interval);
          setIsVerifying(false);
          showToast('Transaction is pending mining. You can verify anytime in the table below.', 'neutral');
          fetchErc8004Status(authToken);
        }
      } catch {
        if (attempts >= maxAttempts) {
          clearInterval(interval);
          setIsVerifying(false);
        }
      }
    }, 3500);
  };

  const handleManualVerify = async (txHash: string) => {
    if (!token) return;
    setIsVerifying(true);
    try {
      const res = await fetch('/api/operator/erc8004/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ txHash }),
      });
      const json = await res.json();
      if (json.verified) {
        showToast(`Verified! Agent ID #${json.agentId}`, 'ok');
        setRegistrationSuccess(`Confirmed on Celo Mainnet! Agent ID #${json.agentId}`);
      } else {
        showToast(`Status: ${json.status || 'PENDING'}`, 'neutral');
      }
      fetchErc8004Status(token);
    } catch {
      showToast('Verification request failed', 'fail');
    } finally {
      setIsVerifying(false);
    }
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

          {/* System Overview & Node Status */}
          <Panel title="System Status & Persistence Control Center" tag="Infrastructure">
            <div className="stack" style={{ gap: 'var(--s-3)' }}>
              <div className="grid grid--2col">
                <KeyValue label="Engine & Version">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-1)' }}>
                    <Server size={14} className="text-info" />
                    <span className="mono">v{systemStatus?.version || '0.1.0'} ({systemStatus?.environment || 'production'})</span>
                  </div>
                </KeyValue>

                <KeyValue label="Celo Mainnet RPC">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-1)' }}>
                    <Activity size={14} className={systemStatus?.rpc?.connected ? 'text-ok' : 'text-warn'} />
                    <span className="mono">
                      {systemStatus?.rpc?.connected
                        ? `Connected (${systemStatus.rpc.latencyMs}ms)`
                        : 'Chainstack (Chain ID 42220)'}
                    </span>
                    <Chip tone={systemStatus?.rpc?.connected ? 'ok' : 'neutral'}>
                      {systemStatus?.rpc?.connected ? 'Live RPC' : 'Active'}
                    </Chip>
                  </div>
                </KeyValue>

                <KeyValue label="SQLite Persistence">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-1)' }}>
                    <Database size={14} className="text-1" />
                    <span className="mono">{systemStatus?.database?.journalMode?.toUpperCase() || 'WAL'} Mode</span>
                    <span className="text-3" style={{ fontSize: '11px' }}>
                      ({systemStatus?.database?.path?.replace('/app/data/', '') || 'revertlens.sqlite'})
                    </span>
                  </div>
                </KeyValue>

                <KeyValue label="Uptime">
                  <span className="mono">
                    {systemStatus?.uptimeSeconds !== undefined
                      ? `${Math.floor(systemStatus.uptimeSeconds / 60)}m ${systemStatus.uptimeSeconds % 60}s`
                      : 'Active'}
                  </span>
                </KeyValue>
              </div>

              {/* Live Record Counts */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: 'var(--s-2)',
                  paddingTop: 'var(--s-2)',
                  borderTop: '1px solid var(--border)',
                }}
              >
                <div className="card" style={{ padding: 'var(--s-2)', textAlign: 'center', background: 'var(--ink-850)' }}>
                  <div className="text-3" style={{ fontSize: '11px' }}>Investigations</div>
                  <div className="mono" style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-1)' }}>
                    {systemStatus?.database?.counts?.investigations ?? 0}
                  </div>
                </div>

                <div className="card" style={{ padding: 'var(--s-2)', textAlign: 'center', background: 'var(--ink-850)' }}>
                  <div className="text-3" style={{ fontSize: '11px' }}>Evidence Items</div>
                  <div className="mono" style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-1)' }}>
                    {systemStatus?.database?.counts?.evidenceItems ?? 0}
                  </div>
                </div>

                <div className="card" style={{ padding: 'var(--s-2)', textAlign: 'center', background: 'var(--ink-850)' }}>
                  <div className="text-3" style={{ fontSize: '11px' }}>Payment Quotes</div>
                  <div className="mono" style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-1)' }}>
                    {systemStatus?.database?.counts?.quotes ?? quotes.length}
                  </div>
                </div>

                <div className="card" style={{ padding: 'var(--s-2)', textAlign: 'center', background: 'var(--ink-850)' }}>
                  <div className="text-3" style={{ fontSize: '11px' }}>Purchases</div>
                  <div className="mono" style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-1)' }}>
                    {systemStatus?.database?.counts?.purchases ?? purchases.length}
                  </div>
                </div>

                <div className="card" style={{ padding: 'var(--s-2)', textAlign: 'center', background: 'var(--ink-850)' }}>
                  <div className="text-3" style={{ fontSize: '11px' }}>Agent Registrations</div>
                  <div className="mono" style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-1)' }}>
                    {systemStatus?.database?.counts?.registrations ?? (erc8004Data?.allRegistrations?.length ?? 0)}
                  </div>
                </div>
              </div>
            </div>
          </Panel>

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

          {/* ERC-8004 Agent Identity Registration Console */}
          <Panel title="ERC-8004 Agent Identity Registration" tag="Celo Mainnet Registry">
            <div className="stack" style={{ gap: 'var(--s-4)' }}>
              {/* Top Banner / Active Status */}
              {erc8004Data?.latestRegistration?.status === 'CONFIRMED' ? (
                <div
                  className="card"
                  style={{
                    padding: 'var(--s-3)',
                    background: 'rgba(34, 197, 94, 0.08)',
                    borderColor: 'rgba(34, 197, 94, 0.3)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--s-2)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--s-2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
                      <CheckCircle2 size={18} className="text-ok" />
                      <strong style={{ fontSize: '15px' }} className="text-ok">
                        Agent Identity Confirmed & Verified on Celo Mainnet
                      </strong>
                    </div>
                    <Chip tone="ok">Agent ID #{erc8004Data.latestRegistration.agent_id}</Chip>
                  </div>
                  <div className="grid grid--2col" style={{ fontSize: '13px' }}>
                    <KeyValue label="Registered Agent ID">
                      <span className="mono" style={{ fontSize: '14px', fontWeight: 700 }}>
                        #{erc8004Data.latestRegistration.agent_id}
                      </span>
                    </KeyValue>
                    <KeyValue label="Attribution Tag">
                      <span className="mono text-lens">{erc8004Data.agent.attributionTag}</span>
                    </KeyValue>
                    <KeyValue label="Confirmation Block">
                      <span className="mono">{erc8004Data.latestRegistration.block_number ?? 'Mined'}</span>
                    </KeyValue>
                    <KeyValue label="Transaction Hash">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-1)' }}>
                        <span className="mono">{shortAddr(erc8004Data.latestRegistration.tx_hash)}</span>
                        <a
                          href={celoscanTx(erc8004Data.latestRegistration.tx_hash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn--ghost btn--sm"
                          style={{ padding: '2px 4px' }}
                          title="View on CeloScan"
                        >
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    </KeyValue>
                  </div>
                </div>
              ) : (
                <div
                  className="card"
                  style={{
                    padding: 'var(--s-3)',
                    background: 'var(--ink-850)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--s-2)', marginBottom: 'var(--s-2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
                      <Radio size={16} className="text-info" />
                      <span style={{ fontSize: '14px', fontWeight: 600 }}>Celo Mainnet Registration Status</span>
                    </div>
                    <Chip
                      tone={
                        erc8004Data?.livePreflight?.lifecycleStatus === 'VERIFIED_REGISTERED'
                          ? 'ok'
                          : erc8004Data?.livePreflight?.lifecycleStatus === 'PENDING_CONFIRMATION'
                            ? 'warn'
                            : erc8004Data?.livePreflight?.lifecycleStatus === 'INSUFFICIENT_BALANCE'
                              ? 'warn'
                              : 'info'
                      }
                    >
                      {erc8004Data?.livePreflight?.lifecycleStatus || 'CHECKING'}
                    </Chip>
                  </div>

                  <p className="text-2" style={{ fontSize: '13px', lineHeight: 1.5 }}>
                    Registers RevertLens with the official Celo Mainnet ERC-8004 Identity Registry, binding the canonical metadata URI (<code>/api/agent/metadata</code>) with ERC-8021 attribution tag (<code>{erc8004Data?.agent?.attributionTag || 'celo_235f6ef56f5b'}</code>).
                  </p>
                </div>
              )}

              {/* Identity & Registry Target Specs */}
              <div className="grid grid--2col">
                <KeyValue label="Identity Registry Contract">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-1)' }}>
                    <span className="mono" style={{ fontSize: '13px' }}>
                      {erc8004Data?.agent?.registryAddress ? shortAddr(erc8004Data.agent.registryAddress) : '0x8004...a432'}
                    </span>
                    <CopyButton text={erc8004Data?.agent?.registryAddress || '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432'} label="Copy registry" onCopy={() => showToast('Registry copied')} />
                    <a
                      href={celoscanAddr(erc8004Data?.agent?.registryAddress || '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn--ghost btn--sm"
                      style={{ padding: '2px 4px' }}
                      title="View on CeloScan"
                    >
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </KeyValue>

                <KeyValue label="Designated Agent Wallet">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-1)' }}>
                    <span className="mono" style={{ fontSize: '13px' }}>
                      {erc8004Data?.agent?.agentWallet ? shortAddr(erc8004Data.agent.agentWallet) : '0x3e1b...8e52'}
                    </span>
                    <CopyButton text={erc8004Data?.agent?.agentWallet || '0x3e1bef07824cd0E076F4907641F0A0EF27898e52'} label="Copy wallet" onCopy={() => showToast('Wallet copied')} />
                    <a
                      href={celoscanAddr(erc8004Data?.agent?.agentWallet || '0x3e1bef07824cd0E076F4907641F0A0EF27898e52')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn--ghost btn--sm"
                      style={{ padding: '2px 4px' }}
                      title="View on CeloScan"
                    >
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </KeyValue>

                <KeyValue label="Live Celo Gas Price">
                  <span className="mono">{erc8004Data?.livePreflight?.gasPriceGwei || '200.00'} Gwei</span>
                </KeyValue>

                <KeyValue label="Estimated Gas & Cost">
                  <span className="mono">
                    350,000 limit (~{erc8004Data?.livePreflight?.estimatedCostCelo || '0.036'} CELO)
                  </span>
                </KeyValue>
              </div>

              {/* Wallet Connection & Preflight Section */}
              <div
                className="card stack"
                style={{
                  padding: 'var(--s-3)',
                  gap: 'var(--s-3)',
                  border: '1px solid var(--border-strong)',
                  background: 'var(--ink-900)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--s-2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
                    <Wallet size={16} className="text-1" />
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>Browser Wallet Status</span>
                  </div>

                  <div>
                    {!walletAddress ? (
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={isConnectingWallet}
                        onClick={handleConnectWallet}
                        icon={isConnectingWallet ? <Loader2 size={14} className="spin" /> : <Wallet size={14} />}
                      >
                        {isConnectingWallet ? 'Connecting...' : 'Connect Browser Wallet'}
                      </Button>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
                        <span className="chip chip--ok">Connected: {shortAddr(walletAddress)}</span>
                        {walletChainId === 42220 ? (
                          <span className="chip chip--neutral">Celo Mainnet (42220)</span>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={isSwitchingChain}
                            onClick={handleSwitchNetwork}
                            icon={isSwitchingChain ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
                          >
                            Switch to Celo Mainnet
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {walletAddress && walletChainId !== 42220 && (
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
                      <strong>Wrong network:</strong> Connected to Chain ID {walletChainId ?? 'unknown'}. Please click <strong>Switch to Celo Mainnet</strong> (Chain ID 42220) above.
                    </span>
                  </div>
                )}

                {walletAddress &&
                  erc8004Data?.agent?.agentWallet &&
                  walletAddress.toLowerCase() !== erc8004Data.agent.agentWallet.toLowerCase() && (
                    <div
                      className="card"
                      style={{
                        padding: 'var(--s-2) var(--s-3)',
                        background: 'rgba(234, 179, 8, 0.1)',
                        borderColor: 'rgba(234, 179, 8, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--s-2)',
                        fontSize: '12px',
                        color: 'var(--text-1)',
                      }}
                    >
                      <AlertCircle size={16} className="text-warn" />
                      <span>
                        <strong>Note:</strong> Connected address (<code>{shortAddr(walletAddress)}</code>) is different from the configured agent wallet (<code>{shortAddr(erc8004Data.agent.agentWallet)}</code>). Ensure you switch accounts in your wallet so the intended address registers and controls this Agent ID.
                      </span>
                    </div>
                  )}

                {/* Preflight Balance Check */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 'var(--s-2) var(--s-3)',
                    background: 'var(--ink-850)',
                    borderRadius: 'var(--r-sm)',
                    fontSize: '13px',
                  }}
                >
                  <span className="text-2">Agent Wallet Celo Balance:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
                    <span className="mono" style={{ fontWeight: 600 }}>
                      {erc8004Data?.livePreflight?.balanceCelo || '0.000000'} CELO
                    </span>
                    <Chip tone={erc8004Data?.livePreflight?.hasSufficientBalance ? 'ok' : 'warn'}>
                      {erc8004Data?.livePreflight?.hasSufficientBalance ? 'Sufficient for Gas' : 'Zero / Insufficient'}
                    </Chip>
                  </div>
                </div>

                {!erc8004Data?.livePreflight?.hasSufficientBalance && (
                  <div
                    className="card"
                    style={{
                      padding: 'var(--s-2) var(--s-3)',
                      background: 'rgba(234, 179, 8, 0.08)',
                      borderColor: 'rgba(234, 179, 8, 0.25)',
                      fontSize: '12px',
                      color: 'var(--text-2)',
                      lineHeight: 1.5,
                    }}
                  >
                    <p style={{ margin: 0 }}>
                      <strong>Gas Funding Required:</strong> To broadcast on Celo Mainnet, the signing wallet needs approximately ~{erc8004Data?.livePreflight?.estimatedCostCelo || '0.036'} CELO for gas.
                      Deposit ~0.05 CELO to <code className="mono">{erc8004Data?.agent?.agentWallet || '0x3e1bef07824cd0E076F4907641F0A0EF27898e52'}</code>.
                    </p>
                  </div>
                )}
              </div>

              {/* Operator Confirmation & Broadcast Gate */}
              {erc8004Data?.latestRegistration?.status !== 'CONFIRMED' && (
                <div
                  className="card stack"
                  style={{
                    padding: 'var(--s-3)',
                    gap: 'var(--s-3)',
                    border: '1px solid var(--border)',
                    background: 'var(--ink-850)',
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-1)' }}>
                    Operator Broadcast Confirmation Gate
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', fontSize: '13px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={confirmRegistryCheckbox}
                      onChange={e => setConfirmRegistryCheckbox(e.target.checked)}
                    />
                    <span>
                      I verify the target registry (<code>0x8004A169FB4a3325136EB29fA0ceB6D2e539a432</code>), chain ID 42220, and attribution tag (<code>celo_235f6ef56f5b</code>).
                    </span>
                  </label>

                  <div>
                    <label htmlFor="confirmRegPhrase" style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '4px' }}>
                      Type <code>{REQUIRED_REGISTRATION_PHRASE}</code> to unlock signing:
                    </label>
                    <input
                      id="confirmRegPhrase"
                      type="text"
                      value={confirmPhraseInput}
                      onChange={e => setConfirmPhraseInput(e.target.value)}
                      placeholder={REQUIRED_REGISTRATION_PHRASE}
                      style={{
                        width: '100%',
                        height: '36px',
                        fontFamily: 'var(--font-mono)',
                        padding: '0 var(--s-3)',
                        background: 'var(--ink-900)',
                        border: '1px solid var(--border-strong)',
                        borderRadius: 'var(--r-sm)',
                        color: 'var(--text-1)',
                        fontSize: '13px',
                      }}
                    />
                  </div>

                  {registrationError && (
                    <p className="text-fail" role="alert" style={{ fontSize: '12px', margin: 0 }}>
                      {registrationError}
                    </p>
                  )}

                  {registrationSuccess && (
                    <p className="text-ok" role="status" style={{ fontSize: '12px', margin: 0 }}>
                      {registrationSuccess}
                    </p>
                  )}

                  {registrationBroadcastTx && (
                    <div style={{ fontSize: '12px', color: 'var(--text-2)' }}>
                      Broadcast transaction:{' '}
                      <a
                        href={celoscanTx(registrationBroadcastTx)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-link mono"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                      >
                        {registrationBroadcastTx.slice(0, 14)}... <ExternalLink size={10} />
                      </a>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--s-2)', marginTop: 'var(--s-1)' }}>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={
                        !walletAddress ||
                        walletChainId !== 42220 ||
                        !confirmRegistryCheckbox ||
                        !phraseMatches ||
                        isBroadcasting ||
                        isVerifying
                      }
                      onClick={handleBroadcastRegistration}
                      icon={
                        isBroadcasting || isVerifying ? (
                          <Loader2 size={14} className="spin" />
                        ) : (
                          <Zap size={14} />
                        )
                      }
                    >
                      {isBroadcasting
                        ? 'Broadcasting via Wallet...'
                        : isVerifying
                          ? 'Verifying On-Chain Receipt...'
                          : 'Sign & Broadcast with Wallet'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Registration History / Audit Ledger */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: 'var(--s-2)' }}>
                  On-Chain Registration Records
                </div>

                {(!erc8004Data?.allRegistrations || erc8004Data.allRegistrations.length === 0) ? (
                  <p className="text-3" style={{ fontSize: '13px', padding: 'var(--s-2) 0' }}>
                    No registration transactions recorded in local database yet.
                  </p>
                ) : (
                  <div className="table-container">
                    <table className="quotes-table">
                      <thead>
                        <tr>
                          <th>Tx Hash</th>
                          <th>Status</th>
                          <th>Agent ID</th>
                          <th>Block</th>
                          <th>Fee Paid</th>
                          <th>Timestamp</th>
                          <th style={{ textAlign: 'right' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {erc8004Data.allRegistrations.map(reg => (
                          <tr key={reg.id}>
                            <td className="mono text-2">
                              <a
                                href={celoscanTx(reg.tx_hash)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-link"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                              >
                                {reg.tx_hash.slice(0, 10)}... <ExternalLink size={10} />
                              </a>
                            </td>
                            <td>
                              <Chip
                                tone={
                                  reg.status === 'CONFIRMED'
                                    ? 'ok'
                                    : reg.status === 'PENDING_CONFIRMATION'
                                      ? 'warn'
                                      : 'fail'
                                }
                              >
                                {reg.status}
                              </Chip>
                            </td>
                            <td className="mono text-1">{reg.agent_id ? `#${reg.agent_id}` : '—'}</td>
                            <td className="mono text-2">{reg.block_number ?? '—'}</td>
                            <td className="mono text-2" style={{ fontSize: '12px' }}>
                              {reg.actual_fee_paid ? `${(Number(reg.actual_fee_paid) / 1e18).toFixed(6)} CELO` : '—'}
                            </td>
                            <td className="text-2" style={{ fontSize: '12px' }}>
                              {new Date(reg.created_at).toLocaleTimeString()}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {reg.status === 'PENDING_CONFIRMATION' && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  disabled={isVerifying}
                                  onClick={() => handleManualVerify(reg.tx_hash)}
                                >
                                  Verify Receipt
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
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
