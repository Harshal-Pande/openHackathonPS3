import React from 'react';
import { Panel } from '../Panel.js';

interface LimitationsPanelProps {
  limitations: string[];
}

export const LimitationsPanel: React.FC<LimitationsPanelProps> = ({ limitations }) => {
  return (
    <div className="limitations-panel">
      <Panel title="Forensic Limitations" tag="Scope">
        {limitations.length > 0 ? (
          <ul className="text-2" style={{ paddingLeft: 'var(--s-3)', fontSize: '13px', lineHeight: 1.6, marginBottom: 'var(--s-3)' }}>
            {limitations.map((lim, idx) => (
              <li key={idx} style={{ marginBottom: 'var(--s-1)' }}>
                {lim}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-3" style={{ fontSize: '13px', marginBottom: 'var(--s-3)' }}>
            No specific runtime limitations were recorded for this investigation.
          </p>
        )}

        <div className="card" style={{ padding: 'var(--s-2) var(--s-3)' }}>
          <p className="text-3" style={{ fontSize: '12px', lineHeight: 1.5 }}>
            Evidence hashes (SHA-256) prove the stored content matches what RevertLens parsed. They do not prove the RPC provider was honest, are not anchored on-chain, and cannot prevent tampering by someone with write access to the database.
          </p>
        </div>
      </Panel>
    </div>
  );
};
