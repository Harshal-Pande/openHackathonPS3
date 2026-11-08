import React, { useState } from 'react';
import type { EvidenceItem } from '../../lib/types.js';
import { Panel } from '../Panel.js';
import { CopyButton } from '../CopyButton.js';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { showToast } from '../Toast.js';

interface EvidenceLedgerProps {
  evidenceLedger: EvidenceItem[];
}

export const EvidenceLedger: React.FC<EvidenceLedgerProps> = ({ evidenceLedger }) => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getProvenanceTag = (kind: string): string => {
    switch (kind) {
      case 'TRANSACTION_FACT':
      case 'RECEIPT_FACT':
        return 'CHAIN DATA';
      case 'TRACE_FRAME':
      case 'FAILURE_PROPAGATION':
        return 'TRACE';
      case 'REVERT_DATA':
        return 'DECODED';
      default:
        return 'CHAIN DATA';
    }
  };

  return (
    <div id="evidence-ledger" className="evidence-section">
      <Panel
        title={`Evidence Ledger (${evidenceLedger.length} atomic items)`}
        tag="Cryptographic Proofs"
      >
        <p className="text-2" style={{ fontSize: '13px', marginBottom: 'var(--s-3)' }}>
          Each item is an atomic observation. The hash covers the stored content only; it does not prove the RPC provider's honesty.
        </p>

        <div className="table-container">
          <table className="evidence-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}></th>
                <th style={{ width: '60px' }}>ID</th>
                <th style={{ width: '120px' }}>Provenance</th>
                <th style={{ width: '140px' }}>Source</th>
                <th>Observation</th>
                <th style={{ width: '160px' }}>SHA-256</th>
              </tr>
            </thead>
            <tbody>
              {evidenceLedger.map(item => {
                const isExpanded = expandedIds.has(item.id);
                const provTag = getProvenanceTag(item.kind);

                return (
                  <React.Fragment key={item.id}>
                    <tr
                      id={`ev-${item.id}`}
                      className="evidence-row"
                      data-testid="evidence-row"
                      data-evidence-id={item.id}
                      onClick={() => toggleExpand(item.id)}
                    >
                      <td className="evidence-row__caret">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                      <td className="evidence-row__id mono text-lens" style={{ fontWeight: 600 }}>
                        {item.id}
                      </td>
                      <td>
                        <span className="chip chip--neutral" style={{ fontSize: '10px' }}>
                          {provTag}
                        </span>
                      </td>
                      <td className="mono text-2" style={{ fontSize: '12px' }}>
                        {item.sourceMethod}
                      </td>
                      <td className="text-1" style={{ fontSize: '13px' }}>
                        {item.description}
                      </td>
                      <td className="mono text-2" style={{ fontSize: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-1)' }}>
                          <span>{item.contentHash.slice(0, 10)}...</span>
                          <span onClick={e => e.stopPropagation()}>
                            <CopyButton
                              text={item.contentHash}
                              label="Copy content hash"
                              onCopy={() => showToast('Hash copied')}
                            />
                          </span>
                        </div>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="evidence-detail-row">
                        <td colSpan={6}>
                          <div className="evidence-detail">
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--s-2)' }}>
                              <span className="text-3 mono" style={{ fontSize: '12px' }}>
                                Full Hash: {item.contentHash}
                              </span>
                              <span className="text-3" style={{ fontSize: '12px' }}>
                                Observed: {new Date(item.observedAt).toLocaleString()}
                              </span>
                            </div>
                            <pre className="code-well" style={{ maxHeight: '240px' }}>
                              {JSON.stringify(item.value, null, 2)}
                            </pre>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
};
