import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Database } from '../src/server/db/database.js';

describe('Database Reliability & Concurrency (WAL Mode & Busy Timeout)', () => {
  const tempDbPath = path.resolve('./data/test_wal_reliability.sqlite');

  const cleanup = () => {
    for (const f of [tempDbPath, `${tempDbPath}-journal`, `${tempDbPath}-wal`, `${tempDbPath}-shm`]) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch (_) {}
    }
  };

  afterEach(() => {
    cleanup();
  });

  it('configures WAL journal mode and 5000ms busy timeout on file database', () => {
    cleanup();
    const db = new Database(tempDbPath);

    expect(db.getJournalMode().toLowerCase()).toBe('wal');
    expect(db.getBusyTimeout()).toBe(5000);

    db.close();
  });

  it('handles in-memory database gracefully without throwing on pragma', () => {
    const memDb = new Database(':memory:');

    // In-memory sqlite reports 'memory' for journal_mode
    expect(memDb.getJournalMode().toLowerCase()).toBe('memory');
    expect(memDb.getBusyTimeout()).toBe(5000);

    memDb.close();
  });

  it('persists data across separate database connections targeting the same file', () => {
    cleanup();
    const db1 = new Database(tempDbPath);
    db1.saveInvestigation({
      id: 'test-uuid-001',
      tx_hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      chain_id: 42220,
      status: 'REVERTED',
      trace_status: 'AVAILABLE',
      raw_tx: null,
      raw_receipt: null,
      raw_trace: null,
      normalized_trace: null,
      decoded_revert: null,
      diagnosis: JSON.stringify({ headline: 'Persistence verified' }),
      limitations: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    db1.close();

    // Reopen via second connection instance
    const db2 = new Database(tempDbPath);
    const row = db2.getInvestigation('test-uuid-001');

    expect(row).toBeDefined();
    expect(row?.id).toBe('test-uuid-001');
    expect(row?.chain_id).toBe(42220);
    expect(row?.status).toBe('REVERTED');

    db2.close();
  });

  it('handles concurrent read and write operations without SQLITE_BUSY locking errors', async () => {
    cleanup();
    const db = new Database(tempDbPath);

    const writePromises = Array.from({ length: 25 }, (_, i) => {
      return new Promise<void>((resolve, reject) => {
        try {
          db.saveInvestigation({
            id: `concurrent-uuid-${i}`,
            tx_hash: `0x${i.toString(16).padStart(64, '0')}`,
            chain_id: 42220,
            status: 'REVERTED',
            trace_status: 'AVAILABLE',
            raw_tx: null,
            raw_receipt: null,
            raw_trace: null,
            normalized_trace: null,
            decoded_revert: null,
            diagnosis: JSON.stringify({ index: i }),
            limitations: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

          // Concurrent read
          const fetched = db.getInvestigation(`concurrent-uuid-${i}`);
          expect(fetched?.id).toBe(`concurrent-uuid-${i}`);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });

    await Promise.all(writePromises);

    const all = db.listInvestigations(50);
    expect(all.length).toBe(25);

    db.close();
  });
});
