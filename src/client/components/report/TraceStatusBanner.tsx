import React from 'react';
import type { TraceStatus } from '../../lib/types.js';
import { Button } from '../Button.js';
import { AlertCircle, Clock, Ban, ServerCrash } from 'lucide-react';

interface TraceStatusBannerProps {
  traceStatus: TraceStatus | string;
  onRunAgain?: () => void;
}

export const TraceStatusBanner: React.FC<TraceStatusBannerProps> = ({ traceStatus, onRunAgain }) => {
  let title = 'Execution trace unavailable';
  let detail = 'The diagnosis below uses receipt data only.';
  let tone: 'warn' | 'fail' | 'neutral' = 'warn';
  let canRetry = false;
  let Icon = AlertCircle;

  switch (traceStatus) {
    case 'NOT_REQUESTED':
      title = 'No trace requested';
      detail = 'A trace is only requested for reverted transactions that have a receipt.';
      tone = 'neutral';
      canRetry = false;
      Icon = Ban;
      break;
    case 'UNSUPPORTED':
      title = 'Execution trace unavailable';
      detail = 'The RPC node does not support debug_traceTransaction with callTracer, so internal calls could not be inspected. The diagnosis below uses the receipt only.';
      tone = 'warn';
      canRetry = false;
      Icon = AlertCircle;
      break;
    case 'RATE_LIMITED':
      title = 'Trace request was rate-limited';
      detail = 'The provider returned HTTP 429. The diagnosis uses the receipt only.';
      tone = 'warn';
      canRetry = true;
      Icon = Clock;
      break;
    case 'TIMEOUT':
      title = 'Trace request timed out';
      detail = 'The provider did not return the trace in time. The diagnosis uses the receipt only.';
      tone = 'warn';
      canRetry = true;
      Icon = Clock;
      break;
    case 'PROVIDER_ERROR':
      title = 'Trace retrieval failed';
      detail = 'The provider returned an error. See limitations for details.';
      tone = 'fail';
      canRetry = true;
      Icon = ServerCrash;
      break;
    case 'INVALID_RESPONSE':
      title = 'Trace response was malformed';
      detail = 'The provider returned data RevertLens could not parse.';
      tone = 'fail';
      canRetry = true;
      Icon = ServerCrash;
      break;
    default:
      title = 'Trace unavailable';
      detail = `Trace status: ${traceStatus}`;
      tone = 'neutral';
      canRetry = false;
  }

  const borderClass = tone === 'fail' ? 'trace-banner--fail' : tone === 'warn' ? 'trace-banner--warn' : 'trace-banner--neutral';

  return (
    <div className={`trace-banner ${borderClass}`} role="status">
      <div className="trace-banner__content">
        <Icon size={18} className="trace-banner__icon" aria-hidden="true" />
        <div>
          <h4 className="trace-banner__title">{title}</h4>
          <p className="trace-banner__detail">{detail}</p>
        </div>
      </div>
      {canRetry && onRunAgain && (
        <Button variant="secondary" size="sm" onClick={onRunAgain}>
          Run again
        </Button>
      )}
    </div>
  );
};
