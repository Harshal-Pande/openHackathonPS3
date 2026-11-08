import React, { useState, useEffect } from 'react';
import { getRecentInvestigations } from '../lib/api.js';
import type { RecentInvestigationItem } from '../lib/types.js';
import { Panel } from '../components/Panel.js';
import { Chip } from '../components/Chip.js';
import { Button } from '../components/Button.js';
import { CopyButton } from '../components/CopyButton.js';
import { Skeleton } from '../components/Skeleton.js';
import { txStatusTone, txStatusLabel } from '../lib/status.js';
import { shortHash, relativeTime, absoluteTime } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { showToast } from '../components/Toast.js';
import { Search } from 'lucide-react';

export const HistoryPage: React.FC = () => {
  const [items, setItems] = useState<RecentInvestigationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterQuery, setFilterQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  useEffect(() => {
    getRecentInvestigations(100)
      .then(res => setItems(res))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const presentStatuses = Array.from(new Set(items.map(i => i.status)));

  const filteredItems = items.filter(item => {
    const matchesQuery = filterQuery ? item.txHash.toLowerCase().includes(filterQuery.toLowerCase()) : true;
    const matchesStatus = statusFilter === 'ALL' ? true : item.status === statusFilter;
    return matchesQuery && matchesStatus;
  });

  return (
    <div className="history-page stack" style={{ gap: 'var(--s-5)' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: 'var(--s-1)' }}>History</h1>
        <p className="text-2" style={{ fontSize: '14px' }}>
          Saved transaction forensic investigations on Celo Mainnet.
        </p>
      </div>

      <Panel title="All Investigations">
        {/* Toolbar */}
        <div className="history-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--s-3)', marginBottom: 'var(--s-4)' }}>
          <div style={{ position: 'relative', width: '280px', maxWidth: '100%' }}>
            <Search size={14} className="text-3" style={{ position: 'absolute', left: '10px', top: '10px' }} />
            <input
              type="text"
              placeholder="Filter by hash..."
              value={filterQuery}
              onChange={e => setFilterQuery(e.target.value)}
              style={{
                width: '100%',
                height: '34px',
                paddingLeft: '32px',
                paddingRight: '12px',
                background: 'var(--ink-850)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--r-md)',
                color: 'var(--text-1)',
                fontSize: '13px',
                fontFamily: 'var(--font-mono)'
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
            <div className="segmented-control" style={{ display: 'flex', background: 'var(--ink-850)', padding: '2px', borderRadius: 'var(--r-md)', border: '1px solid var(--border)' }}>
              <button
                type="button"
                className={`segmented-btn ${statusFilter === 'ALL' ? 'segmented-btn--active' : ''}`}
                onClick={() => setStatusFilter('ALL')}
                style={{
                  background: statusFilter === 'ALL' ? 'var(--petrol-700)' : 'transparent',
                  border: 'none',
                  color: statusFilter === 'ALL' ? 'var(--text-1)' : 'var(--text-3)',
                  padding: '4px 10px',
                  borderRadius: 'var(--r-sm)',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                All
              </button>
              {presentStatuses.map(st => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  style={{
                    background: statusFilter === st ? 'var(--petrol-700)' : 'transparent',
                    border: 'none',
                    color: statusFilter === st ? 'var(--text-1)' : 'var(--text-3)',
                    padding: '4px 10px',
                    borderRadius: 'var(--r-sm)',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  {txStatusLabel(st)}
                </button>
              ))}
            </div>

            <span className="text-3 mono" style={{ fontSize: '12px' }}>
              {filteredItems.length} of {items.length}
            </span>
          </div>
        </div>

        {/* Table / List */}
        {loading ? (
          <div className="stack" style={{ gap: 'var(--s-2)' }}>
            <Skeleton height={44} />
            <Skeleton height={44} />
            <Skeleton height={44} />
            <Skeleton height={44} />
            <Skeleton height={44} />
          </div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--s-6) 0' }}>
            <p className="text-2" style={{ marginBottom: 'var(--s-3)' }}>No investigations yet.</p>
            <Button variant="secondary" onClick={() => navigate('/')}>
              Investigate a transaction
            </Button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--s-6) 0' }}>
            <p className="text-2" style={{ marginBottom: 'var(--s-3)' }}>
              No investigations match "{filterQuery}".
            </p>
            <Button variant="ghost" size="sm" onClick={() => { setFilterQuery(''); setStatusFilter('ALL'); }}>
              Clear filter
            </Button>
          </div>
        ) : (
          <div className="table-container">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Transaction</th>
                  <th>Status</th>
                  <th>Investigated</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map(item => (
                  <tr
                    key={item.id}
                    className="history-row"
                    data-testid="history-row"
                    onClick={() => navigate(`/investigation/${item.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
                        <span className="mono text-lens">{shortHash(item.txHash)}</span>
                        <span onClick={e => e.stopPropagation()}>
                          <CopyButton
                            text={item.txHash}
                            label="Copy transaction hash"
                            onCopy={() => showToast('Hash copied')}
                          />
                        </span>
                      </div>
                    </td>
                    <td>
                      <Chip tone={txStatusTone(item.status)}>
                        {txStatusLabel(item.status)}
                      </Chip>
                    </td>
                    <td>
                      <span className="text-2" style={{ fontSize: '13px' }} title={absoluteTime(item.createdAt)}>
                        {relativeTime(item.createdAt)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="text-lens" style={{ fontSize: '13px' }}>
                        Open →
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: 'var(--s-4)', borderTop: '1px solid var(--border)', paddingTop: 'var(--s-3)' }}>
          <p className="text-3" style={{ fontSize: '12px' }}>
            Showing up to 100 most recent investigations.
          </p>
        </div>
      </Panel>
    </div>
  );
};
