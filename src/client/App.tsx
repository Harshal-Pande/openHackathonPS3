import React, { useState, useEffect } from 'react';

const CANDIDATE_TX = '0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445';
const TX_HASH_REGEX = /^0x[0-9a-fA-F]{64}$/;

interface EvidenceItem {
  id: string;
  kind: string;
  sourceMethod: string;
  description: string;
  value: Record<string, unknown>;
  contentHash: string;
  observedAt: string;
}

interface FlattenedCallFrame {
  id: string;
  depth: number;
  type: string;
  from: string;
  to: string | null;
  value: string;
  gas: string;
  gasUsed: string;
  input: string;
  output?: string;
  error?: string;
  revertReason?: string;
  decodedRevert?: {
    type: string;
    selector?: string;
    reason?: string;
    panicExplanation?: string;
  };
  propagatedToParent: boolean;
  isDeepestFailingFrame: boolean;
}

interface InvestigationReport {
  investigationId: string;
  txHash: string;
  chainId: number;
  status: 'SUCCESS' | 'REVERTED' | 'NOT_FOUND';
  traceStatus: 'AVAILABLE' | 'UNSUPPORTED' | 'NOT_REQUESTED';
  transaction: {
    hash: string;
    blockNumber: number;
    from: string;
    to: string | null;
    value: string;
    gas: string;
    input: string;
    nonce: number;
  } | null;
  receipt: {
    transactionHash: string;
    blockNumber: number;
    status: string;
    gasUsed: string;
    logsCount: number;
  } | null;
  executionTrace: {
    flattenedFrames: FlattenedCallFrame[];
    totalFrames: number;
    maxDepth: number;
    deepestFailingFrame: FlattenedCallFrame | null;
  } | null;
  decodedRevert: {
    type: string;
    selector?: string;
    reason?: string;
    panicExplanation?: string;
    rawBytes?: string;
  } | null;
  evidenceLedger: EvidenceItem[];
  diagnosis: {
    category: string;
    confidence: string;
    headline: string;
    narrative: string;
    evidenceCitations: string[];
    provenFacts: string[];
    likelyExplanations: string[];
    unknowns: string[];
    safeNextSteps: string[];
  };
  limitations: string[];
  createdAt: string;
  completedAt: string;
}

export const App: React.FC = () => {
  const [txHash, setTxHash] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [report, setReport] = useState<InvestigationReport | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [recentList, setRecentList] = useState<Array<{ id: string; txHash: string; status: string; createdAt: string }>>([]);
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceItem | null>(null);

  const fetchRecent = async () => {
    try {
      const res = await fetch('/api/investigations?limit=5');
      if (res.ok) {
        const json = await res.json();
        if (json.data && Array.isArray(json.data)) {
          setRecentList(json.data);
        }
      }
    } catch {
      // Ignore background fetch error
    }
  };

  useEffect(() => {
    fetchRecent();
  }, []);

  const runInvestigation = async (targetHash: string) => {
    const clean = targetHash.trim();
    if (!TX_HASH_REGEX.test(clean)) {
      setValidationError('Transaction hash must be a 0x-prefixed 64-character hexadecimal string.');
      return;
    }

    setValidationError(null);
    setApiError(null);
    setIsLoading(true);
    setLoadingStep(1);

    const stepInterval = setInterval(() => {
      setLoadingStep((prev) => (prev < 4 ? prev + 1 : prev));
    }, 400);

    try {
      const res = await fetch('/api/investigations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash: clean })
      });

      clearInterval(stepInterval);
      const json = await res.json();

      if (!res.ok || json.error) {
        throw new Error(json.error?.message || 'Failed to complete transaction investigation.');
      }

      setReport(json.data);
      fetchRecent();
    } catch (err: unknown) {
      clearInterval(stepInterval);
      const error = err as Error;
      setApiError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInspect = (e: React.FormEvent) => {
    e.preventDefault();
    runInvestigation(txHash);
  };

  const loadPastReport = async (id: string) => {
    setIsLoading(true);
    setApiError(null);
    try {
      const res = await fetch(`/api/investigations/${id}`);
      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error?.message || 'Failed to retrieve investigation.');
      }
      setReport(json.data);
    } catch (err: unknown) {
      const error = err as Error;
      setApiError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `revertlens-${report.txHash.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ maxWidth: '1040px', margin: '0 auto', padding: '40px 24px', minHeight: '100vh' }}>
      {/* Top Navbar */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            onClick={() => {
              setReport(null);
              setApiError(null);
            }}
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
          >
            <span style={{ fontSize: '24px' }}>🔍</span>
            <h1 style={{ fontSize: '24px', fontWeight: '800', letterSpacing: '-0.03em', margin: 0 }}>RevertLens</h1>
          </div>
          <span
            style={{
              fontSize: '11px',
              padding: '3px 8px',
              borderRadius: '999px',
              backgroundColor: '#1e3a8a',
              color: '#93c5fd',
              fontWeight: '600',
              letterSpacing: '0.02em'
            }}
          >
            Celo Mainnet · 42220
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '12px',
              padding: '4px 10px',
              borderRadius: '6px',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              color: '#94a3b8'
            }}
          >
            Provider: Chainstack Growth (Direct RPC)
          </span>
        </div>
      </header>

      {/* Main View Container */}
      {!report && !isLoading && (
        <main>
          {/* Hero Section */}
          <div style={{ marginBottom: '36px', textAlign: 'center', padding: '24px 0' }}>
            <h2 style={{ fontSize: '32px', fontWeight: '800', letterSpacing: '-0.02em', marginBottom: '12px' }}>
              Your Celo transaction failed. Find out why.
            </h2>
            <p style={{ fontSize: '16px', color: '#94a3b8', maxWidth: '640px', margin: '0 auto 20px auto' }}>
              Evidence-backed transaction forensics powered by high-performance Celo archive RPC and deterministic trace
              analysis.
            </p>
          </div>

          {/* Search Box */}
          <form
            onSubmit={handleInspect}
            style={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '14px',
              padding: '24px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
              marginBottom: '28px'
            }}
          >
            <label
              htmlFor="txHash"
              style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#cbd5e1', marginBottom: '8px' }}
            >
              Transaction Hash
            </label>
            <div style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
              <input
                id="txHash"
                type="text"
                placeholder="0x..."
                value={txHash}
                onChange={(e) => {
                  setTxHash(e.target.value);
                  if (validationError) setValidationError(null);
                }}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  borderRadius: '10px',
                  border: `1px solid ${validationError ? '#f87171' : '#475569'}`,
                  backgroundColor: '#0f172a',
                  color: '#f8fafc',
                  fontFamily: 'monospace',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />

              {validationError && (
                <p style={{ color: '#f87171', fontSize: '13px', margin: '4px 0 0 0' }}>{validationError}</p>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setTxHash(CANDIDATE_TX);
                    setValidationError(null);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#38bdf8',
                    fontSize: '12px',
                    cursor: 'pointer',
                    padding: 0,
                    textDecoration: 'underline'
                  }}
                >
                  Load Verified Sample Failed Tx (Swap Reverted)
                </button>

                <button
                  type="submit"
                  style={{
                    padding: '12px 28px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#38bdf8',
                    color: '#0f172a',
                    fontSize: '14px',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  Inspect Transaction
                </button>
              </div>
            </div>
          </form>

          {/* Error Banner */}
          {apiError && (
            <div
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid #ef4444',
                borderRadius: '10px',
                padding: '16px 20px',
                marginBottom: '28px'
              }}
            >
              <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#f87171', marginBottom: '4px' }}>
                Investigation Error
              </h3>
              <p style={{ fontSize: '13px', color: '#fca5a5', margin: 0 }}>{apiError}</p>
            </div>
          )}

          {/* Recent Investigations */}
          {recentList.length > 0 && (
            <div style={{ marginTop: '32px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#94a3b8', marginBottom: '12px' }}>
                Recent Investigations
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {recentList.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => loadPastReport(item.id)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 16px',
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease'
                    }}
                  >
                    <code style={{ fontSize: '13px', color: '#38bdf8' }}>{item.txHash}</code>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: item.status === 'REVERTED' ? '#7f1d1d' : '#14532d',
                          color: item.status === 'REVERTED' ? '#fca5a5' : '#86efac',
                          fontWeight: '600'
                        }}
                      >
                        {item.status}
                      </span>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>
                        {new Date(item.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      )}

      {/* Loading Progress State */}
      {isLoading && (
        <div
          style={{
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '14px',
            padding: '48px 32px',
            textAlign: 'center',
            maxWidth: '560px',
            margin: '40px auto'
          }}
        >
          <div style={{ fontSize: '36px', marginBottom: '16px', animation: 'spin 1.5s linear infinite' }}>⚙️</div>
          <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>
            Investigating Transaction on Celo Mainnet
          </h3>
          <p style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '24px' }}>
            Running deep forensics through Chainstack OP Geth node...
          </p>

          <div style={{ textAlign: 'left', maxWidth: '360px', margin: '0 auto', fontSize: '13px' }}>
            <div style={{ color: loadingStep >= 1 ? '#38bdf8' : '#475569', marginBottom: '8px' }}>
              {loadingStep >= 1 ? '✓' : '○'} Validating Celo Mainnet chain ID (42220)
            </div>
            <div style={{ color: loadingStep >= 2 ? '#38bdf8' : '#475569', marginBottom: '8px' }}>
              {loadingStep >= 2 ? '✓' : '○'} Retrieving transaction & receipt facts
            </div>
            <div style={{ color: loadingStep >= 3 ? '#38bdf8' : '#475569', marginBottom: '8px' }}>
              {loadingStep >= 3 ? '✓' : '○'} Executing debug_traceTransaction (callTracer)
            </div>
            <div style={{ color: loadingStep >= 4 ? '#38bdf8' : '#475569', marginBottom: '8px' }}>
              {loadingStep >= 4 ? '✓' : '○'} Normalizing evidence & decoding revert bytes
            </div>
          </div>
        </div>
      )}

      {/* Full Investigation Report */}
      {report && (
        <div>
          {/* Actions & Status Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px'
            }}
          >
            <button
              onClick={() => setReport(null)}
              style={{
                background: 'none',
                border: '1px solid #334155',
                color: '#cbd5e1',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              ← Back to Search
            </button>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={downloadJson}
                style={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  color: '#38bdf8',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                Download JSON Report
              </button>
            </div>
          </div>

          {/* Primary Diagnosis Banner */}
          <div
            style={{
              backgroundColor: report.status === 'REVERTED' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(34, 197, 94, 0.08)',
              border: `1px solid ${report.status === 'REVERTED' ? '#ef4444' : '#22c55e'}`,
              borderRadius: '12px',
              padding: '24px',
              marginBottom: '24px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <span
                style={{
                  fontSize: '12px',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  backgroundColor: report.status === 'REVERTED' ? '#ef4444' : '#22c55e',
                  color: '#ffffff',
                  fontWeight: '800'
                }}
              >
                {report.status}
              </span>
              <span
                style={{
                  fontSize: '12px',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  backgroundColor: '#1e293b',
                  color: '#94a3b8',
                  fontWeight: '500'
                }}
              >
                Confidence: {report.diagnosis.confidence}
              </span>
              <span style={{ fontSize: '13px', color: '#64748b' }}>
                Trace Status: {report.traceStatus}
              </span>
            </div>

            <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '8px', color: '#f8fafc' }}>
              {report.diagnosis.headline}
            </h2>
            <p style={{ fontSize: '14px', lineHeight: '1.6', color: '#cbd5e1', margin: 0 }}>
              {report.diagnosis.narrative}
            </p>
          </div>

          {/* Transaction Summary Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '16px',
              marginBottom: '24px'
            }}
          >
            {/* Overview Card */}
            <div
              style={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '10px',
                padding: '20px'
              }}
            >
              <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#94a3b8', marginBottom: '14px' }}>
                Transaction Facts
              </h3>
              <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div>
                  <span style={{ color: '#64748b' }}>Hash: </span>
                  <code style={{ color: '#38bdf8' }}>{report.txHash.slice(0, 16)}...</code>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>From: </span>
                  <code style={{ color: '#f8fafc' }}>{report.transaction?.from}</code>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>To: </span>
                  <code style={{ color: '#f8fafc' }}>{report.transaction?.to || 'Contract Creation'}</code>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Block: </span>
                  <span style={{ color: '#f8fafc' }}>{report.receipt?.blockNumber}</span>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Gas Used: </span>
                  <span style={{ color: '#f8fafc' }}>
                    {report.receipt?.gasUsed} / {report.transaction?.gas} units
                  </span>
                </div>
              </div>
            </div>

            {/* Revert Analysis Card */}
            <div
              style={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '10px',
                padding: '20px'
              }}
            >
              <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#94a3b8', marginBottom: '14px' }}>
                Revert Payload
              </h3>
              {report.decodedRevert ? (
                <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div>
                    <span style={{ color: '#64748b' }}>Type: </span>
                    <span style={{ color: '#f87171', fontWeight: '600' }}>{report.decodedRevert.type}</span>
                  </div>
                  {report.decodedRevert.reason && (
                    <div>
                      <span style={{ color: '#64748b' }}>Reason: </span>
                      <code style={{ color: '#f8fafc', fontWeight: '700' }}>"{report.decodedRevert.reason}"</code>
                    </div>
                  )}
                  {report.decodedRevert.selector && (
                    <div>
                      <span style={{ color: '#64748b' }}>Selector: </span>
                      <code style={{ color: '#94a3b8' }}>{report.decodedRevert.selector}</code>
                    </div>
                  )}
                  {report.decodedRevert.panicExplanation && (
                    <div>
                      <span style={{ color: '#64748b' }}>Panic: </span>
                      <span style={{ color: '#f87171' }}>{report.decodedRevert.panicExplanation}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p style={{ fontSize: '13px', color: '#94a3b8' }}>
                  No standard revert payload decoded from top-level return.
                </p>
              )}
            </div>
          </div>

          {/* Interactive Trace Call Tree */}
          {report.executionTrace && report.executionTrace.flattenedFrames.length > 0 && (
            <div
              style={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '10px',
                padding: '20px',
                marginBottom: '24px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#94a3b8', margin: 0 }}>
                  Call-Level Execution Trace ({report.executionTrace.totalFrames} frames, depth {report.executionTrace.maxDepth})
                </h3>
                <span style={{ fontSize: '11px', color: '#64748b' }}>debug_traceTransaction · callTracer</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {report.executionTrace.flattenedFrames.map((frame) => (
                  <div
                    key={frame.id}
                    style={{
                      marginLeft: `${frame.depth * 20}px`,
                      padding: '10px 14px',
                      backgroundColor: frame.isDeepestFailingFrame ? 'rgba(239, 68, 68, 0.15)' : '#0f172a',
                      border: `1px solid ${frame.isDeepestFailingFrame ? '#ef4444' : '#334155'}`,
                      borderRadius: '8px',
                      fontSize: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: '#334155',
                          color: '#e2e8f0',
                          fontWeight: '700'
                        }}
                      >
                        {frame.type}
                      </span>

                      <span style={{ color: '#64748b' }}>to:</span>
                      <code style={{ color: '#38bdf8' }}>{frame.to || 'contract creation'}</code>

                      <span style={{ color: '#64748b' }}>gasUsed:</span>
                      <span style={{ color: '#94a3b8' }}>{frame.gasUsed}</span>

                      {frame.error && (
                        <span
                          style={{
                            fontSize: '10px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: '#7f1d1d',
                            color: '#fca5a5',
                            fontWeight: '700'
                          }}
                        >
                          Error: {frame.error}
                        </span>
                      )}

                      {frame.propagatedToParent && (
                        <span
                          style={{
                            fontSize: '10px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: '#451a03',
                            color: '#fcd34d',
                            fontWeight: '600'
                          }}
                        >
                          Propagated
                        </span>
                      )}

                      {frame.isDeepestFailingFrame && (
                        <span
                          style={{
                            fontSize: '10px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: '#ef4444',
                            color: '#ffffff',
                            fontWeight: '800'
                          }}
                        >
                          Root Failure Point
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Evidence Ledger */}
          <div
            style={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '10px',
              padding: '20px',
              marginBottom: '24px'
            }}
          >
            <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#94a3b8', marginBottom: '14px' }}>
              Evidence Ledger ({report.evidenceLedger.length} atomic items)
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {report.evidenceLedger.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedEvidence(selectedEvidence?.id === item.id ? null : item)}
                  style={{
                    padding: '10px 14px',
                    backgroundColor: selectedEvidence?.id === item.id ? '#334155' : '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <code style={{ color: '#38bdf8', fontWeight: '700' }}>[{item.id}]</code>
                      <span style={{ color: '#e2e8f0', fontWeight: '500' }}>{item.description}</span>
                    </div>
                    <span style={{ color: '#64748b', fontSize: '11px' }}>{item.sourceMethod}</span>
                  </div>

                  {selectedEvidence?.id === item.id && (
                    <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #475569' }}>
                      <p style={{ margin: '0 0 6px 0', color: '#94a3b8', fontSize: '11px' }}>
                        Content Hash: <code>{item.contentHash}</code>
                      </p>
                      <pre
                        style={{
                          margin: 0,
                          padding: '8px',
                          backgroundColor: '#020617',
                          borderRadius: '4px',
                          fontSize: '11px',
                          overflowX: 'auto',
                          color: '#a5f3fc'
                        }}
                      >
                        {JSON.stringify(item.value, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Safe Next Steps & Limitations */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '16px'
            }}
          >
            {/* Safe Next Checks */}
            <div
              style={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '10px',
                padding: '20px'
              }}
            >
              <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#94a3b8', marginBottom: '12px' }}>
                Safe Next Troubleshooting Checks
              </h3>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', lineHeight: '1.6', color: '#cbd5e1' }}>
                {report.diagnosis.safeNextSteps.map((step, idx) => (
                  <li key={idx} style={{ marginBottom: '6px' }}>{step}</li>
                ))}
              </ul>
            </div>

            {/* Limitations */}
            <div
              style={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '10px',
                padding: '20px'
              }}
            >
              <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#94a3b8', marginBottom: '12px' }}>
                Forensic Limitations
              </h3>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', lineHeight: '1.6', color: '#94a3b8' }}>
                {report.limitations.map((lim, idx) => (
                  <li key={idx} style={{ marginBottom: '6px' }}>{lim}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer style={{ marginTop: '48px', paddingTop: '16px', borderTop: '1px solid #334155', textAlign: 'center' }}>
        <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
          🔒 RevertLens · Non-custodial transaction forensics · Celo Mainnet · No wallet connection required
        </p>
      </footer>
    </div>
  );
};
