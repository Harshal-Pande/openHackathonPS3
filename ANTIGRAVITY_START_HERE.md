# Antigravity setup: exact operator instructions

## What you are using

Use **Google Antigravity** as the only coding environment for this project. Do not generate Claude Code instructions, Claude-specific configuration, or assume another coding agent is available.

Antigravity supports workspace rules through `AGENTS.md`, `GEMINI.md`, and `.agents/rules/*.md`. This package uses the root `AGENTS.md` plus modular `.agents/rules/` files. The rules are deliberately split so the always-on instructions remain compact.

## Step 1 — Create/open the workspace

1. Extract the complete ZIP to a normal local folder, for example `C:\\Projects\\revertlens`.
2. Open Google Antigravity.
3. Create a Project and add the extracted `REVERTLENS_ANTIGRAVITY_FINAL` folder as the workspace.
4. Use Local Mode for the initial Gate 0 inspection. Do not use a disposable worktree for the only copy of wallet/keychain setup.
5. Confirm the Agent can see `AGENTS.md`, `.agents/rules/`, `docs/`, and `prompts/`.
6. Do not add `.env`, wallet files, browser profiles, or keychain exports to the project.

## Step 2 — Start the agent

1. Open a new Agent conversation for this workspace.
2. Paste the entire contents of `prompts/00_MASTER_BUILD_PROMPT.md`.
3. Let the agent inspect the repository and produce a plan.
4. It must execute only read-only discovery first.
5. If a step could sign a transaction, pay stablecoins, register an identity, publish a repository, deploy a public service, or expose data, it must stop and request explicit human approval for that exact action.

## Step 3 — Gate 0

The agent must follow `docs/03_BUY_GATE0_RUNBOOK.md`. It must:
- inspect the live Buy catalogue;
- inspect installed Buy CLI version and help;
- confirm the exact Chainstack and Cencori schemas;
- obtain quotes for exact request bodies;
- show the operator the token, human-readable amount, atomic amount, recipient, request hash and purpose;
- wait for the operator to approve;
- make only the approved paid call;
- resolve and verify settlement;
- preserve redacted evidence.

Do not tell the agent to “just make it work” by using an unapproved fallback RPC. If the paid Chainstack trace route does not work, it must record the blocker and present the explicit receipt-only fallback decision.

## Step 4 — Build

Only after Gate 0, paste the prompts in order:
- `prompts/01_IMPLEMENT_BACKEND.md`
- `prompts/02_IMPLEMENT_FRONTEND.md`
- `prompts/03_TEST_AND_HARDEN.md`
- `prompts/04_DEPLOY_AND_SUBMIT.md`

Do not paste all prompts simultaneously. Finish and verify one phase before starting the next.

## Step 5 — Human approvals

The human operator, not the coding agent, controls:
- funding the dedicated project wallet;
- approving each exact paid Buy request;
- signing ERC-8004 registration;
- creating or changing public GitHub repositories;
- deploying to a public host;
- publishing public reports or user data;
- submitting the hackathon entry.

Antigravity may prepare commands and explain their consequences. It must not execute a consequential action without explicit approval.

## Antigravity customization details

The package includes:
- `AGENTS.md`: always-on workspace instructions.
- `.agents/rules/*.md`: modular rules with valid YAML `trigger` frontmatter.
- `prompts/`: explicit, sequential task prompts.

Do not rely on legacy Antigravity Workflows. Current Antigravity documentation marks Workflows as deprecated and points toward a newer skills system. The prompts in this package are plain Markdown files and can be pasted directly into the Agent.

## If Antigravity ignores a rule

1. Stop implementation.
2. Open the relevant `.agents/rules/*.md` file in the editor.
3. Check that the file is directly inside `.agents/rules/`, not nested one folder deeper.
4. Check that YAML frontmatter begins at the first line and uses a supported trigger such as `always_on`, `glob`, `model_decision`, or `manual`.
5. Ask the agent to quote the rule it is following and identify the source file.
6. Do not proceed with paid actions until payment-safety rules are being followed.
