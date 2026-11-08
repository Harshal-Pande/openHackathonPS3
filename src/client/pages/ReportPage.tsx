import React, { useState, useEffect } from 'react';
import { getInvestigation, createInvestigation } from '../lib/api.js';
import { getCachedReport, setCachedReport, navigate } from '../lib/router.js';
import type { InvestigationReport } from '../lib/types.js';
import { VerdictHeader } from '../components/report/VerdictHeader.js';
import { TxFacts } from '../components/report/TxFacts.js';
import { DiagnosisPanel } from '../components/report/DiagnosisPanel.js';
import { FactsColumns } from '../components/report/FactsColumns.js';
import { TraceTree } from '../components/report/TraceTree.js';
import { FrameInspector } from '../components/report/FrameInspector.js';
import { TraceStatusBanner } from '../components/report/TraceStatusBanner.js';
import { EvidenceLedger } from '../components/report/EvidenceLedger.js';
import { AiPanel } from '../components/report/AiPanel.js';
import { PaymentPanel } from '../components/report/PaymentPanel.js';
import { LimitationsPanel } from '../components/report/LimitationsPanel.js';
import { Skeleton } from '../components/Skeleton.js';
import { showToast } from '../components/Toast.js';
import { AlertCircle } from 'lucide-react';
import { Button } from '../components/Button.js';

interface ReportPageProps {
  id: string;
}

export const ReportPage: React.FC<ReportPageProps> = ({ id }) => {
  const [report, setReport] = useState<InvestigationReport | null>(() => getCachedReport(id));
  const [loading, setLoading] = useState<boolean>(!report);
  const [error, setError] = useState<string | null>(null);
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);

  useEffect(() => {
    const cached = getCachedReport(id);
    if (cached) {
      setReport(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    getInvestigation(id)
      .then(res => {
        setReport(res);
        setCachedReport(res);
      })
      .catch((err: any) => {
        setError(err.message || 'Failed to load report.');
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleExportJson = () => {
    if (!report) return;
    try {
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const filename = `revertlens-${report.txHash.slice(0, 10)}.json`;
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`Exported ${filename}`);
    } catch (err: any) {
      showToast(`Export failed: ${err.message}`, 'fail');
    }
  };

  const handleRunAgain = async () => {
    if (!report) return;
    try {
      setLoading(true);
      const newReport = await createInvestigation(report.txHash);
      setCachedReport(newReport);
      navigate(`/investigation/${newReport.investigationId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to rerun investigation.');
      setLoading(false);
    }
  };

  const handleCitationClick = (citationId: string) => {
    const el = document.getElementById(`ev-${citationId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('highlight-flash');
      setTimeout(() => el.classList.remove('highlight-flash'), 1500);
    }
  };

  if (loading) {
    return (
      <div className="report-loading stack" style={{ gap: 'var(--s-4)', padding: 'var(--s-4) 0' }}>
        <Skeleton height={140} />
        <Skeleton height={180} />
        <div className="grid grid--2col">
          <Skeleton height={260} />
          <Skeleton height={260} />
        </div>
        <Skeleton height={300} />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="card report-error" role="alert" style={{ padding: 'var(--s-5)', textAlign: 'center', marginTop: 'var(--s-6)' }}>
        <AlertCircle size={32} className="text-fail" style={{ margin: '0 auto var(--s-3)' }} />
        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: 'var(--s-2)' }}>Report Not Available</h2>
        <p className="text-2" style={{ marginBottom: 'var(--s-4)' }}>{error || 'Investigation report could not be found.'}</p>
        <Button variant="secondary" onClick={() => navigate('/')}>
          Back to Search
        </Button>
      </div>
    );
  }

  const flattenedFrames = report.executionTrace?.flattenedFrames || [];
  const selectedFrame = flattenedFrames.find(f => f.id === selectedFrameId) || null;

  return (
    <div className="report-page stack" style={{ gap: 'var(--s-5)', paddingBottom: 'var(--s-7)' }}>
      {/* 1. Verdict Header */}
      <VerdictHeader
        report={report}
        onExportJson={handleExportJson}
        onNewInvestigation={() => navigate('/')}
      />

      {/* 2. Transaction Facts */}
      <TxFacts report={report} />

      {/* 3. Deterministic Diagnosis */}
      <DiagnosisPanel report={report} onCitationClick={handleCitationClick} />

      {/* 4. Facts, Inferences, and Unknowns */}
      <FactsColumns diagnosis={report.diagnosis} />

      {/* 5. Execution Trace & Frame Inspector */}
      {report.traceStatus === 'AVAILABLE' && flattenedFrames.length > 0 ? (
        <div className="trace-grid">
          <div className="trace-grid__tree">
            <TraceTree
              frames={flattenedFrames}
              selectedFrameId={selectedFrameId}
              onSelectFrame={setSelectedFrameId}
            />
          </div>
          <div className="trace-grid__inspector">
            <FrameInspector
              frame={selectedFrame}
              frames={flattenedFrames}
              onSelectFrame={setSelectedFrameId}
            />
          </div>
        </div>
      ) : (
        <TraceStatusBanner
          traceStatus={report.traceStatus}
          onRunAgain={handleRunAgain}
        />
      )}

      {/* 6. Evidence Ledger */}
      {report.evidenceLedger && report.evidenceLedger.length > 0 && (
        <EvidenceLedger evidenceLedger={report.evidenceLedger} />
      )}

      {/* 7. AI Explanation (Advisory) */}
      <AiPanel aiExplanation={report.aiExplanation} onCitationClick={handleCitationClick} />

      {/* 8. Payment Quote */}
      <PaymentPanel buyQuote={report.buyQuote} />

      {/* 9. Limitations Panel */}
      <LimitationsPanel limitations={report.limitations} />
    </div>
  );
};
