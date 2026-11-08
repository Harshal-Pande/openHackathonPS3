# RevertLens — Master Database & Persistence Audit
**Document Version:** 1.0.0  
**Storage Engine:** SQLite (via Node.js `node:sqlite` `DatabaseSync`)  
**Evaluation Standard:** Architecture Decisions AD-010, AD-004 & `docs/02_ARCHITECTURE_AND_DATA_MODEL.md`  

---

## 1. Database Schema & Architecture

RevertLens utilizes SQLite for local persistence, leveraging the native `node:sqlite` (`DatabaseSync`) module included with Node.js 22 LTS.

### Relational Schema Definition

```sql
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

CREATE INDEX IF NOT EXISTS idx_evidence_investigation_id ON evidence_items(investigation_id);

CREATE TABLE IF NOT EXISTS quotes (
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
  chain_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  expiry TEXT,
  reason TEXT,
  approval_id TEXT,
  approved_at TEXT,
  approved_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
```

---

## 2. Round-Trip Persistence & Recovery (AD-010)

Under Architecture Decision **AD-010**, complete EVM forensic fidelity requires persisting the full hierarchical trace tree and decoded revert parameters:

1. **Full Trace Tree Preservation:** `raw_trace` stores the raw JSON-RPC output from `callTracer`, allowing complete call-tree visualization even after server restart.
2. **Revert Payload Preservation:** `decoded_revert` stores decoded error strings, panic codes, and custom error selectors.
3. **Idempotent Migration Engine:** The `migrate()` method inspects existing table schemas and applies schema updates idempotently using `PRAGMA table_info`.
4. **Hydration Integrity:** When `getInvestigation(id)` is called, the database service reconstructs the entire typed `InvestigationReport`, including:
   - Nested `executionTrace.rawTree`
   - `executionTrace.flattenedFrames`
   - `decodedRevert`
   - All associated `evidenceLedger` rows sorted by creation index.

---

## 3. Server Restart Durability Verification

Restart durability was tested against live on-disk databases:
1. Investigation `3071305e-9dfc-4b7c-84fe-8c7eacced651` for transaction `0xb90bcca5...` was written to SQLite.
2. The Node.js process and database connection were closed cleanly.
3. A new process instance was initialized connecting to the persisted database file.
4. `getInvestigation` retrieved the investigation:
   - Retrieved ID matched exactly (`true`).
   - Evidence item count matched exactly (5 items).
   - `rawTree` present and complete (`true`).
   - Flattened frame count matched exactly (4 frames).
5. No data corruption, missing columns, or type mismatches occurred.
