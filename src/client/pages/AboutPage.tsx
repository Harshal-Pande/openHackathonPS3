import React, { useState, useEffect } from 'react';
import { Panel } from '../components/Panel.js';
import { Chip } from '../components/Chip.js';
import { CopyButton } from '../components/CopyButton.js';
import { KeyValue } from '../components/KeyValue.js';
import { shortAddr, celoscanAddr } from '../lib/format.js';
import { showToast } from '../components/Toast.js';
import type { HealthResponse } from '../lib/types.js';
import { AlertCircle } from 'lucide-react';

interface AgentMetadata {
  name: string;
  description: string;
  network: string;
  chainId: number;
  agentWallet: string;
  attributionTag: string;
  endpoints: {
    investigate: string;
    health: string;
    agentMetadata: string;
    erc8004RegistrationTx: string;
  };
}

export const AboutPage: React.FC = () => {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [agentMeta, setAgentMeta] = useState<AgentMetadata | null>(null);
  const [regTxData, setRegTxData] = useState<{ status: string; registeredAgentId?: string | null } | null>(null);
  const [healthError, setHealthError] = useState(false);

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(j => {
        if (j.data) setHealth(j.data);
        else setHealthError(true);
      })
      .catch(() => setHealthError(true));

    fetch('/api/agent/metadata')
      .then(r => r.json())
      .then(j => {
        if (j.data) setAgentMeta(j.data);
      })
      .catch(() => {});

    fetch('/api/agent/erc8004-registration-tx')
      .then(r => r.json())
      .then(j => {
        if (j) setRegTxData(j);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="about-page stack" style={{ gap: 'var(--s-5)', maxWidth: 'var(--w-content)', margin: '0 auto' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: 'var(--s-1)' }}>About & Status</h1>
        <p className="text-2" style={{ fontSize: '14px' }}>
          Technical specification, operational status, and attribution credentials.
        </p>
      </div>

      {/* 1. What RevertLens Is and Is Not */}
      <Panel title="What RevertLens Is and Is Not" tag="Architecture">
        <div className="grid grid--2col" style={{ gap: 'var(--s-4)' }}>
          <div className="card" style={{ padding: 'var(--s-3)' }}>
            <h4 className="text-ok" style={{ fontSize: '13px', fontWeight: 600, marginBottom: 'var(--s-2)' }}>
              What RevertLens Is
            </h4>
            <ul className="text-2" style={{ fontSize: '13px', lineHeight: 1.6, paddingLeft: 'var(--s-3)' }}>
              <li>Deterministic EVM transaction and receipt forensics engine.</li>
              <li>OP Geth call-tree tracer with nested failure propagation analysis.</li>
              <li>Read-only investigator for Celo Mainnet transactions (Chain ID 42220).</li>
              <li>Evidence assembler with verifiable SHA-256 payload integrity records.</li>
            </ul>
          </div>

          <div className="card" style={{ padding: 'var(--s-3)' }}>
            <h4 className="text-warn" style={{ fontSize: '13px', fontWeight: 600, marginBottom: 'var(--s-2)' }}>
              What RevertLens Is Not
            </h4>
            <ul className="text-2" style={{ fontSize: '13px', lineHeight: 1.6, paddingLeft: 'var(--s-3)' }}>
              <li>Not a general-purpose AI chatbot or ungrounded LLM wrapper.</li>
              <li>Not a crypto wallet, transaction sender, or fund custodian.</li>
              <li>Not a smart contract security auditor or vulnerability scanner.</li>
              <li>Not an automated transaction simulator or front-running tool.</li>
            </ul>
          </div>
        </div>
      </Panel>

      {/* 2. Service Status */}
      <Panel title="Service Status" tag="Runtime">
        {healthError ? (
          <div className="card" style={{ padding: 'var(--s-3)', borderColor: 'var(--warn-line)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', color: 'var(--warn-text)' }}>
              <AlertCircle size={16} />
              <span>Could not read server status.</span>
            </div>
          </div>
        ) : !health ? (
          <p className="text-3">Querying server status...</p>
        ) : (
          <div className="stack" style={{ gap: 'var(--s-3)' }}>
            <div className="grid grid--2col">
              <KeyValue label="Engine Version">
                <span className="mono">{health.version}</span>
              </KeyValue>
              <KeyValue label="Chain ID">
                <span className="mono">{health.chainId} (Celo Mainnet)</span>
              </KeyValue>
              <KeyValue label="Chainstack RPC">
                <Chip tone="neutral">
                  {health.featureFlags?.chainstackConfigured ? 'Configured' : 'Not configured'}
                </Chip>
              </KeyValue>
              <KeyValue label="Paid Buy Features">
                <Chip tone="neutral">
                  {health.featureFlags?.buyEnabled ? 'Enabled' : 'Disabled'}
                </Chip>
              </KeyValue>
              <KeyValue label="Cencori AI Explanations">
                <Chip tone="neutral">
                  {health.featureFlags?.cencoriEnabled ? 'Enabled' : 'Disabled'}
                </Chip>
              </KeyValue>
              <KeyValue label="Buy Adapter Ready">
                <Chip tone="neutral">
                  {health.buyReady ? 'Ready' : 'Not ready'}
                </Chip>
              </KeyValue>
            </div>
          </div>
        )}
      </Panel>

      {/* 3. Agent Identity (Hackathon) */}
      <Panel title="Agent Identity & Hackathon Metadata" tag="ERC-8004 / ERC-8021">
        {agentMeta ? (
          <div className="stack" style={{ gap: 'var(--s-3)' }}>
            <div className="grid grid--2col">
              <KeyValue label="Agent Name">
                <span className="text-1">{agentMeta.name}</span>
              </KeyValue>
              <KeyValue label="Target Network">
                <span className="text-1">{agentMeta.network} ({agentMeta.chainId})</span>
              </KeyValue>
              <KeyValue label="Agent Wallet">
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-1)' }}>
                  <span className="mono">{shortAddr(agentMeta.agentWallet)}</span>
                  <CopyButton text={agentMeta.agentWallet} label="Copy wallet" onCopy={() => showToast('Wallet copied')} />
                  <a href={celoscanAddr(agentMeta.agentWallet)} target="_blank" rel="noopener noreferrer" className="btn btn--ghost btn--sm">
                    ↗
                  </a>
                </div>
              </KeyValue>
              <KeyValue label="Attribution Tag">
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-1)' }}>
                  <code className="mono text-lens">{agentMeta.attributionTag}</code>
                  <CopyButton text={agentMeta.attributionTag} label="Copy tag" onCopy={() => showToast('Tag copied')} />
                </div>
              </KeyValue>
            </div>

            <div className="card" style={{ padding: 'var(--s-3)', marginTop: 'var(--s-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', marginBottom: 'var(--s-1)' }}>
                <Chip
                  tone={
                    regTxData?.status === 'ALREADY_REGISTERED'
                      ? 'ok'
                      : regTxData?.status === 'PENDING_CONFIRMATION'
                        ? 'warn'
                        : 'info'
                  }
                >
                  {regTxData?.status === 'ALREADY_REGISTERED'
                    ? `Registered (Agent #${regTxData.registeredAgentId})`
                    : regTxData?.status === 'PENDING_CONFIRMATION'
                      ? 'Pending Confirmation'
                      : 'Prepared'}
                </Chip>
                <span className="text-2" style={{ fontSize: '13px', fontWeight: 600 }}>ERC-8004 Registry Status</span>
              </div>
              <p className="text-2" style={{ fontSize: '13px' }}>
                {regTxData?.status === 'ALREADY_REGISTERED'
                  ? `On-chain identity verified on Celo Mainnet. Registered Agent ID is #${regTxData.registeredAgentId}.`
                  : regTxData?.status === 'PENDING_CONFIRMATION'
                    ? 'Registration transaction broadcast to Celo Mainnet; awaiting final receipt confirmation.'
                    : 'ERC-8004 registration transaction is prepared with official attribution tag celo_235f6ef56f5b.'}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-3">Loading agent metadata...</p>
        )}
      </Panel>

      {/* 4. Payments Statement */}
      <Panel title="Payment Execution Architecture" tag="Security">
        <p className="text-2" style={{ fontSize: '13px', lineHeight: 1.6 }}>
          This version generates payment quotes only. It does not execute or settle payments. Public users cannot trigger disbursements from the project wallet.
        </p>
      </Panel>

      {/* 5. Status Vocabulary */}
      <Panel title="Status Vocabulary Reference" tag="Standard">
        <div className="table-container">
          <table className="vocabulary-table">
            <thead>
              <tr>
                <th style={{ width: '160px' }}>Term</th>
                <th>Definition & Evidence Requirement</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><Chip tone="ok">Live verified</Chip></td>
                <td className="text-2" style={{ fontSize: '13px' }}>Verified against live Celo Mainnet RPC data with recorded hash evidence.</td>
              </tr>
              <tr>
                <td><Chip tone="info">Locally tested</Chip></td>
                <td className="text-2" style={{ fontSize: '13px' }}>Automated vitest unit, integration, or CDP browser end-to-end tests passed locally.</td>
              </tr>
              <tr>
                <td><Chip tone="neutral">Prepared</Chip></td>
                <td className="text-2" style={{ fontSize: '13px' }}>Calldata constructed, gas simulated, and verified, awaiting broadcast authorization.</td>
              </tr>
              <tr>
                <td><Chip tone="warn">Not completed</Chip></td>
                <td className="text-2" style={{ fontSize: '13px' }}>Feature or external integration defined in specification but not executed or claimed.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
};
