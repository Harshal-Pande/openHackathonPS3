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
  normalized_trace: string | null;
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
  value: string;
  content_hash: string;
  created_at: string;
}

export interface QuoteRow {
  id: string;
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
  status: string;
  created_at: string;
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
        normalized_trace TEXT,
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
        value TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (investigation_id) REFERENCES investigations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_evidence_investigation ON evidence_items(investigation_id);

      CREATE TABLE IF NOT EXISTS quote_records (
        id TEXT PRIMARY KEY,
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
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  public saveInvestigation(inv: InvestigationRow): void {
    const stmt = this.db.prepare(`
      INSERT INTO investigations (
        id, tx_hash, chain_id, status, trace_status,
        raw_tx, raw_receipt, normalized_trace, diagnosis, limitations,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        trace_status = excluded.trace_status,
        raw_tx = excluded.raw_tx,
        raw_receipt = excluded.raw_receipt,
        normalized_trace = excluded.normalized_trace,
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
      inv.normalized_trace,
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
        id, investigation_id, evidence_id, kind, source_method, value, content_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of items) {
      stmt.run(
        item.id,
        item.investigation_id,
        item.evidence_id,
        item.kind,
        item.source_method,
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
        id, capability_id, url, method, exact_body, body_sha256,
        token_symbol, token_contract, amount_atomic, amount_display,
        recipient, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      quote.id,
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
      quote.status,
      quote.created_at
    );
  }

  public close(): void {
    this.db.close();
  }
}
