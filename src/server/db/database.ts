import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export interface InvestigationRow {
  id: string;
  tx_hash: string;
  chain_id: number;
  status: string;
  trace_status: string;
  raw_tx: string | null;
  raw_receipt: string | null;
  raw_trace: string | null;
  normalized_trace: string | null;
  decoded_revert: string | null;
  diagnosis: string | null;
  limitations: string | null;
  created_at: string;
  updated_at: string;
}

export interface EvidenceRow {
  id: string;
  investigation_id: string;
  evidence_id: string;
  kind: string;
  source_method: string;
  description: string;
  value: string;
  content_hash: string;
  created_at: string;
}

export interface QuoteRow {
  id: string;
  investigation_id?: string | null;
  capability_id: string;
  url: string;
  method: string;
  exact_body: string;
  body_sha256: string;
  token_symbol: string;
  token_contract: string;
  amount_atomic: string;
  amount_display: string;
  recipient: string;
  chain_id: number;
  status: string;
  expiry?: string | null;
  reason?: string | null;
  approval_id?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export class Database {
  private db: DatabaseSync;

  constructor(dbPath: string = './data/revertlens.sqlite') {
    if (dbPath !== ':memory:') {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    this.db = new DatabaseSync(dbPath);
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS investigations (
        id TEXT PRIMARY KEY,
        tx_hash TEXT NOT NULL,
        chain_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        trace_status TEXT NOT NULL,
        raw_tx TEXT,
        raw_receipt TEXT,
        raw_trace TEXT,
        normalized_trace TEXT,
        decoded_revert TEXT,
        diagnosis TEXT,
        limitations TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_investigations_tx_hash ON investigations(tx_hash);
      CREATE INDEX IF NOT EXISTS idx_investigations_created_at ON investigations(created_at DESC);

      CREATE TABLE IF NOT EXISTS evidence_items (
        id TEXT PRIMARY KEY,
        investigation_id TEXT NOT NULL,
        evidence_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        source_method TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        value TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (investigation_id) REFERENCES investigations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_evidence_investigation ON evidence_items(investigation_id);

      CREATE TABLE IF NOT EXISTS quote_records (
        id TEXT PRIMARY KEY,
        investigation_id TEXT,
        capability_id TEXT NOT NULL,
        url TEXT NOT NULL,
        method TEXT NOT NULL,
        exact_body TEXT NOT NULL,
        body_sha256 TEXT NOT NULL,
        token_symbol TEXT NOT NULL,
        token_contract TEXT NOT NULL,
        amount_atomic TEXT NOT NULL,
        amount_display TEXT NOT NULL,
        recipient TEXT NOT NULL,
        chain_id INTEGER NOT NULL DEFAULT 42220,
        status TEXT NOT NULL,
        expiry TEXT,
        reason TEXT,
        approval_id TEXT,
        approved_at TEXT,
        approved_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // Safe schema migrations for existing SQLite databases
    try {
      this.db.exec(`ALTER TABLE investigations ADD COLUMN raw_trace TEXT;`);
    } catch {
      // Column already exists
    }
    try {
      this.db.exec(`ALTER TABLE investigations ADD COLUMN decoded_revert TEXT;`);
    } catch {
      // Column already exists
    }
    try {
      this.db.exec(`ALTER TABLE investigations ADD COLUMN ai_explanation TEXT;`);
    } catch {
      // Column already exists
    }
    try {
      this.db.exec(`ALTER TABLE investigations ADD COLUMN buy_quote_id TEXT;`);
    } catch {
      // Column already exists
    }
    try {
      this.db.exec(`ALTER TABLE evidence_items ADD COLUMN description TEXT NOT NULL DEFAULT '';`);
    } catch {
      // Column already exists
    }
    try {
      this.db.exec(`ALTER TABLE quote_records ADD COLUMN investigation_id TEXT;`);
    } catch {}
    try {
      this.db.exec(`ALTER TABLE quote_records ADD COLUMN chain_id INTEGER NOT NULL DEFAULT 42220;`);
    } catch {}
    try {
      this.db.exec(`ALTER TABLE quote_records ADD COLUMN expiry TEXT;`);
    } catch {}
    try {
      this.db.exec(`ALTER TABLE quote_records ADD COLUMN reason TEXT;`);
    } catch {}
    try {
      this.db.exec(`ALTER TABLE quote_records ADD COLUMN approval_id TEXT;`);
    } catch {}
    try {
      this.db.exec(`ALTER TABLE quote_records ADD COLUMN approved_at TEXT;`);
    } catch {}
    try {
      this.db.exec(`ALTER TABLE quote_records ADD COLUMN approved_by TEXT;`);
    } catch {}
    try {
      this.db.exec(`ALTER TABLE quote_records ADD COLUMN updated_at TEXT;`);
    } catch {}
  }

  public saveInvestigation(inv: InvestigationRow): void {
    const stmt = this.db.prepare(`
      INSERT INTO investigations (
        id, tx_hash, chain_id, status, trace_status,
        raw_tx, raw_receipt, raw_trace, normalized_trace, decoded_revert, diagnosis, limitations,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        trace_status = excluded.trace_status,
        raw_tx = excluded.raw_tx,
        raw_receipt = excluded.raw_receipt,
        raw_trace = excluded.raw_trace,
        normalized_trace = excluded.normalized_trace,
        decoded_revert = excluded.decoded_revert,
        diagnosis = excluded.diagnosis,
        limitations = excluded.limitations,
        updated_at = excluded.updated_at
    `);
    stmt.run(
      inv.id,
      inv.tx_hash,
      inv.chain_id,
      inv.status,
      inv.trace_status,
      inv.raw_tx,
      inv.raw_receipt,
      inv.raw_trace,
      inv.normalized_trace,
      inv.decoded_revert,
      inv.diagnosis,
      inv.limitations,
      inv.created_at,
      inv.updated_at
    );
  }

  public getInvestigation(id: string): InvestigationRow | undefined {
    const stmt = this.db.prepare(`SELECT * FROM investigations WHERE id = ?`);
    return stmt.get(id) as unknown as InvestigationRow | undefined;
  }

  public getInvestigationByTxHash(txHash: string): InvestigationRow | undefined {
    const stmt = this.db.prepare(`SELECT * FROM investigations WHERE LOWER(tx_hash) = LOWER(?) ORDER BY created_at DESC LIMIT 1`);
    return stmt.get(txHash) as unknown as InvestigationRow | undefined;
  }

  public listInvestigations(limit: number = 20): InvestigationRow[] {
    const stmt = this.db.prepare(`SELECT * FROM investigations ORDER BY created_at DESC LIMIT ?`);
    return stmt.all(limit) as unknown as InvestigationRow[];
  }

  public saveEvidenceItems(items: EvidenceRow[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO evidence_items (
        id, investigation_id, evidence_id, kind, source_method, description, value, content_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of items) {
      stmt.run(
        item.id,
        item.investigation_id,
        item.evidence_id,
        item.kind,
        item.source_method,
        item.description,
        item.value,
        item.content_hash,
        item.created_at
      );
    }
  }

  public getEvidenceByInvestigationId(investigationId: string): EvidenceRow[] {
    const stmt = this.db.prepare(`SELECT * FROM evidence_items WHERE investigation_id = ? ORDER BY evidence_id ASC`);
    return stmt.all(investigationId) as unknown as EvidenceRow[];
  }

  public saveQuote(quote: QuoteRow): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO quote_records (
        id, investigation_id, capability_id, url, method, exact_body, body_sha256,
        token_symbol, token_contract, amount_atomic, amount_display,
        recipient, chain_id, status, expiry, reason, approval_id, approved_at, approved_by,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      quote.id,
      quote.investigation_id || null,
      quote.capability_id,
      quote.url,
      quote.method,
      quote.exact_body,
      quote.body_sha256,
      quote.token_symbol,
      quote.token_contract,
      quote.amount_atomic,
      quote.amount_display,
      quote.recipient,
      quote.chain_id || 42220,
      quote.status,
      quote.expiry || null,
      quote.reason || null,
      quote.approval_id || null,
      quote.approved_at || null,
      quote.approved_by || null,
      quote.created_at,
      quote.updated_at || null
    );
  }

  public getQuote(id: string): QuoteRow | undefined {
    const stmt = this.db.prepare(`SELECT * FROM quote_records WHERE id = ?`);
    return stmt.get(id) as unknown as QuoteRow | undefined;
  }

  public getQuotesByInvestigationId(investigationId: string): QuoteRow[] {
    const stmt = this.db.prepare(`SELECT * FROM quote_records WHERE investigation_id = ? ORDER BY created_at DESC`);
    return stmt.all(investigationId) as unknown as QuoteRow[];
  }

  public listQuotes(limit: number = 20): QuoteRow[] {
    const stmt = this.db.prepare(`SELECT * FROM quote_records ORDER BY created_at DESC LIMIT ?`);
    return stmt.all(limit) as unknown as QuoteRow[];
  }

  public updateQuoteStatus(
    id: string,
    status: string,
    extra: {
      approval_id?: string;
      approved_at?: string;
      approved_by?: string;
      reason?: string;
    } = {}
  ): void {
    const now = new Date().toISOString();
    const existing = this.getQuote(id);
    if (!existing) return;

    const stmt = this.db.prepare(`
      UPDATE quote_records SET
        status = ?,
        approval_id = COALESCE(?, approval_id),
        approved_at = COALESCE(?, approved_at),
        approved_by = COALESCE(?, approved_by),
        reason = COALESCE(?, reason),
        updated_at = ?
      WHERE id = ?
    `);
    stmt.run(
      status,
      extra.approval_id || null,
      extra.approved_at || null,
      extra.approved_by || null,
      extra.reason || null,
      now,
      id
    );
  }

  public getKillSwitch(): boolean {
    const stmt = this.db.prepare(`SELECT value FROM system_settings WHERE key = 'kill_switch'`);
    const row = stmt.get() as { value: string } | undefined;
    return row ? row.value === 'true' : false;
  }

  public setKillSwitch(enabled: boolean): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES ('kill_switch', ?, ?)
    `);
    stmt.run(enabled ? 'true' : 'false', now);
  }

  public getGlobalDailySpendAtomic(sinceIso: string): bigint {
    const stmt = this.db.prepare(`
      SELECT amount_atomic FROM quote_records
      WHERE status IN ('SETTLED', 'APPROVED', 'EXECUTION_PENDING')
        AND created_at >= ?
    `);
    const rows = stmt.all(sinceIso) as { amount_atomic: string }[];
    let total = 0n;
    for (const r of rows) {
      try {
        total += BigInt(r.amount_atomic);
      } catch {
        // Ignore unparseable
      }
    }
    return total;
  }

  public close(): void {
    this.db.close();
  }
}
