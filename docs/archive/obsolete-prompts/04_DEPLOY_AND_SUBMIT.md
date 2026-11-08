# PHASE 4 PROMPT — DEPLOYMENT AND HACKATHON SUBMISSION

This phase contains externally visible and potentially irreversible actions. Prepare everything first. Stop for human approval before publishing, deploying, signing, registering, or submitting.

## 1. Pre-deployment audit

Confirm:
- all required tests pass;
- Gate 0 evidence exists;
- secrets are absent from Git;
- production operator authentication is configured;
- production Buy wallet access is tested safely;
- budget limits and kill switch are enabled;
- public reports are sanitized and unlisted;
- CORS, cookies and HTTPS settings are production-ready;
- database backup and migration strategy are documented;
- health endpoint does not leak secrets.

## 2. Deployment plan

Prepare:
- chosen host and reason;
- environment variable names only;
- build command;
- start command;
- health check;
- persistent SQLite storage plan;
- Buy CLI/keychain compatibility proof;
- restart behaviour;
- rollback steps;
- monthly/usage cost estimate from current provider terms.

Do not assume a serverless host can access the Buy OS keychain. Do not deploy the signing wallet or private key as an environment variable.

## 3. Human approval

Show the operator the exact:
- repository and branch to publish;
- files included;
- host/project to deploy;
- domain/URL;
- environment secret names required;
- wallet address (public address only);
- expected external cost;
- rollback limitations.

Wait for explicit approval before action.

## 4. Post-deploy tests

After approval and deployment:
- open the production URL in a fresh browser session;
- test health endpoint;
- test invalid hash;
- test one safe read-only flow;
- test operator login;
- verify no secrets appear in frontend bundle or network responses;
- verify Buy adapter health without making a paid call;
- perform a paid production smoke test only after separate exact spend approval;
- save deployment evidence and timestamps.

## 5. Submission evidence

Update:
- `README.md`;
- `ARCHITECTURE.md`;
- `SECURITY.md`;
- `TEST_RESULTS.md`;
- `GATE0_RESULTS.md`;
- `PROOF.md`;
- `DECISIONS.md`;
- `DEMO_SCRIPT.md`;
- `SUBMISSION_CHECKLIST.md`.

Only include verified hashes, agent IDs, user counts, quotes and screenshots. Label internal, subsidized, independent and unverified user activity separately.

## 6. Final report

Report exactly what is live, what is local, what is mocked and what remains untested. If a competition qualifier was not met, say so.
