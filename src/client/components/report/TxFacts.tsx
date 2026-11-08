import React from 'react';
import { Panel } from '../Panel.js';
import { KeyValue } from '../KeyValue.js';
import { CopyButton } from '../CopyButton.js';
import { showToast } from '../Toast.js';
import type { InvestigationReport } from '../../lib/types.js';
import { weiToCelo, gasPercent, celoscanAddr, shortAddr } from '../../lib/format.js';

interface TxFactsProps {
  report: InvestigationReport;
}

export const TxFacts: React.FC<TxFactsProps> = ({ report }) => {
  const tx = report.transaction;
  const rx = report.receipt;

  return (
    <Panel title="Transaction Facts" tag="Chain Data" noPad={false}>
      <div className="stack">
        {tx && (
          <>
            <KeyValue label="Hash" mono value={
              <span className="inline-actions">
                <span>{tx.hash.slice(0, 18)}…</span>
                <CopyButton text={tx.hash} label="Copy hash" onCopy={() => showToast('Hash copied')} />
              </span>
            } />
            <KeyValue label="From" mono value={
              <span className="inline-actions">
                <a href={celoscanAddr(tx.from)} target="_blank" rel="noopener noreferrer" className="addr-short">{shortAddr(tx.from)}</a>
                <CopyButton text={tx.from} label="Copy sender address" onCopy={() => showToast('Address copied')} />
              </span>
            } />
            {tx.to && (
              <KeyValue label="To" mono value={
                <span className="inline-actions">
                  <a href={celoscanAddr(tx.to)} target="_blank" rel="noopener noreferrer" className="addr-short">{shortAddr(tx.to)}</a>
                  <CopyButton text={tx.to} label="Copy recipient address" onCopy={() => showToast('Address copied')} />
                </span>
              } />
            )}
            {tx.blockNumber != null ? (
              <KeyValue label="Block" value={tx.blockNumber.toLocaleString()} />
            ) : (
              <KeyValue label="Block" value="Pending" />
            )}
            <KeyValue label="Nonce" value={tx.nonce} />
            {(() => {
              const celoVal = weiToCelo(tx.value);
              return celoVal ? <KeyValue label="Value" value={celoVal} /> : null;
            })()}
            <KeyValue label="Gas limit" mono value={Number(tx.gas).toLocaleString()} />
            {tx.gasPrice && <KeyValue label="Gas price" mono value={`${tx.gasPrice} wei`} />}
            {tx.maxFeePerGas && <KeyValue label="Max fee/gas" mono value={`${tx.maxFeePerGas} wei`} />}
            {tx.maxPriorityFeePerGas && <KeyValue label="Max priority" mono value={`${tx.maxPriorityFeePerGas} wei`} />}
            {tx.input && tx.input.length >= 10 && (
              <KeyValue label="Selector" mono value={tx.input.slice(0, 10)} />
            )}
          </>
        )}
        {rx && (
          <>
            <KeyValue label="Receipt status" value={rx.rawStatus !== null ? `0x${rx.rawStatus.toString(16)} (${rx.status})` : rx.status} />
            <KeyValue label="Gas used" mono value={
              `${Number(rx.gasUsed).toLocaleString()}${tx ? ` (${gasPercent(rx.gasUsed, tx.gas) ?? 'n/a'})` : ''}`
            } />
            {rx.logsCount !== undefined && (
              <KeyValue label="Logs count" value={rx.logsCount} />
            )}
            {rx.contractAddress && (
              <KeyValue label="Contract created" mono value={
                <span className="inline-actions">
                  <span className="addr-short">{shortAddr(rx.contractAddress)}</span>
                  <CopyButton text={rx.contractAddress} label="Copy contract address" onCopy={() => showToast('Address copied')} />
                </span>
              } />
            )}
          </>
        )}
        <KeyValue label="Chain" value={`Celo Mainnet (${report.chainId})`} />
        <KeyValue label="Trace" value={report.traceStatus} />
      </div>
    </Panel>
  );
};
