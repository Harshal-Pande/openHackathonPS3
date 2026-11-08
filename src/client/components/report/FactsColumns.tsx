import React from 'react';
import { Panel } from '../Panel.js';
import type { FailureDiagnosis } from '../../lib/types.js';

interface FactsColumnsProps {
  diagnosis: FailureDiagnosis;
}

export const FactsColumns: React.FC<FactsColumnsProps> = ({ diagnosis }) => (
  <div className="facts-columns">
    <Panel title="Proven Facts" noPad={false}>
      {diagnosis.provenFacts.length > 0 ? (
        <ul className="facts-col__list" style={{ listStyle: 'none', padding: 0 }}>
          {diagnosis.provenFacts.map((f, i) => (
            <li key={i} className="facts-col__item" style={{ paddingLeft: '12px', borderLeft: '2px solid var(--ok-line)', marginBottom: '8px' }}>
              {f}
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ fontSize: '13px', color: 'var(--text-3)' }}>None recorded.</p>
      )}
    </Panel>

    <Panel title="Likely Explanations" noPad={false}>
      {diagnosis.likelyExplanations.length > 0 ? (
        <ul className="facts-col__list" style={{ listStyle: 'none', padding: 0 }}>
          {diagnosis.likelyExplanations.map((e, i) => (
            <li key={i} className="facts-col__item" style={{ paddingLeft: '12px', borderLeft: '2px solid var(--warn-line)', marginBottom: '8px' }}>
              {e}
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ fontSize: '13px', color: 'var(--text-3)' }}>None recorded.</p>
      )}
    </Panel>

    <Panel title="Unknowns" noPad={false}>
      {diagnosis.unknowns.length > 0 ? (
        <ul className="facts-col__list" style={{ listStyle: 'none', padding: 0 }}>
          {diagnosis.unknowns.map((u, i) => (
            <li key={i} className="facts-col__item" style={{ paddingLeft: '12px', borderLeft: '2px solid var(--border-strong)', marginBottom: '8px' }}>
              {u}
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ fontSize: '13px', color: 'var(--text-3)' }}>None recorded.</p>
      )}
    </Panel>
  </div>
);
