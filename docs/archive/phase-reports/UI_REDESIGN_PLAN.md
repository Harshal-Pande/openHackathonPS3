# RevertLens — UI/UX REDESIGN IMPLEMENTATION & ARCHITECTURE SPECIFICATION

**Document Version:** 1.0.0 (Release Candidate)  
**Hackathon:** Agents on Open Rails 2026 | Loops House × Celo  
**Track:** PS3 — Build with Buy  
**Target Network:** Celo Mainnet (`eip155:42220`), Chain ID: `42220`  
**Verified Candidate Transaction:** `0xb90bcca5d39501ca3978b5938fc6ffc47f73b393978c4515baf4c491d4509445`  

---

## 1. PURPOSE AND DESIGN CONCEPT: "THE EVIDENCE BENCH"

RevertLens is a specialized transaction forensics workbench engineered to investigate and diagnose failed transactions on Celo Mainnet. It is not a generic AI chat assistant, wallet, swap interface, or general blockchain explorer.

### The Metaphor: Forensic Lab Bench Under a Directed Lamp
- **Palette Hierarchy (60-30-10 Rule):**
  - **60% Primary Ink (`#0B1117`):** Deep, distraction-free neutral canvas.
  - **30% Petrol Chrome (`#122733`):** Precision panels, code wells, borders, and structured framing.
  - **10% Lens Highlighter (`#CDF545`):** Reserved exclusively for investigative focal points (failing call frame indicator, search button primary action, active timeline node, active tabs). The Lens accent is never used for generic decoration or status banners.
- **Visual Restraint:**
  - Dark mode only (system respects dark preferences, enforced `#0B1117` background).
  - No purple/indigo SaaS gradients, no blurred glassmorphism, no animated particles, no generic AI sparkles or decorative emoji.
  - Monospace font (`Geist Mono`) for all EVM hashes, addresses, selectors, gas values, block numbers, and raw traces with tabular numerals enabled.

---

## 2. DEPENDENCY JUSTIFICATIONS & CONSTRAINTS

Only three dependencies were approved and added to `package.json`:
1. `lucide-react` (`^1.70.0`): Clean, accessible SVG iconography replacing all legacy emojis (D6).
2. `@fontsource-variable/geist` (`^5.3.0`): High-legibility modern sans-serif body typography.
3. `@fontsource-variable/geist-mono` (`^5.3.0`): Precision monospace font with tabular figures for EVM technical data.

**Strictly Excluded:**
- Tailwind CSS (all styling implemented in plain CSS using custom properties `tokens.css`, `base.css`, `components.css`).
- Client routing libraries (e.g. `react-router-dom` not installed; lightweight zero-dependency hash router implemented in `src/client/lib/router.ts`).
- Animation libraries (e.g. `framer-motion` not installed; pure CSS transitions).
- Component UI kits (e.g. Radix, MUI, Chakra; built native accessible primitives).

---

## 3. DEFECT REMEDIATION MATRIX (FIXES D1–D12)

| Defect | Issue Description | Root Cause | Remediated Behavior |
|:---|:---|:---|:---|
| **D1** | Buy card showed green "$0.00 (Zero spend incurred)" and "Buy Architecture: Ready" when no quote existed | Hardcoded template strings in legacy `App.tsx` | Evaluates quote state cleanly. When `buyQuote === null`, renders neutral informational panel stating: *"No payment quote was created for this investigation. This version does not execute payments."* No green money claims. |
| **D2** | AI card showed `DISABLED` on report reload | Backend persists forensics but does not persist AI explanation (`aiExplanation: null` on reload) | Treats `null` as *"Not stored for this report"* (neutral), distinct from actual service errors or disabled flags. |
| **D3** | Every frame with `propagatedToParent` showed a "Propagated" badge, including root | Conflated raw trace flag with forensic causality classification | Badges derive strictly from `causalityStatus`: `PROPAGATION_SUPPORTED` → "Failure propagated", `OBSERVED_FAILURE` → "Failing frame", `UNSUPPORTED_CALL_FAILED` → "Failed call". |
| **D4** | Header hardcoded "Provider: Chainstack Growth (Direct RPC)" | Hardcoded marketing string | Displays "Celo Mainnet · 42220" and reads live status from `/api/health.featureFlags.chainstackConfigured` ("RPC configured" / "RPC not configured"). |
| **D5** | Loading card showed pseudo-stage checklist and spinning emoji | Simulated multi-stage progress when backend does not stream progress | Replaced with honest indeterminate progress bar (`loading-panel`) and live elapsed timer (`loading-timer`). |
| **D6** | Emojis used as icons (🔍, ⚙️, 🔒) | Legacy styling | Replaced with semantic Lucide SVG icons (`Search`, `AlertCircle`, `CheckCircle2`, `Shield`, `FileJson`, `Copy`, `ExternalLink`, etc.). |
| **D7** | Errors dropped `error.code`, showing only message | Generic catch block | Structured error handling via `src/client/lib/errors.ts` mapping error codes (`TX_NOT_FOUND`, `RATE_LIMITED`, `TRACE_UNAVAILABLE`, etc.) to clear recovery actions. |
| **D8** | Recent investigations limited to 5 with no deep links or history page | No routing or list pagination | Implemented Hash routing (`#/investigation/:id`, `#/history`) supporting up to 100 persisted investigations with search filter. |
| **D9** | Types declared inside `App.tsx` (~900 lines) | Monolithic single file | Extracted into modular architecture under `src/client/lib/types.ts`. |
| **D10** | Test scripts relied on brittle CSS color string selectors | Lack of test attributes | Added deterministic `data-testid` attributes (`page-title`, `tx-input`, `submit-investigate`, `sample-button`, `verdict-headline`, `status-chip`, `trace-tree`, `trace-row`, `evidence-row`, `export-json`). |
| **D11** | Decorative emoji in footer | Unprofessional styling | Replaced with clean text stating: *"Forensic analysis performed on public Celo Mainnet data. No private keys, wallet signatures, or funds required."* |
| **D12** | System default fonts | Missing brand typography | Integrated self-hosted Geist and Geist Mono via `@fontsource-variable/*` with `.woff2` served with proper MIME types. |

---

## 4. ARCHITECTURE & COMPONENT TREE

```
src/client/
├── App.tsx                     # Top-level shell and hash router coordinator
├── main.tsx                    # React 19 mount with font & stylesheet imports
├── lib/
│   ├── types.ts                # TypeScript interfaces mirroring API contracts
│   ├── api.ts                  # Fetch client for all /api endpoints
│   ├── format.ts               # Hex, gas, date, and address formatting utilities
│   ├── status.ts               # Status, badge, and tone mapping
│   ├── causality.ts            # Forensic causality mapping and copy
│   ├── errors.ts               # Error code to actionable copy mapper
│   ├── extractHash.ts          # Clean 0x transaction hash extractor
│   ├── summary.ts              # Markdown summary generator
│   └── router.ts               # Zero-dependency hash router
├── styles/
│   ├── tokens.css              # Design variables (Ink, Petrol, Lens, Spacing, Typography)
│   ├── base.css                # Global resets, typography, utility classes
│   └── components.css          # Semantic component classes
├── components/
│   ├── Button.tsx              # Primary, secondary, ghost, danger, warn variants
│   ├── Chip.tsx                # Status, causality, and category tags
│   ├── CopyButton.tsx          # 1.5s visual feedback copy trigger
│   ├── Drawer.tsx              # Slide-over inspector for mobile viewports
│   ├── EmptyState.tsx          # Clean empty workbench state
│   ├── HashInput.tsx           # Monospace 0x input with validation state
│   ├── KeyValue.tsx            # Technical metadata row
│   ├── Logo.tsx                # RevertLens geometric mark + wordmark
│   ├── Modal.tsx               # Accessible dialog with ESC & backdrop close
│   ├── Panel.tsx               # Primary workbench panel container
│   ├── Shell.tsx               # TopBar + Page Container + Footer
│   ├── Skeleton.tsx            # Accessible loading placeholder
│   ├── Toast.tsx               # Non-intrusive action feedback
│   ├── TopBar.tsx              # Navigation, network pill, and operator link
│   └── report/
│       ├── VerdictHeader.tsx   # Status, headline, actions (Export, Copy Link, Markdown)
│       ├── TxFacts.tsx         # Block, From, To, Value, Gas Used/Limit
│       ├── DiagnosisPanel.tsx  # Forensic narrative, facts, unknowns, safe next steps
│       ├── FactsColumns.tsx    # Technical 2-column EVM breakdown
│       ├── TraceStatusBanner.tsx # Trace availability notices
│       ├── TraceTree.tsx       # ARIA tree with keyboard navigation and failing frame indicators
│       ├── FrameInspector.tsx  # Selected call frame deep-dive with raw input/output wells
│       ├── EvidenceLedger.tsx  # Cryptographic SHA-256 evidence item rows
│       ├── AiPanel.tsx         # Advisory LLM inference panel with honest disclosures
│       ├── PaymentPanel.tsx    # Zero-spend quote ledger
│       └── LimitationsPanel.tsx # Forensics boundaries and caveats
└── pages/
    ├── InvestigatePage.tsx     # Transaction input, sample button, recent runs, causality guide
    ├── ReportPage.tsx          # Full forensic workbench for a specific investigation
    ├── HistoryPage.tsx         # Searchable list of up to 100 historical investigations
    ├── AboutPage.tsx           # Forensic methodology, API boundaries, and what RevertLens is/is not
    └── OperatorPage.tsx        # Password-gated operator console (React memory only)
```

---

## 5. DESIGN SYSTEM SPECIFICATION

### 5.1 Color Tokens
```css
:root {
  /* Ink Canvas */
  --ink-950: #070B0E;
  --ink-900: #0B1117; /* Primary Page Background */
  --ink-850: #0D141C;
  --ink-800: #0F1722; /* Card / Panel Background */
  --ink-700: #141E2B;

  /* Petrol Chrome */
  --petrol-900: #0E1F29;
  --petrol-800: #122733; /* Code Wells & Borders */
  --petrol-700: #163040; /* Hover & Active States */
  --petrol-600: #1C3D52;
  --petrol-500: #254F6B;

  /* Lens Highlighter Accent */
  --lens:       #CDF545; /* 10% Focus Accent */
  --lens-glow:  #B8E332;
  --lens-subtle:#1E2B14;
  --lens-text:  #0B1117; /* High-contrast text on Lens */

  /* Semantic Feedback (Tested WCAG AAA on Ink-900) */
  --fail-bg:    #241014;  --fail-line: #521820;  --fail-text: #FCA5A5; /* Contrast: 10.00:1 */
  --warn-bg:    #221A0A;  --warn-line: #4D3A14;  --warn-text: #FDE047; /* Contrast: 14.39:1 */
  --ok-bg:      #0C2017;  --ok-line:   #184A32;  --ok-text:   #86EFAC; /* Contrast: 13.51:1 */
  --info-bg:    #0D1E2D;  --info-line: #183C5A;  --info-text: #7DD3FC; /* Contrast: 12.80:1 */

  /* Text Hierarchy */
  --text-1:     #F2F5F8; /* Contrast: 17.34:1 (AAA) */
  --text-2:     #9FB2C3; /* Contrast: 8.70:1 (AAA) */
  --text-3:     #627D92; /* Contrast: 4.40:1 (AA Large) */
}
```

### 5.2 Accessibility & ARIA Implementation
- **Trace Tree (`TraceTree.tsx`):** Implements `role="tree"` on root and `role="treeitem"` on each frame row. Full keyboard navigation supported (`ArrowDown`/`ArrowUp` to traverse visible frames, `Enter`/`Space` to select frame for inspection, `ArrowRight` to expand child calls, `ArrowLeft` to collapse). Roving `tabindex` ensures focus management compliance.
- **Modals & Drawers (`Modal.tsx`, `Drawer.tsx`):** Trap focus, restore prior focus on dismissal, support `Escape` key close, and declare `aria-modal="true"`.
- **Honest Loading Indicator (`InvestigatePage.tsx`):** No fake percentages or stepped checklists; renders an indeterminate progress bar with a live elapsed counter formatted in `MM:SS`.

---

## 6. DECISIONS LOG

1. **Hash Routing vs. Path Routing:** Fastify backend serves static files without SPA wildcard fallbacks (`/*` returns 404). Hash routing (`#/investigation/:id`) ensures zero breaking 404 errors on page reload across all deployment environments.
2. **Client-Side Operator Authentication:** Operator tokens are maintained strictly in React memory state and never stored in `localStorage` or `sessionStorage`, adhering strictly to Security Invariant 2.
3. **MIME Type Registration:** Fastify static server in `src/server/app.ts` was augmented with `'.woff2': 'font/woff2'` to ensure self-hosted Geist fonts load cleanly in strict CSP environments without external CDN requests.
4. **Data-TestId Selection:** Rewrote all test harnesses to rely exclusively on semantic `data-testid` attributes, eliminating brittle CSS color string selectors.
