import React from 'react';
import type { BuyQuoteSummary } from '../../lib/types.js';
import { Panel } from '../Panel.js';
import { Chip } from '../Chip.js';
import { KeyValue } from '../KeyValue.js';
import { CopyButton } from '../CopyButton.js';
import { quoteStatusTone } from '../../lib/status.js';
import { shortAddr, celoscanAddr } from '../../lib/format.js';
import { showToast } from '../Toast.js';

interface PaymentPanelProps {
  buyQuote?: BuyQuoteSummary | null;
}

export const PaymentPanel: React.FC<PaymentPanelProps> = ({ buyQuote }) => {
  const getExplainer = (status: string) => {
    switch (status) {
      case 'AWAITING_OPERATOR_APPROVAL':
        return 'Quote only. Waiting for operator approval. No payment executed.';
      case 'APPROVED':
        return 'Operator approved this quote. No payment has been executed by this app.';
      case 'SETTLED':
        return 'Settled.';
      case 'SETTLEMENT_UNKNOWN':
        return 'Settlement could not be confirmed. Do not retry blindly.';
      case 'EXPIRED':
        return 'Quote expired without execution.';
      case 'CANCELLED':
        return 'Quote was cancelled.';
      case 'QUOTE_INVALID':
      case 'FAILED':
        return 'Payment quote generation or verification failed.';
      default:
        return 'No payment has been executed by this app.';
    }
  };

  return (
    <div className="payment-panel" data-testid="payment-panel">
      <Panel
        title="Payment quote"
        actions={
          buyQuote ? (
            <Chip tone={quoteStatusTone(buyQuote.status)}>
              {buyQuote.status}
            </Chip>
          ) : undefined
        }
      >
        {!buyQuote ? (
          <div className="card" style={{ padding: 'var(--s-3)' }}>
            <p className="text-2" style={{ fontSize: '13px' }}>
              No payment quote was created for this investigation. This version does not execute payments.
            </p>
          </div>
        ) : (
          <div className="stack" style={{ gap: 'var(--s-3)' }}>
            <div className="grid grid--2col">
              <KeyValue label="Capability">
                <span className="mono">{buyQuote.capabilityId}</span>
              </KeyValue>

              <KeyValue label="Quoted Price">
                <span className="mono" style={{ fontWeight: 600 }}>{buyQuote.amountDisplay}</span>{' '}
                <span className="text-3">({buyQuote.amountAtomic} atomic {buyQuote.tokenSymbol})</span>
              </KeyValue>

              <KeyValue label="Token Contract">
                <span className="mono">{shortAddr(buyQuote.tokenContract)}</span>
                <CopyButton text={buyQuote.tokenContract} label="Copy token address" onCopy={() => showToast('Token copied')} />
                <a href={celoscanAddr(buyQuote.tokenContract)} target="_blank" rel="noopener noreferrer" className="btn btn--ghost btn--sm">
                  ↗
                </a>
              </KeyValue>

              <KeyValue label="Payee">
                <span className="mono">{shortAddr(buyQuote.recipient)}</span>
                <CopyButton text={buyQuote.recipient} label="Copy payee address" onCopy={() => showToast('Payee copied')} />
                <a href={celoscanAddr(buyQuote.recipient)} target="_blank" rel="noopener noreferrer" className="btn btn--ghost btn--sm">
                  ↗
                </a>
              </KeyValue>

              <KeyValue label="Network">
                <span className="text-1">Celo Mainnet · 42220</span>
              </KeyValue>

              <KeyValue label="Body SHA-256">
                <span className="mono">{buyQuote.bodySha256.slice(0, 12)}...</span>
                <CopyButton text={buyQuote.bodySha256} label="Copy body hash" onCopy={() => showToast('Hash copied')} />
              </KeyValue>
            </div>

            <div className="card" style={{ padding: 'var(--s-2) var(--s-3)', marginTop: 'var(--s-2)' }}>
              <p className="text-2" style={{ fontSize: '13px' }}>
                {getExplainer(buyQuote.status)}
              </p>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
};
