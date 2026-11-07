# RevertLens — 3-Minute Hackathon Demonstration Script
**Track:** Agents on Open Rails | Track PS3 — Build with Buy  
**Format:** Screen recording with voiceover (Target duration: 2:45 - 3:00)

---

## Act 1: The Problem (0:00 - 0:35)

- **Visual:** Open Celo Blockscout showing a failed transaction with generic `"execution reverted"`.
- **Voiceover:**
  > "Every builder and user on Celo has experienced this frustration: you execute a swap or multihop transaction, it fails, and the block explorer gives you just two words: 'execution reverted'. Was it slippage? Did a sub-call run out of gas? Did an internal liquidity pool revert? Standard explorers don't tell you. That's why we built RevertLens."

---

## Act 2: Live Investigation (0:35 - 1:15)

- **Visual:** Switch to RevertLens web dashboard at `http://localhost:3000`. Paste candidate hash:
  `0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445`
  (or click **Load Verified Sample Failed Tx (Swap Reverted)**).
  Click **Inspect Transaction**.
- **Voiceover:**
  > "RevertLens connects directly to our high-performance Chainstack Celo Mainnet archive node running OP Geth. We query the transaction, fetch the receipt, and execute a full debug_traceTransaction call using callTracer in real time."
- **Visual:** Investigation results load. Highlight the red status badge: `REVERTED`, Gas used: `54,232`.

---

## Act 3: Deterministic EVM Forensics (1:15 - 2:00)

- **Visual:** Focus on **Deterministic Analysis** banner and **Causality Classification** (`PROPAGATION_SUPPORTED`). Expand the **Execution Call Tree**.
- **Voiceover:**
  > "Notice our forensic engine in action. Many tools make the mistake of blaming any child call that throws an error. RevertLens enforces a strict 5-tier causality taxonomy: here it proves continuous propagation from root frame 0 to frame 0.1, calling contract 0xe3d8... which emitted the exact revert string 'Swap reverted'. We isolate caught sub-calls from true failure causes."
- **Visual:** Highlight the **Evidence Ledger** showing `[E-01]` through `[E-05]` with cryptographic SHA-256 hashes.

---

## Act 4: AI Layer & Buy Marketplace Architecture (2:00 - 2:35)

- **Visual:** Scroll to the **Cencori AI Explanation** card (showing "AI enhancement is currently disabled. Deterministic chain evidence is authoritative" in zero-spend mode) and the **Buy Payment Ledger** panel showing transparent $0.01 quotes and zero spend incurred.
- **Voiceover:**
  > "For human readability, RevertLens integrates Cencori's LLM through the official Celo Buy marketplace. To prevent AI hallucinations, we enforce a strict 10-rule Zod validator: the AI cannot invent phantom pools or fake balances—it must cite verified evidence items.
  > Under the hood, our Buy payment state machine handles quotes, budget caps, and cryptographic body-hash binding. In this demonstration, we operate under a strict zero-spend mode (`CENCORI_ENABLED=false`) with transparent quotes, showing exactly how paid inference seamlessly activates when funded."

---

## Act 5: Verification & Export (2:35 - 3:00)

- **Visual:** Click **Download JSON Report**. Open the exported JSON file showing the complete evidence-backed forensics.
- **Voiceover:**
  > "Developers can export full machine-readable forensic reports for automated debugging or post-mortems. RevertLens transforms opaque Celo errors into deterministic, evidence-backed clarity—built on Celo, powered by Chainstack, and designed for the Buy marketplace."
