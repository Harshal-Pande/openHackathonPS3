import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

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
  ai_explanation?: string | null;
  buy_quote_id?: string | null;
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

export interface PurchaseAttemptRow {
  id: string;
  quote_id: string;
  approval_id: string;
  investigation_id: string | null;
  capability_id: string;
  url: string;
  body_sha256: string;
  token_contract: string;
  amount_atomic: string;
  status: string;
  tx_hash: string | null;
  settlement_tx_hash: string | null;
  payer_address: string | null;
  payee_address: string | null;
  error_message: string | null;
  raw_stdout_redacted: string | null;
  raw_stderr_redacted: string | null;
  created_at: string;
  updated_at: string;
}

export interface SettlementProofRow {
  id: string;
  purchase_attempt_id: string;
  quote_id: string;
  tx_hash: string;
  chain_id: number;
  block_number: number | null;
  token_contract: string;
  payer: string;
  recipient: string;
  amount_atomic: string;
  receipt_status: number;
  verified_at: string;
}

export interface BudgetReservationRow {
  id: string;
  quote_id: string;
  investigation_id: string | null;
  amount_atomic: string;
  status: string;
  reserved_at: string;
  settled_at: string | null;
}

export interface PaymentAuditEventRow {
  id?: number;
  entity_type: string;
  entity_id: string;
  from_status: string | null;
  to_status: string;
  operator_username: string | null;
  details: string | null;
  created_at: string;
}

export const VALID_QUOTE_TRANSITIONS: Record<string, string[]> = {
  QUOTE_REQUESTED: ['QUOTE_RECEIVED', 'QUOTE_INVALID'],
  QUOTE_RECEIVED: ['AWAITING_OPERATOR_APPROVAL', 'QUOTE_INVALID'],
  QUOTE_INVALID: [],
  AWAITING_OPERATOR_APPROVAL: ['APPROVED', 'EXPIRED', 'CANCELLED', 'QUOTE_INVALID'],
  APPROVED: ['EXECUTION_PENDING', 'CANCELLED', 'EXPIRED', 'FAILED'],
  EXECUTION_PENDING: ['SETTLED', 'SETTLEMENT_UNKNOWN', 'FAILED'],
  SETTLEMENT_UNKNOWN: ['SETTLED', 'FAILED'],
  SETTLED: [],
  FAILED: [],
  EXPIRED: [],
  CANCELLED: []
};

export const VALID_PURCHASE_TRANSITIONS: Record<string, string[]> = {
  EXECUTION_PENDING: ['SETTLED', 'SETTLEMENT_UNKNOWN', 'FAILED', 'CANCELLED'],
  SETTLEMENT_UNKNOWN: ['SETTLED', 'FAILED'],
  SETTLED: [],
  FAILED: [],
  CANCELLED: []
};

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
    if (dbPath !== ':memory:') {
      this.db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA busy_timeout = 5000;
        PRAGMA synchronous = NORMAL;
      `);
    } else {
      this.db.exec(`
        PRAGMA busy_timeout = 5000;
      `);
    }
    this.migrate();
  }

  /**
   * Executes a synchronous callback within a SQLite transaction (BEGIN IMMEDIATE / COMMIT / ROLLBACK).
   */
  public transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const result = fn();
      this.db.exec('COMMIT;');
      return result;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK;');
      } catch {}
      throw err;
    }
  }

  public getRawDb(): DatabaseSync {
    return this.db;
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

      CREATE TABLE IF NOT EXISTS purchase_attempts (
        id TEXT PRIMARY KEY,
        quote_id TEXT NOT NULL,
        approval_id TEXT NOT NULL,
        investigation_id TEXT,
        capability_id TEXT NOT NULL,
        url TEXT NOT NULL,
        body_sha256 TEXT NOT NULL,
        token_contract TEXT NOT NULL,
        amount_atomic TEXT NOT NULL,
        status TEXT NOT NULL,
        tx_hash TEXT,
        settlement_tx_hash TEXT,
        payer_address TEXT,
        payee_address TEXT,
        error_message TEXT,
        raw_stdout_redacted TEXT,
        raw_stderr_redacted TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (quote_id) REFERENCES quote_records(id)
      );

      CREATE TABLE IF NOT EXISTS settlement_records (
        id TEXT PRIMARY KEY,
        purchase_attempt_id TEXT NOT NULL UNIQUE,
        quote_id TEXT NOT NULL,
        tx_hash TEXT NOT NULL,
        chain_id INTEGER NOT NULL DEFAULT 42220,
        block_number INTEGER,
        token_contract TEXT NOT NULL,
        payer TEXT NOT NULL,
        recipient TEXT NOT NULL,
        amount_atomic TEXT NOT NULL,
        receipt_status INTEGER NOT NULL,
        verified_at TEXT NOT NULL,
        FOREIGN KEY (purchase_attempt_id) REFERENCES purchase_attempts(id)
      );

      CREATE TABLE IF NOT EXISTS budget_reservations (
        id TEXT PRIMARY KEY,
        quote_id TEXT NOT NULL UNIQUE,
        investigation_id TEXT,
        amount_atomic TEXT NOT NULL,
        status TEXT NOT NULL,
        reserved_at TEXT NOT NULL,
        settled_at TEXT
      );

      CREATE TABLE IF NOT EXISTS payment_audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        from_status TEXT,
        to_status TEXT NOT NULL,
        operator_username TEXT,
        details TEXT,
        created_at TEXT NOT NULL
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
        ai_explanation, buy_quote_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        ai_explanation = excluded.ai_explanation,
        buy_quote_id = excluded.buy_quote_id,
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
      inv.ai_explanation || null,
      inv.buy_quote_id || null,
      inv.created_at,
      inv.updated_at
    );
  }

  public updateInvestigationAiExplanation(id: string, aiExplanationJson: string, buyQuoteId?: string): void {
    const now = new Date().toISOString();
    if (buyQuoteId) {
      const stmt = this.db.prepare(`UPDATE investigations SET ai_explanation = ?, buy_quote_id = ?, updated_at = ? WHERE id = ?`);
      stmt.run(aiExplanationJson, buyQuoteId, now, id);
    } else {
      const stmt = this.db.prepare(`UPDATE investigations SET ai_explanation = ?, updated_at = ? WHERE id = ?`);
      stmt.run(aiExplanationJson, now, id);
    }
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

    this.recordPaymentAuditEvent({
      entity_type: 'QUOTE',
      entity_id: quote.id,
      from_status: null,
      to_status: quote.status,
      operator_username: null,
      details: quote.reason || 'Quote created',
      created_at: quote.created_at
    });
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

    // Validate state transition if different
    if (existing.status !== status) {
      const allowed = VALID_QUOTE_TRANSITIONS[existing.status];
      if (allowed && !allowed.includes(status)) {
        throw new Error(`Invalid quote state transition from "${existing.status}" to "${status}".`);
      }
    }

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

    this.recordPaymentAuditEvent({
      entity_type: 'QUOTE',
      entity_id: id,
      from_status: existing.status,
      to_status: status,
      operator_username: extra.approved_by || null,
      details: extra.reason || null,
      created_at: now
    });
  }

  // --- Purchase Attempts ---

  public savePurchaseAttempt(attempt: PurchaseAttemptRow): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO purchase_attempts (
        id, quote_id, approval_id, investigation_id, capability_id, url, body_sha256,
        token_contract, amount_atomic, status, tx_hash, settlement_tx_hash,
        payer_address, payee_address, error_message, raw_stdout_redacted, raw_stderr_redacted,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      attempt.id,
      attempt.quote_id,
      attempt.approval_id,
      attempt.investigation_id || null,
      attempt.capability_id,
      attempt.url,
      attempt.body_sha256,
      attempt.token_contract,
      attempt.amount_atomic,
      attempt.status,
      attempt.tx_hash || null,
      attempt.settlement_tx_hash || null,
      attempt.payer_address || null,
      attempt.payee_address || null,
      attempt.error_message || null,
      attempt.raw_stdout_redacted || null,
      attempt.raw_stderr_redacted || null,
      attempt.created_at,
      attempt.updated_at || attempt.created_at || new Date().toISOString()
    );

    this.recordPaymentAuditEvent({
      entity_type: 'PURCHASE',
      entity_id: attempt.id,
      from_status: null,
      to_status: attempt.status,
      details: `Created purchase attempt for quote ${attempt.quote_id}`,
      created_at: attempt.created_at
    });
  }

  public getPurchaseAttempt(id: string): PurchaseAttemptRow | null {
    const stmt = this.db.prepare(`SELECT * FROM purchase_attempts WHERE id = ?`);
    const row = stmt.get(id);
    return row ? (row as unknown as PurchaseAttemptRow) : null;
  }

  public getPurchaseAttemptByQuoteId(quoteId: string): PurchaseAttemptRow | null {
    const stmt = this.db.prepare(`SELECT * FROM purchase_attempts WHERE quote_id = ? ORDER BY created_at DESC LIMIT 1`);
    const row = stmt.get(quoteId);
    return row ? (row as unknown as PurchaseAttemptRow) : null;
  }

  public listPurchaseAttempts(limit: number = 20): PurchaseAttemptRow[] {
    const stmt = this.db.prepare(`SELECT * FROM purchase_attempts ORDER BY created_at DESC LIMIT ?`);
    return stmt.all(limit) as unknown as PurchaseAttemptRow[];
  }

  public updatePurchaseAttemptStatus(
    id: string,
    status: string,
    updates: Partial<PurchaseAttemptRow> = {}
  ): void {
    const now = new Date().toISOString();
    const existing = this.getPurchaseAttempt(id);
    if (!existing) return;

    if (existing.status !== status) {
      const allowed = VALID_PURCHASE_TRANSITIONS[existing.status];
      if (allowed && !allowed.includes(status)) {
        throw new Error(`Invalid purchase attempt state transition from "${existing.status}" to "${status}".`);
      }
    }

    const stmt = this.db.prepare(`
      UPDATE purchase_attempts SET
        status = ?,
        tx_hash = COALESCE(?, tx_hash),
        settlement_tx_hash = COALESCE(?, settlement_tx_hash),
        payer_address = COALESCE(?, payer_address),
        payee_address = COALESCE(?, payee_address),
        error_message = COALESCE(?, error_message),
        raw_stdout_redacted = COALESCE(?, raw_stdout_redacted),
        raw_stderr_redacted = COALESCE(?, raw_stderr_redacted),
        updated_at = ?
      WHERE id = ?
    `);
    stmt.run(
      status,
      updates.tx_hash || null,
      updates.settlement_tx_hash || null,
      updates.payer_address || null,
      updates.payee_address || null,
      updates.error_message || null,
      updates.raw_stdout_redacted || null,
      updates.raw_stderr_redacted || null,
      now,
      id
    );

    this.recordPaymentAuditEvent({
      entity_type: 'PURCHASE',
      entity_id: id,
      from_status: existing.status,
      to_status: status,
      details: updates.error_message || null,
      created_at: now
    });
  }

  // --- Settlement Records ---

  public saveSettlementProof(proof: SettlementProofRow): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO settlement_records (
        id, purchase_attempt_id, quote_id, tx_hash, chain_id, block_number,
        token_contract, payer, recipient, amount_atomic, receipt_status, verified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      proof.id,
      proof.purchase_attempt_id,
      proof.quote_id,
      proof.tx_hash,
      proof.chain_id || 42220,
      proof.block_number || null,
      proof.token_contract,
      proof.payer,
      proof.recipient,
      proof.amount_atomic,
      proof.receipt_status,
      proof.verified_at
    );

    this.recordPaymentAuditEvent({
      entity_type: 'SETTLEMENT',
      entity_id: proof.id,
      from_status: null,
      to_status: 'VERIFIED',
      details: `Settlement verified on chain ${proof.chain_id} tx ${proof.tx_hash}`,
      created_at: proof.verified_at
    });
  }

  public getSettlementProof(purchaseAttemptId: string): SettlementProofRow | null {
    const stmt = this.db.prepare(`SELECT * FROM settlement_records WHERE purchase_attempt_id = ?`);
    const row = stmt.get(purchaseAttemptId);
    return row ? (row as unknown as SettlementProofRow) : null;
  }

  // --- Budget Reservations & Limits ---

  public getBudgetReservation(quoteId: string): BudgetReservationRow | null {
    const stmt = this.db.prepare(`SELECT * FROM budget_reservations WHERE quote_id = ?`);
    const row = stmt.get(quoteId);
    return row ? (row as unknown as BudgetReservationRow) : null;
  }

  public reserveBudgetAtomic(
    quoteId: string,
    investigationId: string | null,
    amountAtomic: string,
    limits: { dailyBudgetAtomic: bigint; perInvestigationCapAtomic: bigint }
  ): void {
    const now = new Date().toISOString();
    const amount = BigInt(amountAtomic);

    // Atomically check limits and reserve
    if (this.getKillSwitch()) {
      throw new Error('Emergency kill switch is active. Budget reservation rejected.');
    }

    const existing = this.getBudgetReservation(quoteId);
    if (existing && existing.status !== 'RELEASED') {
      throw new Error(`Active budget reservation already exists for quote ${quoteId}.`);
    }

    if (limits.dailyBudgetAtomic > 0n) {
      const todayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const currentDaily = this.getGlobalDailySpendAtomic(todayIso);
      if (currentDaily + amount > limits.dailyBudgetAtomic) {
        throw new Error(`Budget reservation would exceed daily budget of ${limits.dailyBudgetAtomic}.`);
      }
    }

    if (investigationId && limits.perInvestigationCapAtomic > 0n) {
      const stmt = this.db.prepare(`
        SELECT DISTINCT q.id, q.amount_atomic
        FROM quote_records q
        LEFT JOIN budget_reservations b ON b.quote_id = q.id
        WHERE q.investigation_id = ?
          AND (
            q.status = 'SETTLED'
            OR q.status IN ('EXECUTION_PENDING', 'SETTLEMENT_UNKNOWN')
            OR b.status IN ('RESERVED', 'COMMITTED')
          )
          AND (b.status IS NULL OR b.status != 'RELEASED')
      `);
      const rows = stmt.all(investigationId) as { amount_atomic: string }[];
      let totalInv = 0n;
      for (const r of rows) {
        try {
          totalInv += BigInt(r.amount_atomic);
        } catch {}
      }
      if (totalInv + amount > limits.perInvestigationCapAtomic) {
        throw new Error(`Budget reservation would exceed per-investigation cap of ${limits.perInvestigationCapAtomic}.`);
      }
    }

    const resId = crypto.randomUUID();
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO budget_reservations (id, quote_id, investigation_id, amount_atomic, status, reserved_at)
      VALUES (?, ?, ?, ?, 'RESERVED', ?)
    `);
    stmt.run(resId, quoteId, investigationId || null, amountAtomic, now);

    this.recordPaymentAuditEvent({
      entity_type: 'BUDGET',
      entity_id: quoteId,
      from_status: null,
      to_status: 'RESERVED',
      details: `Reserved ${amountAtomic} atomic units for quote ${quoteId}`,
      created_at: now
    });
  }

  public commitBudgetReservation(quoteId: string): void {
    const now = new Date().toISOString();
    const existing = this.getBudgetReservation(quoteId);
    if (!existing) return;

    const stmt = this.db.prepare(`
      UPDATE budget_reservations SET status = 'COMMITTED', settled_at = ? WHERE quote_id = ?
    `);
    stmt.run(now, quoteId);

    this.recordPaymentAuditEvent({
      entity_type: 'BUDGET',
      entity_id: quoteId,
      from_status: existing.status,
      to_status: 'COMMITTED',
      details: `Committed budget reservation for quote ${quoteId}`,
      created_at: now
    });
  }

  /**
   * Commits a verified settlement atomically in SQLite.
   * Enclosed in BEGIN IMMEDIATE transaction:
   * 1. Inserts settlement proof
   * 2. Commits budget reservation (status = 'COMMITTED')
   * 3. Updates purchase attempt status to 'SETTLED'
   * 4. Updates quote status to 'SETTLED'
   * If any step fails, rolls back all changes atomically.
   * Commits settlement proof, budget reservation, purchase attempt, and quote status
   * atomically within a single SQLite BEGIN IMMEDIATE transaction (DEF-36 / DEF-39).
   * Validates proof attributes against stored quote, checks cross-quote references,
   * forbids field overrides on canonical settlement proof attributes, and guarantees complete rollback.
   */
  public commitSettlementAtomic(
    proof: SettlementProofRow,
    attemptUpdates: Partial<PurchaseAttemptRow> = {}
  ): void {
    if (!proof || typeof proof !== 'object') {
      throw new Error('Settlement proof must be a valid non-null object.');
    }
    if (!proof.purchase_attempt_id) {
      throw new Error('Settlement proof missing purchase_attempt_id.');
    }
    if (!proof.quote_id) {
      throw new Error('Settlement proof missing quote_id.');
    }
    if (!proof.tx_hash || !/^0x[0-9a-fA-F]{64}$/.test(proof.tx_hash)) {
      throw new Error(`Invalid settlement proof tx_hash: "${proof.tx_hash}".`);
    }
    if (proof.chain_id !== 42220) {
      throw new Error(`Invalid chain ID in settlement proof: ${proof.chain_id}, expected 42220 (Celo Mainnet).`);
    }
    if (proof.receipt_status !== 1) {
      throw new Error(`Invalid receipt status in settlement proof: ${proof.receipt_status}, expected 1.`);
    }
    if (!proof.payer || !/^0x[0-9a-fA-F]{40}$/.test(proof.payer)) {
      throw new Error(`Invalid payer address in settlement proof: "${proof.payer}".`);
    }
    if (!proof.recipient || !/^0x[0-9a-fA-F]{40}$/.test(proof.recipient)) {
      throw new Error(`Invalid recipient address in settlement proof: "${proof.recipient}".`);
    }

    // DEFECT-39: Never permit attemptUpdates to override canonical fields
    const FORBIDDEN_OVERRIDE_FIELDS = [
      'id',
      'purchase_attempt_id',
      'quote_id',
      'token_contract',
      'amount_atomic',
      'payer_address',
      'payee_address'
    ] as const;

    for (const field of FORBIDDEN_OVERRIDE_FIELDS) {
      if ((attemptUpdates as any)[field] !== undefined) {
        throw new Error(`Forbidden attemptUpdate field: cannot override "${field}".`);
      }
    }

    if (
      attemptUpdates.settlement_tx_hash &&
      attemptUpdates.settlement_tx_hash.toLowerCase() !== proof.tx_hash.toLowerCase()
    ) {
      throw new Error('Cannot override canonical settlement_tx_hash with conflicting value.');
    }

    this.transaction(() => {
      // 1. Validate purchase attempt existence
      const attempt = this.getPurchaseAttempt(proof.purchase_attempt_id);
      if (!attempt) {
        throw new Error(`Purchase attempt "${proof.purchase_attempt_id}" not found.`);
      }

      // 2. Validate quote existence
      const quote = this.getQuote(proof.quote_id);
      if (!quote) {
        throw new Error(`Quote "${proof.quote_id}" not found.`);
      }

      // 3. Cross-attempt and cross-quote validation
      if (attempt.quote_id !== proof.quote_id) {
        throw new Error(
          `Cross-quote settlement proof rejected: attempt quote "${attempt.quote_id}" does not match proof quote "${proof.quote_id}".`
        );
      }

      // 4. Validate proof attributes against stored quote
      if (proof.token_contract.toLowerCase() !== quote.token_contract.toLowerCase()) {
        throw new Error(
          `Settlement proof token contract "${proof.token_contract}" does not match quote token contract "${quote.token_contract}".`
        );
      }
      if (proof.recipient.toLowerCase() !== quote.recipient.toLowerCase()) {
        throw new Error(
          `Settlement proof recipient "${proof.recipient}" does not match quote recipient "${quote.recipient}".`
        );
      }
      if (proof.amount_atomic !== quote.amount_atomic) {
        throw new Error(
          `Settlement proof amount "${proof.amount_atomic}" does not match quote atomic amount "${quote.amount_atomic}".`
        );
      }

      // 5. Save settlement proof
      this.saveSettlementProof(proof);

      // 6. Commit budget reservation
      const res = this.getBudgetReservation(proof.quote_id);
      if (!res) {
        throw new Error(`Budget reservation for quote "${proof.quote_id}" not found.`);
      }
      if (res.status === 'RELEASED') {
        throw new Error(`Cannot commit settlement: budget reservation for quote "${proof.quote_id}" is RELEASED.`);
      }
      this.commitBudgetReservation(proof.quote_id);

      // 7. Mark purchase attempt SETTLED with immutable canonical fields
      // Preserve legitimate separate tx_hash (request hash) if validated, but canonical settlement_tx_hash is ALWAYS proof.tx_hash
      const requestTxHash =
        attemptUpdates.tx_hash && /^0x[0-9a-fA-F]{64}$/.test(attemptUpdates.tx_hash)
          ? attemptUpdates.tx_hash
          : attempt.tx_hash || proof.tx_hash;

      this.updatePurchaseAttemptStatus(proof.purchase_attempt_id, 'SETTLED', {
        tx_hash: requestTxHash,
        settlement_tx_hash: proof.tx_hash,
        payer_address: proof.payer,
        payee_address: proof.recipient,
        raw_stdout_redacted: attemptUpdates.raw_stdout_redacted,
        raw_stderr_redacted: attemptUpdates.raw_stderr_redacted,
        error_message: attemptUpdates.error_message
      });

      // 8. Mark quote SETTLED
      this.updateQuoteStatus(proof.quote_id, 'SETTLED');
    });
  }

  public releaseBudgetReservation(quoteId: string, reason: string): void {
    const now = new Date().toISOString();
    const existing = this.getBudgetReservation(quoteId);
    if (!existing) return;

    if (existing.status === 'COMMITTED') {
      throw new Error(`Cannot release budget reservation for quote ${quoteId}: reservation is already COMMITTED.`);
    }

    const stmt = this.db.prepare(`
      UPDATE budget_reservations SET status = 'RELEASED', settled_at = ? WHERE quote_id = ?
    `);
    stmt.run(now, quoteId);

    this.recordPaymentAuditEvent({
      entity_type: 'BUDGET',
      entity_id: quoteId,
      from_status: existing.status,
      to_status: 'RELEASED',
      details: `Released budget reservation for quote ${quoteId}: ${reason}`,
      created_at: now
    });
  }

  // --- Payment Audit Events ---

  public recordPaymentAuditEvent(event: {
    entity_type: string;
    entity_id: string;
    from_status?: string | null;
    to_status: string;
    operator_username?: string | null;
    details?: string | null;
    created_at?: string;
  }): void {
    const now = event.created_at || new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO payment_audit_events (
        entity_type, entity_id, from_status, to_status, operator_username, details, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      event.entity_type,
      event.entity_id,
      event.from_status || null,
      event.to_status,
      event.operator_username || null,
      event.details || null,
      now
    );
  }

  public listPaymentAuditEvents(entityId?: string, limit: number = 50): PaymentAuditEventRow[] {
    if (entityId) {
      const stmt = this.db.prepare(`
        SELECT * FROM payment_audit_events WHERE entity_id = ? ORDER BY created_at DESC LIMIT ?
      `);
      return stmt.all(entityId, limit) as unknown as PaymentAuditEventRow[];
    }
    const stmt = this.db.prepare(`
      SELECT * FROM payment_audit_events ORDER BY created_at DESC LIMIT ?
    `);
    return stmt.all(limit) as unknown as PaymentAuditEventRow[];
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

    this.recordPaymentAuditEvent({
      entity_type: 'KILL_SWITCH',
      entity_id: 'global',
      from_status: null,
      to_status: enabled ? 'ENGAGED' : 'DISENGAGED',
      details: `Kill switch state changed to ${enabled}`,
      created_at: now
    });
  }

  public getGlobalDailySpendAtomic(sinceIso: string): bigint {
    const stmt = this.db.prepare(`
      SELECT DISTINCT q.id, q.amount_atomic
      FROM quote_records q
      LEFT JOIN budget_reservations b ON b.quote_id = q.id
      WHERE q.created_at >= ?
        AND (
          q.status = 'SETTLED'
          OR q.status IN ('EXECUTION_PENDING', 'SETTLEMENT_UNKNOWN')
          OR b.status IN ('RESERVED', 'COMMITTED')
        )
        AND (b.status IS NULL OR b.status != 'RELEASED')
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

  /**
   * Atomically approves a quote: enforces unexpired, hash match, kill-switch,
   * single-use conditional transition from AWAITING_OPERATOR_APPROVAL to APPROVED.
   */
  public approveQuoteAtomic(params: {
    quoteId: string;
    expectedBodySha256: string;
    operatorUsername: string;
  }): QuoteRow {
    const quote = this.getQuote(params.quoteId);
    if (!quote) {
      throw new Error(`Quote "${params.quoteId}" not found.`);
    }
    if (quote.status === 'APPROVED') {
      throw new Error(
        `Quote "${params.quoteId}" is already approved. Duplicate approval prohibited.`
      );
    }
    if (quote.status !== 'AWAITING_OPERATOR_APPROVAL') {
      throw new Error(
        `Quote "${params.quoteId}" has status "${quote.status}" and cannot be approved.`
      );
    }
    if (quote.expiry && new Date(quote.expiry).getTime() < Date.now()) {
      this.updateQuoteStatus(quote.id, 'EXPIRED', { reason: 'Quote expired before approval' });
      throw new Error(`Quote "${params.quoteId}" has expired. Please request a fresh quote.`);
    }
    if (params.expectedBodySha256 !== quote.body_sha256) {
      this.updateQuoteStatus(quote.id, 'QUOTE_INVALID', {
        reason: 'Cryptographic body hash mismatch'
      });
      throw new Error(
        `Cryptographic body hash mismatch. Approved hash (${params.expectedBodySha256}) does not match quoted body hash (${quote.body_sha256}). Quote invalidated.`
      );
    }
    if (this.getKillSwitch()) {
      throw new Error('Emergency kill switch is active. Quote approvals are blocked.');
    }

    return this.transaction(() => {
      const freshQuote = this.getQuote(params.quoteId);
      if (!freshQuote || freshQuote.status !== 'AWAITING_OPERATOR_APPROVAL') {
        throw new Error(`Concurrent approval conflict: quote status changed.`);
      }

      const approvalId = crypto.randomUUID();
      const now = new Date().toISOString();

      const stmt = this.db.prepare(`
        UPDATE quote_records SET
          status = 'APPROVED',
          approval_id = ?,
          approved_at = ?,
          approved_by = ?,
          updated_at = ?
        WHERE id = ? AND status = 'AWAITING_OPERATOR_APPROVAL'
      `);
      const res = stmt.run(approvalId, now, params.operatorUsername, now, quote.id);
      if (res.changes === 0) {
        throw new Error(`Concurrent approval conflict: quote "${quote.id}" status changed.`);
      }

      this.recordPaymentAuditEvent({
        entity_type: 'QUOTE',
        entity_id: quote.id,
        from_status: 'AWAITING_OPERATOR_APPROVAL',
        to_status: 'APPROVED',
        operator_username: params.operatorUsername,
        details: 'Operator authorized quote packet',
        created_at: now
      });

      return this.getQuote(quote.id)!;
    });
  }

  /**
   * Atomically consumes an approved quote and creates a durable purchase attempt:
   * verifies approval ID, unexpired status, rechecks budget limits, reserves budget,
   * transitions quote to EXECUTION_PENDING, and persists purchase attempt record.
   * All state is durably committed inside an immediate SQLite transaction before invocation.
   */
  public consumeApprovalAndCreateAttemptAtomic(params: {
    quoteId: string;
    approvalId: string;
    operatorUsername: string;
    limits: { dailyBudgetAtomic: bigint; perInvestigationCapAtomic: bigint };
  }): { quote: QuoteRow; attempt: PurchaseAttemptRow } {
    const quote = this.getQuote(params.quoteId);
    if (!quote) {
      throw new Error(`Quote "${params.quoteId}" not found.`);
    }
    if (quote.status !== 'APPROVED') {
      throw new Error(
        `Quote "${params.quoteId}" has status "${quote.status}". Only APPROVED quotes can be executed.`
      );
    }
    if (quote.approval_id !== params.approvalId) {
      throw new Error(`Approval ID mismatch for quote "${params.quoteId}". Execution rejected.`);
    }
    if (quote.expiry && new Date(quote.expiry).getTime() < Date.now()) {
      this.updateQuoteStatus(quote.id, 'EXPIRED', { reason: 'Quote expired prior to execution' });
      throw new Error(`Quote "${params.quoteId}" has expired prior to execution.`);
    }
    if (this.getKillSwitch()) {
      throw new Error('Emergency kill switch is active. Execution blocked.');
    }

    return this.transaction(() => {
      const freshQuote = this.getQuote(params.quoteId);
      if (!freshQuote || freshQuote.status !== 'APPROVED') {
        throw new Error(`Concurrent execution conflict: quote status changed.`);
      }

      // Check limits and reserve budget atomically
      this.reserveBudgetAtomic(
        freshQuote.id,
        freshQuote.investigation_id || null,
        freshQuote.amount_atomic,
        params.limits
      );

      // Single-use atomic conditional state transition from APPROVED to EXECUTION_PENDING
      const now = new Date().toISOString();
      const updateQuoteStmt = this.db.prepare(`
        UPDATE quote_records SET
          status = 'EXECUTION_PENDING',
          updated_at = ?
        WHERE id = ? AND status = 'APPROVED'
      `);
      const updateRes = updateQuoteStmt.run(now, freshQuote.id);
      if (updateRes.changes === 0) {
        throw new Error(`Concurrent execution conflict: quote "${freshQuote.id}" status changed.`);
      }

      const attemptId = crypto.randomUUID();
      const attemptRow: PurchaseAttemptRow = {
        id: attemptId,
        quote_id: freshQuote.id,
        approval_id: params.approvalId,
        investigation_id: freshQuote.investigation_id || null,
        capability_id: freshQuote.capability_id,
        url: freshQuote.url,
        body_sha256: freshQuote.body_sha256,
        token_contract: freshQuote.token_contract,
        amount_atomic: freshQuote.amount_atomic,
        status: 'EXECUTION_PENDING',
        tx_hash: null,
        settlement_tx_hash: null,
        payer_address: null,
        payee_address: freshQuote.recipient,
        error_message: null,
        raw_stdout_redacted: null,
        raw_stderr_redacted: null,
        created_at: now,
        updated_at: now
      };

      this.savePurchaseAttempt(attemptRow);

      this.recordPaymentAuditEvent({
        entity_type: 'QUOTE',
        entity_id: freshQuote.id,
        from_status: 'APPROVED',
        to_status: 'EXECUTION_PENDING',
        operator_username: params.operatorUsername,
        details: 'Approval consumed atomically, purchase attempt created',
        created_at: now
      });

      return {
        quote: this.getQuote(freshQuote.id)!,
        attempt: attemptRow
      };
    });
  }

  public getJournalMode(): string {
    const stmt = this.db.prepare(`PRAGMA journal_mode;`);
    const row = stmt.get() as { journal_mode?: string } | undefined;
    return row?.journal_mode || 'unknown';
  }

  public getBusyTimeout(): number {
    const stmt = this.db.prepare(`PRAGMA busy_timeout;`);
    const row = stmt.get() as { timeout?: number } | undefined;
    return typeof row?.timeout === 'number' ? row.timeout : 0;
  }

  public close(): void {
    this.db.close();
  }
}
