import React, { useState } from 'react';
import type { FlattenedCallFrame } from '../../lib/types.js';
import { Panel } from '../Panel.js';
import { Chip } from '../Chip.js';
import { CopyButton } from '../CopyButton.js';
import { Button } from '../Button.js';
import { KeyValue } from '../KeyValue.js';
import { shortAddr, celoscanAddr, weiToCelo, gasPercent, extractSelector } from '../../lib/format.js';
import { getCausalityInfo } from '../../lib/causality.js';
import { causalityTone } from '../../lib/status.js';
import { showToast } from '../Toast.js';
import { ChevronRight, ArrowUp, Target } from 'lucide-react';

interface FrameInspectorProps {
  frame: FlattenedCallFrame | null;
  frames: FlattenedCallFrame[];
  onSelectFrame: (id: string) => void;
}

export const FrameInspector: React.FC<FrameInspectorProps> = ({ frame, frames, onSelectFrame }) => {
  const [showFullInput, setShowFullInput] = useState(false);
  const [showFullOutput, setShowFullOutput] = useState(false);

  if (!frame) {
    return (
      <div className="frame-inspector frame-inspector--empty" data-testid="frame-inspector">
        <Panel title="Frame Inspector">
          <p className="text-3">Select a call in the trace tree to inspect details.</p>
        </Panel>
      </div>
    );
  }

  const causality = getCausalityInfo(frame.causalityStatus);
  const parentFrame = frame.parentFrameId ? frames.find(f => f.id === frame.parentFrameId) : null;
  const childFrames = frames.filter(f => f.parentFrameId === frame.id);
  const selector = extractSelector(frame.input);
  const valueDisplay = weiToCelo(frame.value);
  const gasPct = gasPercent(frame.gasUsed, frame.gas);

  const rawInputPreview = frame.input.length > 500 && !showFullInput ? frame.input.slice(0, 500) + '...' : frame.input;
  const rawOutput = frame.output || '';
  const rawOutputPreview = rawOutput.length > 500 && !showFullOutput ? rawOutput.slice(0, 500) + '...' : rawOutput;

  return (
    <div className="frame-inspector" data-testid="frame-inspector">
      <Panel
        title={`Frame ${frame.id}`}
        tag={frame.type}
        actions={
          frame.isDeepestFailingFrame ? (
            <Chip tone="fail" icon={<Target size={12} />}>
              Failing frame
            </Chip>
          ) : undefined
        }
      >
        <div className="stack" style={{ gap: 'var(--s-4)' }}>
          {/* Causality status block */}
          <div className="frame-inspector__causality">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', marginBottom: 'var(--s-2)' }}>
              <Chip tone={causalityTone(frame.causalityStatus)}>
                {causality.label}
              </Chip>
              {frame.isDeepestFailingFrame && (
                <span className="chip chip--fail">Deepest failing call</span>
              )}
            </div>
            <p className="text-2" style={{ fontSize: '13px', lineHeight: 1.4 }}>
              {causality.meaning}
            </p>
            {frame.hasSubsequentCallsInParent && (
              <p className="text-3" style={{ fontSize: '12px', marginTop: 'var(--s-1)' }}>
                Parent made subsequent calls after this frame.
              </p>
            )}
            {frame.ancestorsReverted === false && (
              <p className="text-3" style={{ fontSize: '12px', marginTop: 'var(--s-1)' }}>
                At least one ancestor call did not revert.
              </p>
            )}
          </div>

          {/* Core Call Facts */}
          <div className="frame-inspector__facts">
            <KeyValue label="From">
              <span className="mono">{shortAddr(frame.from)}</span>
              <CopyButton text={frame.from} label="Copy caller address" onCopy={() => showToast('Address copied')} />
              <a href={celoscanAddr(frame.from)} target="_blank" rel="noopener noreferrer" className="btn btn--ghost btn--sm">
                ↗
              </a>
            </KeyValue>

            <KeyValue label="To">
              {frame.to ? (
                <>
                  <span className="mono">{shortAddr(frame.to)}</span>
                  <CopyButton text={frame.to} label="Copy target address" onCopy={() => showToast('Address copied')} />
                  <a href={celoscanAddr(frame.to)} target="_blank" rel="noopener noreferrer" className="btn btn--ghost btn--sm">
                    ↗
                  </a>
                </>
              ) : (
                <span className="text-2">Contract Creation</span>
              )}
            </KeyValue>

            {valueDisplay && (
              <KeyValue label="Value">
                <span className="mono">{valueDisplay}</span>
              </KeyValue>
            )}

            <KeyValue label="Gas Used">
              <span className="mono">
                {Number(frame.gasUsed).toLocaleString()} / {Number(frame.gas).toLocaleString()}
                {gasPct && ` (${gasPct})`}
              </span>
            </KeyValue>

            {selector && (
              <KeyValue label="Selector">
                <span className="mono">{selector}</span>
                <CopyButton text={selector} label="Copy selector" onCopy={() => showToast('Selector copied')} />
              </KeyValue>
            )}
          </div>

          {/* Failure details if any */}
          {(frame.error || frame.revertReason || frame.decodedRevert) && (
            <div className="frame-inspector__failure">
              <h4 className="text-fail" style={{ fontSize: '13px', fontWeight: 600, marginBottom: 'var(--s-2)' }}>
                Frame Error Details
              </h4>
              {frame.error && (
                <div style={{ marginBottom: 'var(--s-2)' }}>
                  <span className="text-3" style={{ fontSize: '12px' }}>Error: </span>
                  <code className="mono text-fail" style={{ fontSize: '12px' }}>{frame.error}</code>
                </div>
              )}
              {frame.revertReason && (
                <div style={{ marginBottom: 'var(--s-2)' }}>
                  <span className="text-3" style={{ fontSize: '12px' }}>Revert Reason: </span>
                  <code className="mono text-fail" style={{ fontSize: '12px' }}>"{frame.revertReason}"</code>
                </div>
              )}
              {frame.decodedRevert && (
                <div className="card" style={{ padding: 'var(--s-2)', fontSize: '12px' }}>
                  <span className="text-3">Decoded Revert ({frame.decodedRevert.type}): </span>
                  <p className="text-1" style={{ marginTop: 'var(--s-1)' }}>
                    {frame.decodedRevert.reason || frame.decodedRevert.panicExplanation || frame.decodedRevert.selector}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Raw Output */}
          {rawOutput && rawOutput !== '0x' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--s-1)' }}>
                <span className="text-3" style={{ fontSize: '12px' }}>Raw Output</span>
                <CopyButton text={rawOutput} label="Copy output" onCopy={() => showToast('Output copied')} />
              </div>
              <pre className="code-well" style={{ maxHeight: showFullOutput ? 'none' : '120px' }}>
                {rawOutputPreview}
              </pre>
              {rawOutput.length > 500 && (
                <Button variant="ghost" size="sm" onClick={() => setShowFullOutput(!showFullOutput)}>
                  {showFullOutput ? 'Show less' : 'Show full output'}
                </Button>
              )}
            </div>
          )}

          {/* Raw Input */}
          {frame.input && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--s-1)' }}>
                <span className="text-3" style={{ fontSize: '12px' }}>Call Calldata (Input)</span>
                <CopyButton text={frame.input} label="Copy calldata" onCopy={() => showToast('Calldata copied')} />
              </div>
              <pre className="code-well" style={{ maxHeight: showFullInput ? 'none' : '120px' }}>
                {rawInputPreview}
              </pre>
              {frame.input.length > 500 && (
                <Button variant="ghost" size="sm" onClick={() => setShowFullInput(!showFullInput)}>
                  {showFullInput ? 'Show less' : 'Show full calldata'}
                </Button>
              )}
            </div>
          )}

          {/* Tree Navigation: Parent & Children */}
          <div className="frame-inspector__nav" style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--s-3)' }}>
            {parentFrame && (
              <div style={{ marginBottom: 'var(--s-2)' }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSelectFrame(parentFrame.id)}
                  icon={<ArrowUp size={12} />}
                >
                  Parent Frame ({parentFrame.id}) · {parentFrame.type}
                </Button>
              </div>
            )}
            {childFrames.length > 0 && (
              <div>
                <span className="text-3" style={{ fontSize: '11px', display: 'block', marginBottom: 'var(--s-1)' }}>
                  Child Calls ({childFrames.length}):
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-1)' }}>
                  {childFrames.map(c => (
                    <Button
                      key={c.id}
                      variant="secondary"
                      size="sm"
                      onClick={() => onSelectFrame(c.id)}
                      icon={<ChevronRight size={12} />}
                    >
                      {c.id} ({c.type})
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
};
