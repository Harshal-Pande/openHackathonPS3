import React from 'react';
import type { AiExplanation } from '../../lib/types.js';
import { Panel } from '../Panel.js';
import { Chip } from '../Chip.js';

interface AiPanelProps {
  aiExplanation?: AiExplanation | null;
  onCitationClick?: (id: string) => void;
}

export const AiPanel: React.FC<AiPanelProps> = ({ aiExplanation, onCitationClick }) => {
  const isSuccess = aiExplanation?.status === 'SUCCESS';

  return (
    <div className="ai-panel" data-testid="ai-panel">
      <Panel
        title="AI explanation (advisory)"
        tag="AI · ADVISORY"
        tone="warn"
        actions={
          isSuccess ? (
            <Chip tone="ok">AI explanation received</Chip>
          ) : aiExplanation ? (
            <Chip tone="neutral">{aiExplanation.status}</Chip>
          ) : undefined
        }
      >
        <p className="text-2" style={{ fontSize: '13px', marginBottom: 'var(--s-3)' }}>
          Generated text. The deterministic diagnosis above is the source of truth.
        </p>

        {!aiExplanation ? (
          <div className="card" style={{ padding: 'var(--s-3)' }}>
            <p className="text-2" style={{ fontSize: '13px' }}>
              Not stored for this report. AI results are not persisted when a report is reloaded.
            </p>
          </div>
        ) : aiExplanation.status === 'DISABLED' ? (
          <div className="card" style={{ padding: 'var(--s-3)' }}>
            <p className="text-2" style={{ fontSize: '13px' }}>
              AI explanation is disabled on this server.
            </p>
          </div>
        ) : aiExplanation.status === 'AWAITING_APPROVAL' ? (
          <div className="card" style={{ padding: 'var(--s-3)' }}>
            <p className="text-2" style={{ fontSize: '13px', marginBottom: 'var(--s-2)' }}>
              A paid explanation quote exists and is waiting for operator approval. Nothing has been generated.
            </p>
            <a href="#/operator" className="btn btn--secondary btn--sm">
              Operator console
            </a>
          </div>
        ) : aiExplanation.status === 'SUCCESS' ? (
          <div className="stack" style={{ gap: 'var(--s-3)' }}>
            {aiExplanation.summary && (
              <div className="card" style={{ padding: 'var(--s-3)' }}>
                <p className="text-1" style={{ fontSize: '14px', lineHeight: 1.5 }}>
                  {aiExplanation.summary}
                </p>
              </div>
            )}

            {aiExplanation.technicalExplanation && (
              <details className="card" style={{ padding: 'var(--s-3)' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '13px' }} className="text-2">
                  Technical Explanation Details
                </summary>
                <div style={{ marginTop: 'var(--s-2)', fontSize: '13px', color: 'var(--text-1)', lineHeight: 1.5 }}>
                  {aiExplanation.technicalExplanation}
                </div>
              </details>
            )}

            {aiExplanation.evidenceReferences && aiExplanation.evidenceReferences.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
                <span className="text-3" style={{ fontSize: '12px' }}>Cited evidence:</span>
                {aiExplanation.evidenceReferences.map(ref => (
                  <button
                    key={ref}
                    type="button"
                    className="chip chip--neutral"
                    style={{ cursor: onCitationClick ? 'pointer' : 'default', fontSize: '11px' }}
                    onClick={() => onCitationClick?.(ref)}
                  >
                    {ref}
                  </button>
                ))}
              </div>
            )}

            <div style={{ fontSize: '11px', color: 'var(--text-3)', borderTop: '1px solid var(--border)', paddingTop: 'var(--s-2)' }}>
              Model: {aiExplanation.model || 'cencori-chat'} · Generated {aiExplanation.generatedAt ? new Date(aiExplanation.generatedAt).toLocaleString() : 'recently'}
            </div>
          </div>
        ) : aiExplanation.status === 'VALIDATION_FAILED' ? (
          <div className="card" style={{ padding: 'var(--s-3)' }}>
            <p className="text-fail" style={{ fontSize: '13px', fontWeight: 600, marginBottom: 'var(--s-1)' }}>
              The AI response was rejected by RevertLens' validator and discarded.
            </p>
            {aiExplanation.validationErrors && (
              <ul className="text-3" style={{ fontSize: '12px', paddingLeft: 'var(--s-3)' }}>
                {aiExplanation.validationErrors.slice(0, 5).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="card" style={{ padding: 'var(--s-3)' }}>
            <p className="text-2" style={{ fontSize: '13px' }}>
              AI explanation unavailable.
            </p>
          </div>
        )}
      </Panel>
    </div>
  );
};
