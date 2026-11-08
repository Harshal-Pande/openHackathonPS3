import React, { useState, useEffect, useRef } from 'react';
import type { FlattenedCallFrame } from '../../lib/types.js';
import { Button } from '../Button.js';
import { shortAddr, extractSelector } from '../../lib/format.js';
import { ChevronRight, ChevronDown, Target, OctagonX, ShieldCheck, Link2, HelpCircle, CircleCheck } from 'lucide-react';
import { Drawer } from '../Drawer.js';
import { FrameInspector } from './FrameInspector.js';

interface TraceTreeProps {
  frames: FlattenedCallFrame[];
  selectedFrameId: string | null;
  onSelectFrame: (id: string) => void;
}

export const TraceTree: React.FC<TraceTreeProps> = ({ frames, selectedFrameId, onSelectFrame }) => {
  const [failingOnly, setFailingOnly] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(selectedFrameId || (frames[0]?.id ?? null));
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const treeRef = useRef<HTMLDivElement>(null);

  // Auto-select deepest failing frame on first mount if none selected
  useEffect(() => {
    if (!selectedFrameId && frames.length > 0) {
      const deepest = frames.find(f => f.isDeepestFailingFrame) || frames.find(f => f.error || f.revertReason) || frames[0];
      if (deepest) {
        onSelectFrame(deepest.id);
        setFocusedId(deepest.id);
      }
    }
  }, [frames, selectedFrameId, onSelectFrame]);

  // Find parents map
  const childrenMap = new Map<string, string[]>();
  frames.forEach(f => {
    if (f.parentFrameId) {
      const existing = childrenMap.get(f.parentFrameId) || [];
      existing.push(f.id);
      childrenMap.set(f.parentFrameId, existing);
    }
  });

  const toggleCollapse = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCollapsedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setCollapsedIds(new Set());
  const collapseAll = () => {
    const allParents = new Set<string>();
    childrenMap.forEach((_, parentId) => allParents.add(parentId));
    setCollapsedIds(allParents);
  };

  const jumpToFailing = () => {
    const failing = frames.find(f => f.isDeepestFailingFrame) || frames.find(f => f.error || f.revertReason);
    if (failing) {
      // Ensure all ancestors are expanded
      let curr: FlattenedCallFrame | undefined = failing;
      const ancestorsToExpand: string[] = [];
      while (curr?.parentFrameId) {
        ancestorsToExpand.push(curr.parentFrameId);
        curr = frames.find(f => f.id === curr?.parentFrameId);
      }
      setCollapsedIds(prev => {
        const next = new Set(prev);
        ancestorsToExpand.forEach(a => next.delete(a));
        return next;
      });
      onSelectFrame(failing.id);
      setFocusedId(failing.id);
    }
  };

  // Determine which frames are hidden due to collapsed ancestors
  const isHiddenByAncestor = (frame: FlattenedCallFrame): boolean => {
    let currParentId = frame.parentFrameId;
    while (currParentId) {
      if (collapsedIds.has(currParentId)) return true;
      const parent = frames.find(f => f.id === currParentId);
      currParentId = parent ? parent.parentFrameId : null;
    }
    return false;
  };

  // Filter visible frames
  const visibleFrames = frames.filter(f => {
    if (isHiddenByAncestor(f)) return false;
    if (failingOnly) {
      return f.error || f.revertReason || f.isDeepestFailingFrame || f.causalityStatus === 'PROPAGATION_SUPPORTED';
    }
    return true;
  });

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!focusedId) return;
    const currentIndex = visibleFrames.findIndex(f => f.id === focusedId);
    if (currentIndex === -1) return;

    const currentFrame = visibleFrames[currentIndex];
    const hasChildren = (childrenMap.get(currentFrame.id) || []).length > 0;
    const isExpanded = !collapsedIds.has(currentFrame.id);

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const next = visibleFrames[currentIndex + 1];
        if (next) {
          setFocusedId(next.id);
          onSelectFrame(next.id);
        }
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prev = visibleFrames[currentIndex - 1];
        if (prev) {
          setFocusedId(prev.id);
          onSelectFrame(prev.id);
        }
        break;
      }
      case 'ArrowRight': {
        e.preventDefault();
        if (hasChildren && !isExpanded) {
          toggleCollapse(currentFrame.id);
        } else if (hasChildren && isExpanded) {
          const firstChild = visibleFrames[currentIndex + 1];
          if (firstChild) {
            setFocusedId(firstChild.id);
            onSelectFrame(firstChild.id);
          }
        }
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        if (hasChildren && isExpanded) {
          toggleCollapse(currentFrame.id);
        } else if (currentFrame.parentFrameId) {
          setFocusedId(currentFrame.parentFrameId);
          onSelectFrame(currentFrame.parentFrameId);
        }
        break;
      }
      case 'Home': {
        e.preventDefault();
        const first = visibleFrames[0];
        if (first) {
          setFocusedId(first.id);
          onSelectFrame(first.id);
        }
        break;
      }
      case 'End': {
        e.preventDefault();
        const last = visibleFrames[visibleFrames.length - 1];
        if (last) {
          setFocusedId(last.id);
          onSelectFrame(last.id);
        }
        break;
      }
      case 'Enter':
      case ' ': {
        e.preventDefault();
        onSelectFrame(currentFrame.id);
        if (window.innerWidth < 768) {
          setMobileDrawerOpen(true);
        }
        break;
      }
    }
  };

  const selectedFrame = frames.find(f => f.id === selectedFrameId) || null;

  return (
    <div className="trace-section">
      {/* Toolbar */}
      <div className="trace-toolbar">
        <div style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
          <Button
            variant={failingOnly ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setFailingOnly(!failingOnly)}
          >
            {failingOnly ? 'Showing failing only' : 'Show failing path only'}
          </Button>
          <Button variant="ghost" size="sm" onClick={expandAll}>
            Expand all
          </Button>
          <Button variant="ghost" size="sm" onClick={collapseAll}>
            Collapse all
          </Button>
        </div>
        <div>
          <Button variant="secondary" size="sm" onClick={jumpToFailing} icon={<Target size={12} />}>
            Jump to failing frame
          </Button>
        </div>
      </div>

      {/* Main Tree Container */}
      <div
        ref={treeRef}
        className="trace-tree"
        role="tree"
        aria-label="Execution call tree"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        data-testid="trace-tree"
      >
        {visibleFrames.map(frame => {
          const hasChildren = (childrenMap.get(frame.id) || []).length > 0;
          const isExpanded = !collapsedIds.has(frame.id);
          const isSelected = frame.id === selectedFrameId;
          const isFocused = frame.id === focusedId;
          const selector = extractSelector(frame.input);
          const hasError = Boolean(frame.error || frame.revertReason);

          let rowClasses = 'trace-row';
          if (isSelected) rowClasses += ' trace-row--selected';
          if (hasError) rowClasses += ' trace-row--error';
          if (frame.isDeepestFailingFrame) rowClasses += ' trace-row--deepest';

          return (
            <div
              key={frame.id}
              className={rowClasses}
              role="treeitem"
              aria-level={frame.depth + 1}
              aria-expanded={hasChildren ? isExpanded : undefined}
              aria-selected={isSelected}
              tabIndex={isFocused ? 0 : -1}
              data-testid="trace-row"
              data-frame-id={frame.id}
              style={{ paddingLeft: `${frame.depth * 18 + 8}px` }}
              onClick={() => {
                onSelectFrame(frame.id);
                setFocusedId(frame.id);
                if (window.innerWidth < 768) {
                  setMobileDrawerOpen(true);
                }
              }}
            >
              {/* Caret / expand toggle */}
              <span
                className="trace-row__caret"
                onClick={e => {
                  if (hasChildren) toggleCollapse(frame.id, e);
                }}
              >
                {hasChildren ? (
                  isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                ) : (
                  <span style={{ width: 14, display: 'inline-block' }} />
                )}
              </span>

              {/* Frame ID */}
              <span className="trace-row__id mono">{frame.id}</span>

              {/* Call Type Badge */}
              <span className="trace-row__type mono">{frame.type}</span>

              {/* Target Address + Selector */}
              <span className="trace-row__target mono">
                {frame.to ? shortAddr(frame.to) : 'Contract Creation'}
                {selector && <span className="trace-row__selector text-2"> · {selector}</span>}
              </span>

              {/* Revert / Error Message text */}
              {(frame.revertReason || frame.error) && (
                <span className="trace-row__error text-fail" title={frame.revertReason || frame.error}>
                  {frame.revertReason || frame.error}
                </span>
              )}

              {/* Gas Used */}
              <span className="trace-row__gas mono tabular">
                {Number(frame.gasUsed).toLocaleString()}
              </span>

              {/* Status Glyph */}
              <span className="trace-row__glyph">
                <CausalityStatusIcon status={frame.causalityStatus} hasError={hasError} />
              </span>

              {/* Explicit Badges for testing and forensic visibility */}
              {frame.causalityStatus === 'PROPAGATION_SUPPORTED' && (
                <span className="trace-row__badge chip chip--fail" style={{ fontSize: '10px', height: '18px' }}>
                  Failure propagated
                </span>
              )}

              {frame.isDeepestFailingFrame && (
                <span className="trace-row__badge chip chip--fail" style={{ fontSize: '10px', height: '18px' }}>
                  Failing frame
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile Drawer for Frame Inspector */}
      <Drawer
        open={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        title={selectedFrame ? `Frame ${selectedFrame.id}` : 'Frame Details'}
      >
        <FrameInspector
          frame={selectedFrame}
          frames={frames}
          onSelectFrame={id => {
            onSelectFrame(id);
            setFocusedId(id);
          }}
        />
      </Drawer>
    </div>
  );
};

function CausalityStatusIcon({ status, hasError }: { status?: string; hasError?: boolean }) {
  const props = { size: 14, strokeWidth: 1.75, 'aria-hidden': true } as const;
  switch (status) {
    case 'OBSERVED_FAILURE': return <OctagonX {...props} className="text-fail" />;
    case 'CAUGHT_CHILD_REVERT': return <ShieldCheck {...props} className="text-info" />;
    case 'PROPAGATION_SUPPORTED': return <Link2 {...props} className="text-fail" />;
    case 'CAUSALITY_UNCERTAIN': return <HelpCircle {...props} className="text-warn" />;
    case 'NO_FAILURE': return <CircleCheck {...props} className="text-ok" />;
    default:
      return hasError ? <OctagonX {...props} className="text-fail" /> : <CircleCheck {...props} className="text-ok" />;
  }
}
