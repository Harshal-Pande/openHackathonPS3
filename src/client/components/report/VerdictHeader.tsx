import React from 'react';
import { XCircle, CheckCircle2, Clock, SearchX, HelpCircle, Link2, OctagonX, ShieldCheck, CircleCheck } from 'lucide-react';
import { Chip } from '../Chip.js';
import { CopyButton } from '../CopyButton.js';
import { Button } from '../Button.js';
import type { InvestigationReport } from '../../lib/types.js';
import { txStatusTone, txStatusLabel, traceStatusTone, traceStatusLabel, causalityTone, causalityLabel, diagnosisTone } from '../../lib/status.js';
import { shortHash, celoscanTx, relativeTime, gasPercent } from '../../lib/format.js';
import { buildMarkdownSummary } from '../../lib/summary.js';
import { showToast } from '../Toast.js';

interface VerdictHeaderProps {
  report: InvestigationReport;
  onExportJson: () => void;
  onNewInvestigation: () => void;
}

export const VerdictHeader: React.FC<VerdictHeaderProps> = ({ report, onExportJson, onNewInvestigation }) => {
  const tone = diagnosisTone(report.status);
  const { diagnosis } = report;

  const handleCopyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}#/investigation/${report.investigationId}`;
    navigator.clipboard?.writeText(url).then(() => showToast('Link copied')).catch(() => {});
  };

  const handleCopySummary = () => {
    const md = buildMarkdownSummary(report);
    navigator.clipboard?.writeText(md).then(() => showToast('Summary copied')).catch(() => {});
  };

  const gasInfo = report.receipt && report.transaction
    ? gasPercent(report.receipt.gasUsed, report.transaction.gas)
    : null;

  return (
    <div className={`verdict-header verdict-header--${tone}`}>
      <div className="verdict-header__chips">
        <Chip
          tone={txStatusTone(report.status)}
          data-testid="status-chip"
          icon={<StatusIcon status={report.status} />}
        >
          {txStatusLabel(report.status)}
        </Chip>

        {diagnosis.causalityCategory && (
          <Chip
            tone={causalityTone(diagnosis.causalityCategory)}
            data-testid="causality-chip"
            icon={<CausalityIcon status={diagnosis.causalityCategory} />}
          >
            {causalityLabel(diagnosis.causalityCategory)}
          </Chip>
        )}

        <Chip
          tone={traceStatusTone(report.traceStatus)}
          data-testid="trace-status-chip"
        >
          {traceStatusLabel(report.traceStatus)}
        </Chip>
      </div>

      <h1 className="verdict-header__headline" data-testid="verdict-headline">
        {diagnosis.headline}
      </h1>
      <p className="verdict-header__narrative">{diagnosis.narrative}</p>

      <div className="verdict-header__facts">
        <span className="mono">
          {shortHash(report.txHash)}
        </span>
        <CopyButton text={report.txHash} label="Copy transaction hash" onCopy={() => showToast('Hash copied')} />
        <a href={celoscanTx(report.txHash)} target="_blank" rel="noopener noreferrer" className="btn btn--ghost btn--sm">
          Celoscan ↗
        </a>
        {report.receipt?.blockNumber != null && (
          <span className="text-2">Block {report.receipt.blockNumber}</span>
        )}
        {gasInfo && report.receipt && report.transaction && (
          <span className="text-2">
            Gas {Number(report.receipt.gasUsed).toLocaleString()} / {Number(report.transaction.gas).toLocaleString()} ({gasInfo})
          </span>
        )}
        {report.createdAt && (
          <span className="text-2">Investigated {relativeTime(report.createdAt)}</span>
        )}
      </div>

      <div className="verdict-header__actions">
        <Button
          variant="secondary"
          size="sm"
          onClick={onExportJson}
          data-testid="export-json"
        >
          Download JSON
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopyLink}
          data-testid="copy-link"
        >
          Copy link
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopySummary}
          data-testid="copy-summary"
        >
          Copy summary
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onNewInvestigation}
        >
          New investigation
        </Button>
      </div>
    </div>
  );
};

function StatusIcon({ status }: { status: string }) {
  const props = { size: 12, strokeWidth: 1.75, 'aria-hidden': true } as const;
  switch (status) {
    case 'REVERTED': return <XCircle {...props} />;
    case 'SUCCESS': return <CheckCircle2 {...props} />;
    case 'PENDING': return <Clock {...props} />;
    case 'NOT_FOUND': return <SearchX {...props} />;
    default: return <HelpCircle {...props} />;
  }
}

function CausalityIcon({ status }: { status: string }) {
  const props = { size: 12, strokeWidth: 1.75, 'aria-hidden': true } as const;
  switch (status) {
    case 'OBSERVED_FAILURE': return <OctagonX {...props} />;
    case 'CAUGHT_CHILD_REVERT': return <ShieldCheck {...props} />;
    case 'PROPAGATION_SUPPORTED': return <Link2 {...props} />;
    case 'CAUSALITY_UNCERTAIN': return <HelpCircle {...props} />;
    case 'NO_FAILURE': return <CircleCheck {...props} />;
    default: return null;
  }
}
