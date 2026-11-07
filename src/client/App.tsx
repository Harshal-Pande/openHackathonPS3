import React, { useState } from 'react';

const TX_HASH_REGEX = /^0x[0-9a-fA-F]{64}$/;

export const App: React.FC = () => {
  const [txHash, setTxHash] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submittedHash, setSubmittedHash] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = txHash.trim();

    if (!trimmed) {
      setValidationError('Please enter a transaction hash.');
      return;
    }

    if (!TX_HASH_REGEX.test(trimmed)) {
      setValidationError('Transaction hash must be a 0x-prefixed 64-character hexadecimal string.');
      return;
    }

    setValidationError(null);
    setSubmittedHash(trimmed);
  };

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '48px 24px' }}>
      <header style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '700', letterSpacing: '-0.02em' }}>RevertLens</h1>
          <span
            style={{
              fontSize: '12px',
              padding: '3px 8px',
              borderRadius: '9999px',
              backgroundColor: 'var(--badge-bg)',
              color: 'var(--badge-text)',
              fontWeight: '500'
            }}
          >
            Celo Mainnet · Chain ID 42220
          </span>
        </div>
        <p style={{ fontSize: '18px', color: 'var(--text-muted)' }}>
          Your Celo transaction failed. Find out why with evidence-backed diagnostics.
        </p>
      </header>

      <main>
        <form
          onSubmit={handleSubmit}
          style={{
            backgroundColor: 'var(--card-bg)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '24px',
            marginBottom: '24px'
          }}
        >
          <label
            htmlFor="txHash"
            style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}
          >
            Transaction Hash
          </label>
          <div style={{ display: 'flex', gap: '12px', flexDirection: 'column' }}>
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
                padding: '12px 16px',
                borderRadius: '8px',
                border: `1px solid ${validationError ? 'var(--error)' : 'var(--border)'}`,
                backgroundColor: 'var(--bg)',
                color: 'var(--text)',
                fontFamily: 'monospace',
                fontSize: '14px'
              }}
            />
            {validationError && (
              <p style={{ color: 'var(--error)', fontSize: '13px', margin: '0' }}>{validationError}</p>
            )}
            <button
              type="submit"
              style={{
                padding: '12px 24px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: 'var(--primary)',
                color: '#0f172a',
                fontSize: '15px',
                fontWeight: '600',
                cursor: 'pointer',
                alignSelf: 'flex-start'
              }}
            >
              Inspect Transaction
            </button>
          </div>
        </form>

        {submittedHash && (
          <div
            style={{
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '24px'
            }}
          >
            <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>Investigation Staged</h2>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Target Hash: <code style={{ color: 'var(--primary)' }}>{submittedHash}</code>
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Subsidized Buy service quote and operator approval will be initiated when backend forensic pipeline is active.
            </p>
          </div>
        )}

        <footer style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            🔒 No wallet connection or private key required. Analysis uses subsidized Buy gateway services.
          </p>
        </footer>
      </main>
    </div>
  );
};
