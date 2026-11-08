import React from 'react';
import { Panel } from '../Panel.js';
import type { InvestigationReport } from '../../lib/types.js';

interface DiagnosisPanelProps {
  report: InvestigationReport;
  onCitationClick?: (id: string) => void;
}

export const DiagnosisPanel: React.FC<DiagnosisPanelProps> = ({ report, onCitationClick }) => {
  const { diagnosis, decodedRevert } = report;

  return (
    <Panel title="Deterministic Diagnosis" tag="Analysis" tone={
      report.status === 'REVERTED' ? 'fail' : report.status === 'SUCCESS' ? 'ok' : null
    }>
      <div className="stack">
        {diagnosis.rootRevertReason && (
          <div>
            <div className="section-title" style={{ marginBottom: '4px' }}>Root Revert Reason</div>
            <code className="mono" style={{ color: 'var(--fail-text)', fontSize: '13px' }}>
              {diagnosis.rootRevertReason}
            </code>
          </div>
        )}

        {diagnosis.nestedFailureReason && (
          <div>
            <div className="section-title" style={{ marginBottom: '4px' }}>Nested Failure</div>
            <code className="mono" style={{ color: 'var(--warn-text)', fontSize: '13px' }}>
              {diagnosis.nestedFailureReason}
            </code>
          </div>
        )}

        {decodedRevert && (
          <div>
            <div className="section-title" style={{ marginBottom: '4px' }}>Decoded Revert</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
              <span><span className="text-2">Type: </span><span className="text-fail">{decodedRevert.type}</span></span>
              {decodedRevert.reason && <span><span className="text-2">Reason: </span><code className="mono">"{decodedRevert.reason}"</code></span>}
              {decodedRevert.selector && <span><span className="text-2">Selector: </span><code className="mono text-2">{decodedRevert.selector}</code></span>}
              {decodedRevert.panicCode !== undefined && <span><span className="text-2">Panic code: </span><code className="mono">0x{decodedRevert.panicCode.toString(16)}</code></span>}
              {decodedRevert.panicExplanation && <span><span className="text-2">Panic: </span>{decodedRevert.panicExplanation}</span>}
            </div>
          </div>
        )}

        {diagnosis.evidenceCitations.length > 0 && (
          <div>
            <div className="section-title" style={{ marginBottom: '6px' }}>Evidence Citations</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {diagnosis.evidenceCitations.map(id => (
                <a
                  key={id}
                  href={`#ev-${id}`}
                  className="citation-chip"
                  data-testid="evidence-citation"
                  onClick={e => { e.preventDefault(); onCitationClick?.(id); document.getElementById(`ev-${id}`)?.scrollIntoView({ behavior: 'smooth' }); }}
                >
                  {id}
                </a>
              ))}
            </div>
          </div>
        )}

        {diagnosis.safeNextSteps.length > 0 && (
          <div>
            <div className="section-title" style={{ marginBottom: '6px' }}>Safe Next Steps</div>
            <ul style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '16px', listStyle: 'disc' }}>
              {diagnosis.safeNextSteps.map((step, i) => (
                <li key={i} style={{ fontSize: '13px', color: 'var(--text-1)', lineHeight: '1.5' }}>{step}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Panel>
  );
};
