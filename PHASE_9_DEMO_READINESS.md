# Phase 9 — Demo Readiness & Demonstration Walk-Through Plan
**Track:** Agents on Open Rails | Track PS3 — Build with Buy  
**Format:** 3-Minute Video Screencast Walk-Through  
**Target Duration:** 2:45 to 3:00  
**Demonstration Host:** Local Production Server (`http://127.0.0.1:3000`) or Cloud Deployment

---

## 1. Demo Recording Checklist (Pre-Recording Verification)

- [ ] Fastify server is running in production mode: `node dist/server/index.js`.
- [ ] Browser window is sized to standard 1080p (1920x1080) or 720p (1280x720) with clean developer bookmarks hidden.
- [ ] Direct Chainstack Celo Mainnet RPC connectivity is verified via `GET /api/health` (`chainstackConfigured: true`).
- [ ] Candidate failed swap transaction hash is ready in clipboard:
  ```
  0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445
  ```
- [ ] Dark theme contrast is verified on screen recording preview.
- [ ] Microphone audio levels are checked for clarity.

---

## 2. Structured 10-Step Product Journey Script

### Step 1: Product Positioning (0:00 - 0:25)
- **Visual:** RevertLens homepage at `http://127.0.0.1:3000`. Highlight brand, Celo Mainnet 42220 badge, and headline.
- **Spoken Text:**
  > *"Welcome to RevertLens. On Celo, when a smart contract call fails, standard block explorers only show you two words: 'execution reverted'. They don't tell you which internal pool reverted, whether slippage was exceeded, or if a child call threw an error that was handled. RevertLens is an evidence-based forensic tool built specifically for Celo Mainnet developers to find out exactly why transactions fail."*

### Step 2: Submitting Failed Transaction (0:25 - 0:45)
- **Visual:** Click "Load Verified Sample Failed Tx" or paste `0xb90bcca5...`. Click **Inspect Transaction**.
- **Spoken Text:**
  > *"We submit a real failed swap transaction from Celo Mainnet block 52,460,432. RevertLens queries our dedicated Chainstack Celo archive node running OP Geth, fetching the transaction facts, on-chain receipt, and executing a full debug_traceTransaction call with callTracer."*

### Step 3: Deterministic Forensic Diagnosis (0:45 - 1:10)
- **Visual:** Focus on the red `REVERTED` status badge, gas consumed (`54,232`), and the **Deterministic Analysis** banner.
- **Spoken Text:**
  > *"The analysis finishes in real time. RevertLens identifies the failure category as a PROPAGATED CHILD REVERT with HIGH confidence. The transaction consumed 54,232 gas, and our deterministic classifier proves that the top-level failure originated inside a nested sub-call."*

### Step 4: Call Tree Visualizer & Causality Isolation (1:10 - 1:40)
- **Visual:** Expand the **Execution Call Tree**. Highlight root frame 0 and child frame `0.1` calling `0xe3d8...`.
- **Spoken Text:**
  > *"Here is the execution tree. Most tools make the mistake of blaming any sub-call that throws an error. RevertLens implements a 5-tier causality taxonomy. Here, it verifies that leaf frame 0.1 emitted 'Swap reverted', and that every ancestor up to the root frame failed continuously. We isolate caught try/catch reverts from true failure causes."*

### Step 5: Dual Revert Reason Preservation (1:40 - 2:00)
- **Visual:** Point to `rootRevertReason` (`"execution reverted"`) and `nestedFailureReason` (`"Swap reverted"`).
- **Spoken Text:**
  > *"Notice that we preserve both revert reasons: the root transaction emitted generic 'execution reverted', while the internal contract emitted 'Swap reverted'. Both are stored permanently in SQLite."*

### Step 6: Atomic Evidence Ledger (2:00 - 2:20)
- **Visual:** Scroll to the **Evidence Ledger** showing `[E-01]` through `[E-05]`. Click to expand an item.
- **Spoken Text:**
  > *"Every diagnosis is backed by an atomic evidence ledger. Each fact—from transaction parameters to decoded revert bytes—is hashed with SHA-256 for content integrity. Our narrative only cites proven facts."*

### Step 7: AI Explanation & Anti-Hallucination Guardrails (2:20 - 2:40)
- **Visual:** Point to the **AI Enhanced Explanation** card.
- **Spoken Text:**
  > *"For human readability, we integrate Cencori's AI through the Celo Buy marketplace. To guarantee safety, we enforce a 10-rule Zod validator: the AI cannot invent phantom pools or fake tokens—it must strictly cite verified evidence items. When AI is disabled, our deterministic report remains 100% functional."*

### Step 8: Buy Payment Ledger & JSON Export (2:40 - 3:00)
- **Visual:** Point to the **Buy Payment Status** panel showing capability `cencori.v1.chat.completions` ($0.01 quote, 0 funds spent). Click **Download JSON Report**.
- **Spoken Text:**
  > *"Our Buy payment lifecycle binds quotes to exact SHA-256 body hashes with budget ceilings and an operator kill switch. Finally, developers can export the entire investigation report as JSON with a single click. RevertLens: turning opaque Celo reverts into deterministic, evidence-backed clarity."*

---

## 3. Post-Recording Verification
- [ ] Confirm exported JSON file opens and parses cleanly.
- [ ] Verify that no secrets, private keys, or internal tokens were visible on screen.
- [ ] Verify total video duration is between 2:30 and 3:00.
