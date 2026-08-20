# trivia-bot-org — the daemon

The operating company: stateless OpenAI agents that run Trivia Bot's brain
against the shared Supabase database, exactly through the contract in the
product PRD §9. No agent ever touches the product's UI.

- **Doctrine** lives in [`trivia-bot-brain`](https://github.com/jameso107/trivia-bot-brain)
  (cloned as a sibling directory — `BRAIN_PATH`). Every run re-reads it.
- **State** lives in Supabase (`tasks`, `runs`, `events`, `approvals`,
  `ledger`, `kpis_daily`, …). A run's legacy is only what it writes back.
- **Product** is [`trivia-bot-app`](https://github.com/jameso107/trivia-bot-app);
  the daemon reads its tables observationally and writes only where §9 allows
  (packs to `qa_pending`, QA promotions, dispute rulings, feedback triage).

## Run it

```bash
npm install
cp .env.example .env   # fill keys
npm run dryrun         # the §9 handoff dry-run (safe: writes → outbox/)
npm run once -- ceo    # one agent turn (dry by default)
npm run daemon         # the scheduled heartbeat (see cadences below)
npm run seed:signup    # create a REAL venue signup via the app's own RPC
```

## Modes

- `ORG_MODE=dry` — reads are real; every write/email is recorded to
  `outbox/*.json` as a would-do instead of executing. Runs and spend still log
  to `runs`/`ledger` (bookkeeping is the org's own evidence).
- `ORG_MODE=live` — writes execute. **Email still outboxes** (no mail
  credentials exist in Phase A; the CEO's brief is a file you read).

## Guardrails (enforced in code, per `company/policies.md`)

- **Budgets**: `DAILY_BUDGET_USD` checked before every run; `MAX_RUN_USD`
  meters mid-run and forces a wrap-up. Every run writes a ledger row.
- **Tool allowlists per role** — venue-search can't touch packs; only
  trivia-qa holds `set_pack_status`, and the live-promotion bar
  (confidence ≥0.9, zero flags) is enforced mechanically, not by prompt.
- **Gated actions** become `approvals` rows + outbox records, never actions.
- **KILL SWITCH**: the daemon is one process — stop it and the org stops.

## The full 28-card roster

All 28 registry roles are defined and runnable (`npm run once -- <role>`); the
scheduler activates only roles whose phase ≤ `ORG_PHASE` — hiring is a config
change. Current default: **Phase A** (8 scheduled).

| Phase | Agents | Cadence highlights |
|---|---|---|
| **A** (boot) | ceo · auditor · trivia-ops-director · marketing-director · venue-search · venue-success · trivia-creation · trivia-qa | ceo 07:00 · signup-watch hourly · content pipeline 02:00/03:00 · auditor Sun 18:00 |
| **B** (harden) | chief-of-staff · analyst · cx-director · user-support · venue-outreach · social-media · dev-maintenance · bizops-director · finance · contracts · data-steward | analyst 06:30 · CoS 07:30+13:00 · support hourly · finance 17:00 |
| **C** (scale) | user-growth · ads-recruit · ads-outreach · ads-support · ad-sales · ads-implementation · website-content | weekly motions |

Code-enforced beyond prompts: outreach is **triple-locked** (`ORG_MODE=live` +
`OUTREACH_ENABLED=true` + an approved canary row) with suppression, the 25/day
ramp cap, and CAN-SPAM checks evaluated per send; sponsors can't self-advance
past `proposal` (signatures are the owner's alone); contracts/social/SEO
output as outbox drafts until channels exist.

**Deviation from the blueprint, on purpose** (decision D-007 in the brain):
Phase A runs as this standalone daemon (owner-directed) rather than Cowork
scheduled tasks, and `dev-features`/`qa-tester` remain with the owner's
Claude Code builder pod — the daemon operates the company, not the codebase.
Dev needs become task rows (`dept=trivia-ops, agent=dev-features`) that the
builder pod picks up.

## The §9 handoff dry-run

```bash
npm run seed:signup   # a real signup lands a real events row (prod)
npm run dryrun        # CX consumes it; CEO snapshots KPIs + drafts the brief;
                      # QA works its queues — all side effects in outbox/
```

Pass criteria: the CX run identifies the signup event and produces onboarding
would-dos; the CEO's `compute_kpis` numbers match the product's analytics; all
three runs land `runs` + `ledger` rows; nothing outside the outbox changed.
