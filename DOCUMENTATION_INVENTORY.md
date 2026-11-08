# RevertLens — Master Documentation Inventory & Archive Move Record
**Document Version:** 1.0.0  
**Generated:** 2026-11-08  
**Governance:** Antigravity Master Audit & Documentation Cleanup  

---

## 1. Documentation Inventory Overview

In accordance with Master Audit Part 5 instructions, all Markdown (`.md`) files in the RevertLens repository have been inventoried, classified into strict taxonomical categories, and organized into an accessible documentation architecture.

To preserve complete engineering provenance without cluttering the active workspace root, historical phase reports, completed execution logs, superseded audits, and obsolete prompt files have been moved into dedicated subdirectories under `docs/archive/` using `git mv` (preserving full Git commit histories).

### Taxonomy Classification System:
1. `ACTIVE_GOVERNANCE` — Foundational project rules, agent operating standards, and decision records.
2. `CURRENT_REQUIREMENTS` — Active functional requirements, traceability matrices, and forensic criteria.
3. `CURRENT_ARCHITECTURE` — Active technical architecture, data models, and transaction flow specifications.
4. `ACTIVE_RUNBOOK` — Active runbooks, test guides, and operational checklists.
5. `CURRENT_RELEASE_DOCUMENTATION` — Active release verification evidence and submission checklists.
6. `HISTORICAL_PHASE_REPORT` — Phase-specific execution summaries from Phases 0 through 12.5.
7. `COMPLETED_EXECUTION_LOG` — Historical test execution logs and pre-redesign blocker registers.
8. `OBSOLETE_OR_SUPERSEDED` — Superseded audits, obsolete build prompts, or previous status snapshots.
9. `UNCERTAIN_REQUIRES_REVIEW` — Documents requiring review (0 files in this category).

---

## 2. Directory Structure After Cleanup

```
D:\Blockchain\BuildWithBuy\
├── AGENTS.md                          [ACTIVE_GOVERNANCE] Mandatory Antigravity workspace instructions
├── README.md                          [ACTIVE_GOVERNANCE] Primary repository README & entrypoint
├── MASTER_CHANGELOG.md                [ACTIVE_GOVERNANCE] Unified chronological engineering log
├── MASTER_DEFECT_REGISTER.md          [ACTIVE_GOVERNANCE] Complete defect register (DEF-01 to DEF-20)
├── MASTER_PROJECT_AUDIT.md            [ACTIVE_GOVERNANCE] Definitive technical & operational audit
├── MASTER_EXECUTION_ROADMAP.md        [ACTIVE_GOVERNANCE] Module-by-module execution roadmap
├── USER_ACTION_CHECKLIST.md           [ACTIVE_RUNBOOK] Exclusive checklist for human project owner
├── ANTIGRAVITY_TASK_REGISTER.md       [ACTIVE_GOVERNANCE] Exclusive register for Antigravity tasks
├── DOCUMENTATION_INVENTORY.md         [ACTIVE_GOVERNANCE] This document
├── DECISIONS.md                       [ACTIVE_GOVERNANCE] Architecture decisions register (AD-001 to AD-008)
├── GATE0_RESULTS.md                   [ACTIVE_GOVERNANCE] Buy Gate 0 preflight results
├── PROOF.md                           [ACTIVE_GOVERNANCE] Verified on-chain transactions & forensic proof
├── TEST_RESULTS.md                    [ACTIVE_GOVERNANCE] Verification & test results ledger
├── SECURITY.md                        [ACTIVE_GOVERNANCE] Project security invariants & threat model
├── SUBMISSION_CHECKLIST.md            [CURRENT_RELEASE_DOCUMENTATION] Hackathon submission checklist
├── MASTER_RELEASE_GATE.md             [CURRENT_RELEASE_DOCUMENTATION] 5-domain release gate evaluation
├── IMPLEMENTATION_STATUS.md           [CURRENT_RELEASE_DOCUMENTATION] Status of codebase components
├── DEMO_SCRIPT.md                     [ACTIVE_RUNBOOK] Step-by-step 3-minute video recording script
├── USER_TESTING_GUIDE.md              [ACTIVE_RUNBOOK] Independent user verification walkthrough
├── INDEPENDENT_USER_EVIDENCE.md       [CURRENT_RELEASE_DOCUMENTATION] Evidence from independent test runs
├── INDEPENDENT_USER_EVIDENCE_TEMPLATE.md [ACTIVE_RUNBOOK] Template for recording user testing evidence
├── BUY_PAYMENT_LIFECYCLE.md           [CURRENT_ARCHITECTURE] Buy 402 challenge & quote lifecycle specs
├── CENCORI_INTEGRATION.md             [CURRENT_ARCHITECTURE] Cencori AI inference integration guide
├── TRANSACTION_FLOW_ARCHITECTURE.md   [CURRENT_ARCHITECTURE] Full transaction forensic lifecycle
├── FORENSIC_GOLDEN_CASES.md           [CURRENT_REQUIREMENTS] Golden test cases for EVM reverts
├── MASTER_REQUIREMENTS_TRACEABILITY.md [CURRENT_REQUIREMENTS] Traceability of all product requirements
├── ERC8004_REGISTRATION_PREPARATION.md [ACTIVE_RUNBOOK] ERC-8004 registration calldata & verification
├── .agents/rules/                     [ACTIVE_GOVERNANCE] Always-on agent behavior rules
│   ├── 00-always-on-project.md
│   ├── 01-buy-payments-security.md
│   ├── 02-chain-forensics.md
│   ├── 03-frontend-ux.md
│   └── 04-testing-and-release.md
├── docs/                              [CURRENT_SPECIFICATIONS] Foundational specifications
│   ├── 01_PRODUCT_REQUIREMENTS.md
│   ├── 02_ARCHITECTURE_AND_DATA_MODEL.md
│   ├── 03_BUY_GATE0_RUNBOOK.md
│   ├── 04_SECURITY_AND_PRIVACY.md
│   ├── 05_API_CONTRACT.md
│   ├── 06_UI_UX_SPECIFICATION.md
│   ├── 07_TEST_AND_ACCEPTANCE_PLAN.md
│   ├── 08_IMPLEMENTATION_PLAN.md
│   ├── 09_HACKATHON_COMPLIANCE.md
│   ├── 10_DECISIONS_AND_NON_GOALS.md
│   ├── IMPLEMENTATION_STATUS.md
│   └── archive/                       [PRESERVED HISTORICAL ARCHIVES]
│       ├── phase-reports/             30 archived historical phase execution reports
│       ├── execution-logs/            6 archived test and runtime execution logs
│       ├── superseded-audits/         21 archived intermediate audit reports & obsolete plans
│       └── obsolete-prompts/          5 archived initial build prompts
└── templates/                         [ACTIVE_RUNBOOK] Reusable document templates
```

---

## 3. Detailed File Classification & Move Record

| # | Original Path | Classification | Current Status | New / Preserved Location | Rational / Justification |
|:---:|:---|:---|:---:|:---|:---|
| 1 | `AGENTS.md` | ACTIVE_GOVERNANCE | Preserved | `AGENTS.md` (root) | Mandatory workspace instructions. Required by workspace. |
| 2 | `README.md` | ACTIVE_GOVERNANCE | Preserved | `README.md` (root) | Primary entry point for visitors, evaluators, and judges. |
| 3 | `MASTER_CHANGELOG.md` | ACTIVE_GOVERNANCE | Preserved | `MASTER_CHANGELOG.md` (root) | Single authoritative engineering log. Mandatory invariant. |
| 4 | `MASTER_DEFECT_REGISTER.md` | ACTIVE_GOVERNANCE | Preserved | `MASTER_DEFECT_REGISTER.md` (root) | Single authoritative defect tracking ledger. |
| 5 | `MASTER_PROJECT_AUDIT.md` | ACTIVE_GOVERNANCE | Preserved | `MASTER_PROJECT_AUDIT.md` (root) | Single authoritative comprehensive master project audit. |
| 6 | `MASTER_EXECUTION_ROADMAP.md` | ACTIVE_GOVERNANCE | Created | `MASTER_EXECUTION_ROADMAP.md` (root) | Master roadmap dividing remaining work into sequential modules. |
| 7 | `USER_ACTION_CHECKLIST.md` | ACTIVE_RUNBOOK | Created | `USER_ACTION_CHECKLIST.md` (root) | Crystal-clear human owner tasks; replaces ambiguous guides. |
| 8 | `ANTIGRAVITY_TASK_REGISTER.md` | ACTIVE_GOVERNANCE | Created | `ANTIGRAVITY_TASK_REGISTER.md` (root) | Agent-owned engineering tasks with dependencies & criteria. |
| 9 | `DOCUMENTATION_INVENTORY.md` | ACTIVE_GOVERNANCE | Created | `DOCUMENTATION_INVENTORY.md` (root) | This inventory and archive record. |
| 10 | `DECISIONS.md` | ACTIVE_GOVERNANCE | Preserved | `DECISIONS.md` (root) | Architecture decision records (AD-001 through AD-008). |
| 11 | `GATE0_RESULTS.md` | ACTIVE_GOVERNANCE | Preserved | `GATE0_RESULTS.md` (root) | Buy Gate 0 preflight results ledger. |
| 12 | `PROOF.md` | ACTIVE_GOVERNANCE | Preserved | `PROOF.md` (root) | Verified on-chain transaction hashes & forensic proof. |
| 13 | `TEST_RESULTS.md` | ACTIVE_GOVERNANCE | Preserved | `TEST_RESULTS.md` (root) | Automated test execution ledger across all suites. |
| 14 | `SECURITY.md` | ACTIVE_GOVERNANCE | Preserved | `SECURITY.md` (root) | Core security policies, key invariants, and threat models. |
| 15 | `SUBMISSION_CHECKLIST.md` | CURRENT_RELEASE_DOCUMENTATION | Preserved | `SUBMISSION_CHECKLIST.md` (root) | Hackathon submission requirements tracking. |
| 16 | `MASTER_RELEASE_GATE.md` | CURRENT_RELEASE_DOCUMENTATION | Preserved | `MASTER_RELEASE_GATE.md` (root) | Multi-gate release readiness evaluation. |
| 17 | `IMPLEMENTATION_STATUS.md` | CURRENT_RELEASE_DOCUMENTATION | Preserved | `IMPLEMENTATION_STATUS.md` (root) | Real-time status of backend, frontend, and providers. |
| 18 | `DEMO_SCRIPT.md` | ACTIVE_RUNBOOK | Preserved | `DEMO_SCRIPT.md` (root) | Exact 3-minute video presentation guide. |
| 19 | `USER_TESTING_GUIDE.md` | ACTIVE_RUNBOOK | Preserved | `USER_TESTING_GUIDE.md` (root) | User testing walkthrough for non-technical evaluator. |
| 20 | `INDEPENDENT_USER_EVIDENCE.md` | CURRENT_RELEASE_DOCUMENTATION | Preserved | `INDEPENDENT_USER_EVIDENCE.md` (root) | Record of manual independent user tests. |
| 21 | `INDEPENDENT_USER_EVIDENCE_TEMPLATE.md` | ACTIVE_RUNBOOK | Preserved | `INDEPENDENT_USER_EVIDENCE_TEMPLATE.md` (root) | Template for additional user testing rounds. |
| 22 | `BUY_PAYMENT_LIFECYCLE.md` | CURRENT_ARCHITECTURE | Preserved | `BUY_PAYMENT_LIFECYCLE.md` (root) | Detailed technical flow of Buy x402 challenge & quote. |
| 23 | `CENCORI_INTEGRATION.md` | CURRENT_ARCHITECTURE | Preserved | `CENCORI_INTEGRATION.md` (root) | Technical details of Cencori LLM integration. |
| 24 | `TRANSACTION_FLOW_ARCHITECTURE.md` | CURRENT_ARCHITECTURE | Preserved | `TRANSACTION_FLOW_ARCHITECTURE.md` (root) | Trace parser, classifier, and evidence ledger data flow. |
| 25 | `FORENSIC_GOLDEN_CASES.md` | CURRENT_REQUIREMENTS | Preserved | `FORENSIC_GOLDEN_CASES.md` (root) | Catalog of golden test cases for EVM revert scenarios. |
| 26 | `MASTER_REQUIREMENTS_TRACEABILITY.md` | CURRENT_REQUIREMENTS | Preserved | `MASTER_REQUIREMENTS_TRACEABILITY.md` (root) | Matrix mapping PRD requirements to source files & tests. |
| 27 | `ERC8004_REGISTRATION_PREPARATION.md` | ACTIVE_RUNBOOK | Preserved | `ERC8004_REGISTRATION_PREPARATION.md` (root) | Step-by-step calldata generation and registration guide. |
| 28 | `AGENT_TASKS_COMPLETED.md` | COMPLETED_EXECUTION_LOG | Moved | `docs/archive/execution-logs/AGENT_TASKS_COMPLETED.md` | Historical task completion log from early phase. |
| 29 | `BROWSER_E2E_RESULTS.md` | COMPLETED_EXECUTION_LOG | Moved | `docs/archive/execution-logs/BROWSER_E2E_RESULTS.md` | CDP browser automation output from Phase 10. |
| 30 | `DOCKER_VALIDATION_RESULTS.md` | COMPLETED_EXECUTION_LOG | Moved | `docs/archive/execution-logs/DOCKER_VALIDATION_RESULTS.md` | Historical Docker build and static validation record. |
| 31 | `MASTER_FINAL_VERIFICATION_RESULTS.md` | COMPLETED_EXECUTION_LOG | Moved | `docs/archive/execution-logs/MASTER_FINAL_VERIFICATION_RESULTS.md` | Test output snapshot from Phase 11.5. |
| 32 | `PRE_SUBMISSION_BLOCKER_REGISTER.md` | COMPLETED_EXECUTION_LOG | Moved | `docs/archive/execution-logs/PRE_SUBMISSION_BLOCKER_REGISTER.md` | Historical blocker log resolved during Phase 10. |
| 33 | `PRODUCTION_RUNTIME_RESULTS.md` | COMPLETED_EXECUTION_LOG | Moved | `docs/archive/execution-logs/PRODUCTION_RUNTIME_RESULTS.md` | Fastify production runtime verification log. |
| 34 | `AGENT_WALLET_AUDIT.md` | HISTORICAL_PHASE_REPORT | Moved | `docs/archive/phase-reports/AGENT_WALLET_AUDIT.md` | Specific audit of agent wallet address from Phase 11. |
| 35 | `ATTRIBUTION_INTEGRATION_AUDIT.md` | HISTORICAL_PHASE_REPORT | Moved | `docs/archive/phase-reports/ATTRIBUTION_INTEGRATION_AUDIT.md` | Specific audit of attribution tag from Phase 11. |
| 36 | `BUY_LIVE_EXECUTION_READINESS.md` | HISTORICAL_PHASE_REPORT | Moved | `docs/archive/phase-reports/BUY_LIVE_EXECUTION_READINESS.md` | Buy readiness report prior to Phase 12 redesign. |
| 37 | `BUY_PAYMENT_READINESS.md` | HISTORICAL_PHASE_REPORT | Moved | `docs/archive/phase-reports/BUY_PAYMENT_READINESS.md` | Early Buy payment readiness evaluation. |
| 38 | `DEPLOYMENT_READINESS.md` | HISTORICAL_PHASE_REPORT | Moved | `docs/archive/phase-reports/DEPLOYMENT_READINESS.md` | Historical deployment assessment from Phase 9. |
| 39 | `GATE0_APPROVAL_REQUEST.md` | HISTORICAL_PHASE_REPORT | Moved | `docs/archive/phase-reports/GATE0_APPROVAL_REQUEST.md` | Human approval request for Gate 0 from Phase 1. |
| 40 | `GATE0_PREFLIGHT.md` | HISTORICAL_PHASE_REPORT | Moved | `docs/archive/phase-reports/GATE0_PREFLIGHT.md` | Preflight inspection notes for Gate 0. |
| 41 | `GIT_RELEASE_REVIEW.md` | HISTORICAL_PHASE_REPORT | Moved | `docs/archive/phase-reports/GIT_RELEASE_REVIEW.md` | Git cleanliness and staging review from RC1. |
| 42 | `PHASE_5_6_RESULTS.md` | HISTORICAL_PHASE_REPORT | Moved | `docs/archive/phase-reports/PHASE_5_6_RESULTS.md` | Phase 5 and 6 execution results. |
| 43 | `PHASE_6_RESULTS.md` | HISTORICAL_PHASE_REPORT | Moved | `docs/archive/phase-reports/PHASE_6_RESULTS.md` | Phase 6 execution results. |
| 44 | `PHASE_7_RESULTS.md` | HISTORICAL_PHASE_REPORT | Moved | `docs/archive/phase-reports/PHASE_7_RESULTS.md` | Phase 7 execution results. |
| 45 | `PHASE_8_INITIAL_AUDIT.md` | HISTORICAL_PHASE_REPORT | Moved | `docs/archive/phase-reports/PHASE_8_INITIAL_AUDIT.md` | Phase 8 security spike report. |
| 46 | `PHASE_8_SECURITY_REVIEW.md` | HISTORICAL_PHASE_REPORT | Moved | `docs/archive/phase-reports/PHASE_8_SECURITY_REVIEW.md` | Phase 8 security audit findings. |
| 47 | `PHASE_9_DEMO_READINESS.md` | HISTORICAL_PHASE_REPORT | Moved | `docs/archive/phase-reports/PHASE_9_DEMO_READINESS.md` | Phase 9 demo readiness report. |
| 48 | `PHASE_9_DEPLOYMENT_CHECKLIST.md` | HISTORICAL_PHASE_REPORT | Moved | `docs/archive/phase-reports/PHASE_9_DEPLOYMENT_CHECKLIST.md` | Phase 9 deployment checklist. |
| 49 | `PHASE_9_DOCKER_RUNTIME_RESULTS.md` | HISTORICAL_PHASE_REPORT | Moved | `docs/archive/phase-reports/PHASE_9_DOCKER_RUNTIME_RESULTS.md` | Phase 9 Docker container execution results. |
| 50 | `PHASE_9_FILE_MANIFEST.md` | HISTORICAL_PHASE_REPORT | Moved | `docs/archive/phase-reports/PHASE_9_FILE_MANIFEST.md` | Phase 9 repository file manifest. |
| 51 | `PHASE_9_HACKATHON_REQUIREMENTS.md` | HISTORICAL_PHASE_REPORT | Moved | `docs/archive/phase-reports/PHASE_9_HACKATHON_REQUIREMENTS.md` | Phase 9 hackathon compliance review. |
| 52 | `PHASE_9_HUMAN_APPROVAL_REQUEST.md` | HISTORICAL_PHASE_REPORT | Moved | `docs/archive/phase-reports/PHASE_9_HUMAN_APPROVAL_REQUEST.md` | Phase 9 operator approval request. |
| 53 | `PHASE_9_RELEASE_AUDIT.md` | HISTORICAL_PHASE_REPORT | Moved | `docs/archive/phase-reports/PHASE_9_RELEASE_AUDIT.md` | Phase 9 release gate evaluation. |
| 54 | `PHASE_9_SECURITY_AND_CLAIMS_REVIEW.md` | HISTORICAL_PHASE_REPORT | Moved | `docs/archive/phase-reports/PHASE_9_SECURITY_AND_CLAIMS_REVIEW.md` | Phase 9 claims audit against evidence. |
| 55 | `PHASE_9_VERIFICATION_RESULTS.md` | HISTORICAL_PHASE_REPORT | Moved | `docs/archive/phase-reports/PHASE_9_VERIFICATION_RESULTS.md` | Phase 9 test run output. |
| 56 | `PHASE_10_ROOT_CAUSE_AND_SUBMISSION_READINESS.md` | HISTORICAL_PHASE_REPORT | Moved | `docs/archive/phase-reports/PHASE_10_ROOT_CAUSE_AND_SUBMISSION_READINESS.md` | Comprehensive Phase 10 stabilization report. |
| 57 | `PHASE_11_EXECUTION_REPORT.md` | HISTORICAL_PHASE_REPORT | Moved | `docs/archive/phase-reports/PHASE_11_EXECUTION_REPORT.md` | Phase 11 attribution tag integration report. |
| 58 | `PHASE_11_5_VERIFICATION_REPORT.md` | HISTORICAL_PHASE_REPORT | Moved | `docs/archive/phase-reports/PHASE_11_5_VERIFICATION_REPORT.md` | Phase 11.5 ERC-8004 prep & test verification report. |
| 59 | `RELEASE_CANDIDATE_STATUS.md` | HISTORICAL_PHASE_REPORT | Moved | `docs/archive/phase-reports/RELEASE_CANDIDATE_STATUS.md` | v0.1.0-rc1 status document. |
| 60 | `RELEASE_NOTES_RC1.md` | HISTORICAL_PHASE_REPORT | Moved | `docs/archive/phase-reports/RELEASE_NOTES_RC1.md` | v0.1.0-rc1 release notes. |
| 61 | `UI_REDESIGN_PLAN.md` | HISTORICAL_PHASE_REPORT | Moved | `docs/archive/phase-reports/UI_REDESIGN_PLAN.md` | Phase 12 UI redesign architectural plan. |
| 62 | `UI_REDESIGN_VERIFICATION.md` | HISTORICAL_PHASE_REPORT | Moved | `docs/archive/phase-reports/UI_REDESIGN_VERIFICATION.md` | Phase 12 UI redesign verification report. |
| 63 | `ZERO_COST_FUNDING_RESEARCH.md` | HISTORICAL_PHASE_REPORT | Moved | `docs/archive/phase-reports/ZERO_COST_FUNDING_RESEARCH.md` | Research on zero-cost faucet & sponsored funding on Celo. |
| 64 | `INDEPENDENT_AUDIT_AND_FULL_PROJECT_REPORT.md` | OBSOLETE_OR_SUPERSEDED | Moved | `docs/archive/superseded-audits/INDEPENDENT_AUDIT_AND_FULL_PROJECT_REPORT.md` | Superseded by `MASTER_PROJECT_AUDIT.md`. |
| 65 | `MASTER_AI_CENCORI_AUDIT.md` | OBSOLETE_OR_SUPERSEDED | Moved | `docs/archive/superseded-audits/MASTER_AI_CENCORI_AUDIT.md` | Consolidated into `MASTER_PROJECT_AUDIT.md`. |
| 66 | `MASTER_ARCHITECTURE_AUDIT.md` | OBSOLETE_OR_SUPERSEDED | Moved | `docs/archive/superseded-audits/MASTER_ARCHITECTURE_AUDIT.md` | Consolidated into `MASTER_PROJECT_AUDIT.md`. |
| 67 | `MASTER_BACKEND_AUDIT.md` | OBSOLETE_OR_SUPERSEDED | Moved | `docs/archive/superseded-audits/MASTER_BACKEND_AUDIT.md` | Consolidated into `MASTER_PROJECT_AUDIT.md`. |
| 68 | `MASTER_BLOCKCHAIN_INTEGRATION_AUDIT.md` | OBSOLETE_OR_SUPERSEDED | Moved | `docs/archive/superseded-audits/MASTER_BLOCKCHAIN_INTEGRATION_AUDIT.md` | Consolidated into `MASTER_PROJECT_AUDIT.md`. |
| 69 | `MASTER_BUY_PAYMENT_AUDIT.md` | OBSOLETE_OR_SUPERSEDED | Moved | `docs/archive/superseded-audits/MASTER_BUY_PAYMENT_AUDIT.md` | Consolidated into `MASTER_PROJECT_AUDIT.md`. |
| 70 | `MASTER_DATABASE_AUDIT.md` | OBSOLETE_OR_SUPERSEDED | Moved | `docs/archive/superseded-audits/MASTER_DATABASE_AUDIT.md` | Consolidated into `MASTER_PROJECT_AUDIT.md`. |
| 71 | `MASTER_DEPLOYMENT_AUDIT.md` | OBSOLETE_OR_SUPERSEDED | Moved | `docs/archive/superseded-audits/MASTER_DEPLOYMENT_AUDIT.md` | Consolidated into `MASTER_PROJECT_AUDIT.md`. |
| 72 | `MASTER_DOCUMENTATION_AUDIT.md` | OBSOLETE_OR_SUPERSEDED | Moved | `docs/archive/superseded-audits/MASTER_DOCUMENTATION_AUDIT.md` | Consolidated into `MASTER_PROJECT_AUDIT.md`. |
| 73 | `MASTER_EVIDENCE_RECONCILIATION.md` | OBSOLETE_OR_SUPERSEDED | Moved | `docs/archive/superseded-audits/MASTER_EVIDENCE_RECONCILIATION.md` | Consolidated into `MASTER_PROJECT_AUDIT.md`. |
| 74 | `MASTER_FORENSIC_ENGINE_AUDIT.md` | OBSOLETE_OR_SUPERSEDED | Moved | `docs/archive/superseded-audits/MASTER_FORENSIC_ENGINE_AUDIT.md` | Consolidated into `MASTER_PROJECT_AUDIT.md`. |
| 75 | `MASTER_FRONTEND_UX_AUDIT.md` | OBSOLETE_OR_SUPERSEDED | Moved | `docs/archive/superseded-audits/MASTER_FRONTEND_UX_AUDIT.md` | Consolidated into `MASTER_PROJECT_AUDIT.md`. |
| 76 | `MASTER_HACKATHON_READINESS_AUDIT.md` | OBSOLETE_OR_SUPERSEDED | Moved | `docs/archive/superseded-audits/MASTER_HACKATHON_READINESS_AUDIT.md` | Consolidated into `MASTER_PROJECT_AUDIT.md`. |
| 77 | `MASTER_SECURITY_AUDIT.md` | OBSOLETE_OR_SUPERSEDED | Moved | `docs/archive/superseded-audits/MASTER_SECURITY_AUDIT.md` | Consolidated into `MASTER_PROJECT_AUDIT.md`. |
| 78 | `MASTER_TEST_COVERAGE_AUDIT.md` | OBSOLETE_OR_SUPERSEDED | Moved | `docs/archive/superseded-audits/MASTER_TEST_COVERAGE_AUDIT.md` | Consolidated into `MASTER_PROJECT_AUDIT.md`. |
| 79 | `POST_REDESIGN_AUDIT.md` | OBSOLETE_OR_SUPERSEDED | Moved | `docs/archive/superseded-audits/POST_REDESIGN_AUDIT.md` | Consolidated into `MASTER_PROJECT_AUDIT.md`. |
| 80 | `PROJECT_ROADMAP.md` | OBSOLETE_OR_SUPERSEDED | Moved | `docs/archive/superseded-audits/PROJECT_ROADMAP.md` | Superseded by `MASTER_EXECUTION_ROADMAP.md`. |
| 81 | `PROJECT_STATUS.md` | OBSOLETE_OR_SUPERSEDED | Moved | `docs/archive/superseded-audits/PROJECT_STATUS.md` | Consolidated into `MASTER_PROJECT_AUDIT.md`. |
| 82 | `UI_CURRENT_STATE_AUDIT.md` | OBSOLETE_OR_SUPERSEDED | Moved | `docs/archive/superseded-audits/UI_CURRENT_STATE_AUDIT.md` | Pre-redesign audit; superseded. |
| 83 | `UI_REFERENCE_AUDIT.md` | OBSOLETE_OR_SUPERSEDED | Moved | `docs/archive/superseded-audits/UI_REFERENCE_AUDIT.md` | Pre-redesign audit; superseded. |
| 84 | `HUMAN_ACTIONS_REQUIRED.md` | OBSOLETE_OR_SUPERSEDED | Moved | `docs/archive/superseded-audits/HUMAN_ACTIONS_REQUIRED.md` | Superseded by `USER_ACTION_CHECKLIST.md`. |
| 85 | `prompts/00_MASTER_BUILD_PROMPT.md` | OBSOLETE_OR_SUPERSEDED | Moved | `docs/archive/obsolete-prompts/00_MASTER_BUILD_PROMPT.md` | Initial orchestration prompt; superseded. |
| 86 | `prompts/01_IMPLEMENT_BACKEND.md` | OBSOLETE_OR_SUPERSEDED | Moved | `docs/archive/obsolete-prompts/01_IMPLEMENT_BACKEND.md` | Initial backend build prompt; superseded. |
| 87 | `prompts/02_IMPLEMENT_FRONTEND.md` | OBSOLETE_OR_SUPERSEDED | Moved | `docs/archive/obsolete-prompts/02_IMPLEMENT_FRONTEND.md` | Initial frontend build prompt; superseded. |
| 88 | `prompts/03_TEST_AND_HARDEN.md` | OBSOLETE_OR_SUPERSEDED | Moved | `docs/archive/obsolete-prompts/03_TEST_AND_HARDEN.md` | Initial hardening prompt; superseded. |
| 89 | `prompts/04_DEPLOY_AND_SUBMIT.md` | OBSOLETE_OR_SUPERSEDED | Moved | `docs/archive/obsolete-prompts/04_DEPLOY_AND_SUBMIT.md` | Initial deployment prompt; superseded. |
| 90-94 | `.agents/rules/*.md` (5 files) | ACTIVE_GOVERNANCE | Preserved | `.agents/rules/*.md` | Always-on workspace rules (project, buy, forensics, ux, testing). |
| 95-105 | `docs/*.md` (11 files) | CURRENT_REQUIREMENTS / ARCHITECTURE | Preserved | `docs/*.md` | Original foundational specifications (01 to 10 + implementation status). |
| 106-110 | `templates/*.md` (5 files) | ACTIVE_RUNBOOK | Preserved | `templates/*.md` | Reusable runbook and results templates. |

---

## 4. Preservation Invariants

1. **Zero Data Loss:** All 62 historical and intermediate markdown documents have been preserved byte-for-byte in `docs/archive/`.
2. **Git Commit History Maintained:** File moves were executed using `git mv` so all line annotations and commit provenance remain traceable.
3. **No Overwrite of Authoritative Logs:** `MASTER_CHANGELOG.md` is preserved and extended; historical changelog entries from Phases 0 through 12.5 are untouched.
4. **Active Workspace Cleanliness:** The root directory now contains only active, authoritative governance files, active runbooks, and current release deliverables.
