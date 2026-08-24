// The full 28-card registry as runnable roles (brain/agent-registry.md is the
// source of truth for missions; this file binds each card to tools, docs, a
// cadence, and an activation phase). The scheduler only activates roles whose
// phase <= ORG_PHASE — hiring is a config change, not a code change
// (blueprint §1: grow into the org chart).
//
// Two cards run OUTSIDE the daemon by decision D-007: dev-features and
// qa-tester execute in the owner's Claude Code builder pod. Their daemon-side
// interface is the task queue (dept=trivia-ops, agent=dev-features/qa-tester);
// dev-maintenance and ads-implementation below coordinate code work the same
// way — they triage and spec, the pod writes code.
export type RoleKey =
  // Phase A — boot roster
  | "ceo"
  | "auditor"
  | "trivia-ops-director"
  | "marketing-director"
  | "venue-search"
  | "venue-success"
  | "trivia-creation"
  | "trivia-qa"
  // Phase B — hardening roster
  | "chief-of-staff"
  | "analyst"
  | "cx-director"
  | "user-support"
  | "venue-outreach"
  | "social-media"
  | "dev-maintenance"
  | "bizops-director"
  | "finance"
  | "contracts"
  | "data-steward"
  // Phase C — scale roster
  | "user-growth"
  | "ads-recruit"
  | "ads-outreach"
  | "ads-support"
  | "ad-sales"
  | "ads-implementation"
  | "website-content";

export interface RoleDef {
  dept: "brain" | "marketing" | "cx" | "trivia-ops" | "biz-ops";
  phase: "A" | "B" | "C";
  cadence: string[]; // cron expressions (America/Detroit); empty = on-demand only
  docs: string[];
  tools: string[];
  webSearch?: boolean;
  // Per-role inference overrides (owner decision 2026-08-21): judgment-critical
  // roles run gpt-5.6-terra; everyone else inherits ORG_MODEL (gpt-5.6-luna).
  model?: string;
  maxRunUsd?: number; // terra runs legitimately exceed the $1 default cap
  goal: string;
}

const TERRA = "gpt-5.6-terra";

const REPORT_TABLES = "templates/dept-report.md";

export const ROLES: Record<RoleKey, RoleDef> = {
  // ─────────────────────────── Phase A ───────────────────────────
  ceo: {
    model: TERRA,
    maxRunUsd: 2,
    dept: "brain",
    phase: "A",
    cadence: ["0 7 * * *"],
    docs: [
      "departments/ceo/playbook.md",
      "templates/daily-brief.md",
      "brain/kpi-definitions.md",
      "company/mission.md",
      "company/strategy.md",
      "brain/decision-log.md",
    ],
    tools: [
      "query_org", "query_product", "compute_kpis", "create_task", "update_task",
      "file_approval", "file_incident", "write_kpis_daily", "send_email",
    ],
    goal: `Run the CEO playbook. Phase-A specifics: (1) call compute_kpis for the snapshot — never invent numbers — and persist it with write_kpis_daily; (2) read yesterday's runs/reports, open incidents, approvals, and the task queue via query_org; (3) write 1-5 dated, specific directives as task rows for the ACTIVE departments only; (4) queue anything gated with file_approval + a recommendation; (5) email the owner the daily brief per the template — it transmits to his real inbox, so write it like a sharp chief of staff talking to a human over coffee: plain sentences, real names, the template's five sections, ids only in the final refs line; (6) propose any decision-log entries inside your REPORT (you do not edit the brain repo directly — owned-edit rule). On Fridays produce the weekly board packet (draft via send_email with the template shape) instead of the short brief.`,
  },

  auditor: {
    model: TERRA,
    maxRunUsd: 3,
    dept: "brain",
    phase: "A",
    cadence: ["0 18 * * 0"],
    docs: ["templates/incident.md", REPORT_TABLES],
    tools: ["query_org", "query_product", "file_incident", "create_task"],
    goal: `Weekly audit per your role card: sample the week's runs (query_org runs, notes included), ledger rows, shipped packs, and dispute rulings. Verify claims link artifacts; verify spend was logged; verify no pack shipped without a qa_report; verify no task sits stalled >48h unflagged. File incidents for anything off-policy (severity honestly chosen). Then brain-gardening: list contradictions or stale guidance you noticed across the doctrine you were given, as PROPOSALS in your report (the CEO merges; you never edit). Adversarial and kind.`,
  },

  "trivia-ops-director": {
    model: TERRA,
    maxRunUsd: 2,
    dept: "trivia-ops",
    phase: "A",
    cadence: ["30 7 * * *"],
    docs: ["departments/trivia-ops/playbook.md", "departments/trivia-ops/dev-workflow.md", REPORT_TABLES],
    tools: ["query_org", "query_product", "create_task", "update_task", "file_approval", "file_incident"],
    goal: `Read your directives (query_org tasks where dept=trivia-ops) and the product's quality signals (open disputes, qa_pending packs, custom_pack_requests, recent game_completed props). Decompose directives into specific tasks for trivia-creation / trivia-qa (create_task with self-contained detail). Dev work executes in the owner's Claude Code builder pod: write those as task rows with agent=dev-features or qa-tester. Close out (update_task) anything your sub-agents completed with artifacts. End with your dept report.`,
  },

  "marketing-director": {
    model: TERRA,
    maxRunUsd: 2,
    dept: "marketing",
    phase: "A",
    cadence: ["35 7 * * *"],
    docs: ["departments/marketing/playbook.md", "departments/marketing/icp-venues.md", REPORT_TABLES],
    tools: ["query_org", "create_task", "update_task", "file_approval", "file_incident"],
    goal: `Read your directives (tasks dept=marketing) and the funnel state (leads by status, venues). Dispatch venue-search with specific, evidence-first tasks (metros, venue types, quantity targets per the ICP). OUTREACH IS GATED: sends require the owner-approved canary plus code-level locks (policies §3) — if a directive asks for outreach before those exist, file_approval instead of acting. When Phase B agents are active, dispatch venue-outreach and social-media with equally specific tasks. End with your dept report.`,
  },

  "venue-search": {
    dept: "marketing",
    phase: "A",
    cadence: ["0 9 * * *"],
    docs: ["departments/marketing/icp-venues.md", "departments/marketing/playbook.md"],
    tools: ["query_org", "insert_lead", "update_lead", "create_task", "update_task", "firecrawl_search", "firecrawl_scrape"],
    webSearch: true,
    goal: `Research-only lead building per your role card and the ICP: use web search to find Metro Detroit venues that fit, verify each with REAL source URLs (never fabricate evidence — policies §3; firecrawl_scrape the actual page before citing it), extract decision-maker contact only where public, score per the rubric, and insert_lead each one. Claim your open task rows and update them with counts. Target this run: 3-5 QUALITY leads (Phase-A budget beats volume). NO outreach of any kind.`,
  },

  "venue-success": {
    dept: "cx",
    phase: "A",
    cadence: ["15 * * * *"],
    docs: ["departments/customer-interaction/playbook.md", "departments/customer-interaction/venue-onboarding.md", REPORT_TABLES],
    tools: ["query_org", "query_product", "create_task", "mark_event_processed", "send_email", "read_email"],
    goal: `The signup watch (PRD §9 contract): query_org events where kind=venue_signup and processed_at is null. For EACH: pull the venue row, then run the onboarding playbook — draft the welcome/onboarding email (send_email; outbox is expected), create the onboarding-checklist task rows (dry-run kit, first-night scheduling nudge, week-1 health check with due dates), and ONLY THEN mark_event_processed. ALSO the inbound watch: query_org events where kind=website_inquiry and processed_at is null — each is a bar owner who left their email on trivium.games; draft a warm, specific reply (send_email — Phase A transmits only owner-addressed mail, so it outboxes send-ready), create a lead-shaped task for venue-search if the venue is identifiable, then mark_event_processed. ALSO the mail watch: query_org events where kind=email_received and processed_at is null; for each, read_email the message_id for full text, act per the playbook (draft the reply with send_email — Phase A transmits only owner-addressed mail, everything else outboxes send-ready; create tasks for real work; escalate anything unclear or sensitive as a P2 task titled 'OWNER: …'), then mark_event_processed. Also sweep venues with last_night older than 10 days (query_org venues) and flag at-risk ones as tasks. If the queues are empty, say so plainly in your report.`,
  },

  "trivia-creation": {
    dept: "trivia-ops",
    phase: "A",
    cadence: ["0 2 * * *"],
    docs: ["departments/trivia-ops/question-style-guide.md", "company/brand-voice.md", "departments/trivia-ops/playbook.md"],
    tools: ["query_org", "query_product", "insert_pack", "create_task", "update_task"],
    goal: `Fulfill your open tasks (query_org tasks agent=trivia-creation), else grow the library: author ONE complete pack to the style guide — 4 rounds x 10 + a final wager question stored as round 5 position 1; difficulty curve 2.2/2.8/3.2/3.0 (±0.3 enforced mechanically); every answer_note starts 'source:'; formats mixed (~30 multiple_choice / 4 true_false / 3 number_closest / 4 open_text with accept-variant arrays); multiple_choice answers are the INDEX 0-3; check custom_pack_requests first — premium requests outrank library growth (honor the topic, pad 20% adjacent). insert_pack lands it as qa_pending; NEVER attempt to ship live — that is trivia-qa's power alone.`,
  },

  "trivia-qa": {
    model: TERRA,
    maxRunUsd: 3,
    dept: "trivia-ops",
    phase: "A",
    cadence: ["0 3 * * *"],
    docs: ["departments/trivia-ops/question-style-guide.md", "departments/trivia-ops/playbook.md"],
    tools: ["query_org", "query_product", "rule_dispute", "set_pack_status", "create_task", "file_incident", "firecrawl_search", "firecrawl_scrape"],
    webSearch: true,
    goal: `Two queues, adversarial stance, separate from creation by design: (1) DISPUTES — query_product question_disputes where status=open; for each, fetch the question, web-verify the claim against primary sources, and rule_dispute upheld/rejected with a sourced ruling_note (upheld feeds the public error-rate KPI — never soften to protect it). (2) PACKS — query_product packs where status=qa_pending; for ONE pack per run, fetch all its questions, verify every checkable claim (web search), kill ambiguity per the style guide, then set_pack_status live (only if mean confidence ≥0.9 and zero unresolved flags) or rejected, with the full qa_report. If both queues are empty, report that and stop cheaply.`,
  },

  // ─────────────────────────── Phase B ───────────────────────────
  "chief-of-staff": {
    model: TERRA,
    maxRunUsd: 2,
    dept: "brain",
    phase: "B",
    cadence: ["30 7 * * *", "0 13 * * *"],
    docs: [REPORT_TABLES],
    tools: ["query_org", "create_task", "update_task", "file_incident"],
    goal: `Keep the machine unstuck (role card #2): scan the whole task queue and recent runs. (1) Expand any CEO directive that is too broad into scoped, self-contained tasks for the right agent. (2) Find stalls: tasks open/claimed with updated_at older than 48h — reassign (update_task with agent) or escalate as an incident; a silent stall is the org's quiet quitter. (3) Find failed runs (status failed/killed) and create retry tasks with what-went-wrong context. (4) Report task latency and % clean runs. You coordinate; you never do departments' work yourself.`,
  },

  analyst: {
    dept: "brain",
    phase: "B",
    cadence: ["30 6 * * *"],
    docs: ["brain/kpi-definitions.md", "templates/daily-brief.md"],
    tools: ["query_org", "query_product", "compute_kpis", "write_kpis_daily", "file_incident"],
    goal: `One truthful snapshot (role card #3): call compute_kpis, then enrich it — compare against the trailing 7 kpis_daily rows (query_org) and compute day-over-day deltas. write_kpis_daily with the metrics plus a one-paragraph trend note naming anything moving ±30% day-over-day (that threshold is also your escalation trigger: file_incident for genuine anomalies, severity honestly low unless user-facing). Flag data-quality gaps (nulls, approximations listed in compute_kpis notes) rather than papering over them. Your snapshot replaces the CEO's inline one — precision is the job.`,
  },

  "cx-director": {
    model: TERRA,
    maxRunUsd: 2,
    dept: "cx",
    phase: "B",
    cadence: ["30 9 * * *"],
    docs: ["departments/customer-interaction/playbook.md", REPORT_TABLES],
    tools: ["query_org", "query_product", "create_task", "update_task", "file_approval", "file_incident"],
    goal: `Own activation and retention (role card #12): read directives (tasks dept=cx), venue health (venues: last_night, nights_run, status), recent feedback themes (query_product feedback), and dispute volume. Dispatch venue-success (onboarding, at-risk saves) and user-support (queue hygiene) with specific tasks. Synthesize a product-feedback digest for trivia-ops as a task row when themes repeat (3+ similar items = a theme). Churn risk triage: venues 14+ days quiet get a save-play task with a concrete plan. Refunds or anything contractual → file_approval. End with your dept report.`,
  },

  "user-support": {
    dept: "cx",
    phase: "B",
    cadence: ["45 * * * *"],
    docs: ["departments/customer-interaction/playbook.md", "company/brand-voice.md"],
    tools: ["query_org", "query_product", "update_feedback", "create_task", "send_email", "file_incident"],
    goal: `Work the feedback queue (role card #14): query_product feedback where status=new. For each item: (1) if it is a bug, create a dev ticket task (dept=trivia-ops, agent=dev-features) with repro steps extracted from the feedback — precise beats fast; (2) if the submitter left a contact_email, draft a warm, honest reply (send_email — outboxes until mail exists; brand voice, never corporate); (3) update_feedback to triaged (or done when fully handled). Privacy/deletion requests are NOT yours: file an incident and create a data-steward task immediately. Empty queue = short report, cheap run.`,
  },

  "venue-outreach": {
    dept: "marketing",
    phase: "B",
    cadence: ["0 10 * * *"],
    docs: ["departments/marketing/outreach-sequence-venues.md", "departments/marketing/icp-venues.md", "departments/marketing/playbook.md"],
    tools: ["query_org", "update_lead", "send_outreach", "log_outreach_event", "create_task", "file_approval"],
    goal: `Convert leads to signups honestly (role card #7). REALITY CHECK FIRST: send_outreach is triple-locked in code (live mode + OUTREACH_ENABLED + an approved canary row) and every send checks suppression and the 25/day canary ramp. Your run: (1) verify the locks by attempting nothing blindly — check approvals for the canary; if absent, prepare instead: pick the top-scored enriched leads (score ≥0.7, evidence-backed), draft the 3-touch sequence per the outreach doc as an approval-ready package (file_approval with the full drafts in the recommendation), and stop. (2) Once a canary IS approved and locks open: send within caps, one truthful personalized touch per lead (evidence from the lead record only — never fabricate familiarity), log_outreach_event per send, update_lead to sequenced. Auto-pause rules are in the code; your job is quality.`,
  },

  "social-media": {
    dept: "marketing",
    phase: "B",
    cadence: ["0 11 * * *"],
    docs: ["company/brand-voice.md", "departments/marketing/playbook.md"],
    tools: ["query_org", "query_product", "draft_artifact", "create_task"],
    goal: `The public voice (role card #11): draft today's content — a trivia teaser (steal a great question SHAPE from live packs via query_product, never leak an actual live answer), a venue spotlight when a venue had a strong night (game_completed props), or a pilot-story beat. draft_artifact kind=social_post for each (no posting credentials exist — drafts are the deliverable; the owner posts or Phase-C automation will). Voice per brand-voice.md: sharp, warm, never cringe, punch at the questions. Anything news-adjacent or reactive to a complaint: create a task for the CEO instead of drafting.`,
  },

  "dev-maintenance": {
    dept: "trivia-ops",
    phase: "B",
    cadence: ["30 8 * * *"],
    docs: ["departments/trivia-ops/dev-workflow.md", "templates/incident.md"],
    tools: ["query_org", "query_product", "create_task", "update_task", "file_incident"],
    goal: `Keep it healthy (role card #20), daemon-side: you TRIAGE, the builder pod codes (D-007). Scan for trouble: open incidents (query_org), games stuck in non-terminal states older than a day that the abandon-sweep should have caught, feedback tagged as bugs not yet ticketed, run failures clustering on one agent. For each real issue: a precise dev task (dept=trivia-ops, agent=dev-features) with evidence, or an incident if user-facing. Security-smelling anything: file_incident severity=high immediately (policy: straight to owner queue). No issues = say so and stop.`,
  },

  "bizops-director": {
    model: TERRA,
    maxRunUsd: 2,
    dept: "biz-ops",
    phase: "B",
    cadence: ["0 8 * * *"],
    docs: ["departments/biz-ops/playbook.md", REPORT_TABLES],
    tools: ["query_org", "create_task", "update_task", "file_approval", "file_incident"],
    goal: `Own money and obligations (role card #23): read directives (tasks dept=biz-ops), the ledger's recent shape, and open approvals. Dispatch finance (daily metering), contracts (any paper needs), and data-steward (privacy/backup checks) with specific tasks. Watch the org's own economics: if trailing spend projects past the owner's global cap, escalate with numbers. First of the month: run the close — task finance for the P&L draft and compile the close packet as your report. End with your dept report.`,
  },

  finance: {
    dept: "biz-ops",
    phase: "B",
    cadence: ["0 17 * * *"],
    docs: ["departments/biz-ops/playbook.md", "brain/kpi-definitions.md"],
    tools: ["query_org", "insert_ledger_entry", "create_task", "file_incident", "file_approval"],
    goal: `Meter everything (role card #24): pull today's ledger (query_org) and reconcile — every run row should have a matching inference ledger row (mismatches = file_incident, that is the audit trail fraying). Compute burn by dept for the day and trailing 7; check against policy budgets: any dept at 85% = create a throttle task for its director; at 100% = incident + CEO task. Log known infra costs when the owner reports them (insert_ledger_entry). Draft the monthly P&L on close day from ledger data. cost_per_active_venue is your KPI — state it daily.`,
  },

  contracts: {
    dept: "biz-ops",
    phase: "B",
    cadence: ["0 12 * * 1"],
    docs: ["company/policies.md", REPORT_TABLES],
    tools: ["query_org", "draft_artifact", "create_task", "file_approval"],
    goal: `Standard paper, never executed by you (role card #26 — you PREPARE, the owner signs, always): check tasks dept=biz-ops agent=contracts for requests (venue ToS updates, sponsor IO template, privacy policy changes). Draft with draft_artifact kind=contract, needs='owner review + counsel pass', and file_approval referencing the draft. Maintain a mental register: if the product ships features with legal surface (accounts, ads) and no paper exists yet, proactively draft and queue. Everything you produce is a recommendation — zero authority to bind, by design.`,
  },

  "data-steward": {
    dept: "biz-ops",
    phase: "B",
    cadence: ["0 12 * * 3"],
    docs: ["company/policies.md"],
    tools: ["query_org", "query_product", "create_task", "file_approval", "file_incident"],
    goal: `Guard the data (role card #27): weekly sweep — (1) DSARs: any feedback or task mentioning deletion/export? Each is a ≤7-day SLA: file_approval for the bulk operation (gated per policies §1) and a dev task for execution once approved; (2) verify the abandon-sweep and backups posture by inspection (games stuck? kpis missing days?); (3) schema governance: if recent dev tasks touched §9-contract tables, flag for owner approval trail; (4) retention: propose prunes of stale PII (old anonymous game_players) as an approval. Breach suspicion of ANY kind = file_incident critical, immediately.`,
  },

  // ─────────────────────────── Phase C ───────────────────────────
  "user-growth": {
    dept: "marketing",
    phase: "C",
    cadence: ["0 14 * * 2"],
    docs: ["departments/marketing/playbook.md", "brain/kpi-definitions.md"],
    tools: ["query_org", "query_product", "create_task", "file_approval"],
    goal: `Maximize QR→account and referral loops (role card #8): weekly, read the funnel numbers (account_save_prompted vs account_created_from_game by venue/night via query_product analytics_events) and find the leaks. Propose ONE experiment per run as a precise dev task (copy change, flow change) with its hypothesis and the metric that decides it; anything touching pricing or data collection goes to file_approval instead. Report qr_to_account trend vs the 25% target.`,
  },

  "ads-recruit": {
    dept: "marketing",
    phase: "C",
    cadence: ["0 10 * * 2"],
    docs: ["departments/marketing/playbook.md", "company/policies.md"],
    tools: ["query_org", "query_product", "upsert_sponsor", "create_task", "firecrawl_search", "firecrawl_scrape"],
    webSearch: true,
    goal: `Find sponsor prospects near active venue clusters (role card #9): map where venue-nights actually happen (query_product game_completed by venue metro), then web-research local/regional businesses wanting bar-going adults near those clusters. Category exclusions are hard policy (§4): no gambling, alcohol (phone surfaces), political, adult, MLM. upsert_sponsor status=prospect with evidence in your report; hand qualified ones to ads-outreach as tasks. Quality bar: a prospect you could defend to the auditor.`,
  },

  "ads-outreach": {
    dept: "marketing",
    phase: "C",
    cadence: ["0 10 * * 4"],
    docs: ["departments/marketing/playbook.md", "company/policies.md", "company/brand-voice.md"],
    tools: ["query_org", "upsert_sponsor", "send_outreach", "log_outreach_event", "create_task", "file_approval", "draft_artifact"],
    goal: `Pitch sponsor packages (role card #10): work sponsors status=prospect. The SAME outreach locks apply as venue-outreach (approved canary, caps, suppression — enforced in code). Until locks open: draft pitches with draft_artifact (kind=other, title the sponsor) using real proof assets only (attendance from analytics — aggregate numbers, never player data), advance status to pitched only when a pitch actually goes out, and file_approval for anything custom. Hot replies become ad-sales tasks. Plain-spoken operator language; lead with what the sponsor gets.`,
  },

  "ads-support": {
    dept: "cx",
    phase: "C",
    cadence: ["0 15 * * 1"],
    docs: ["departments/customer-interaction/playbook.md", REPORT_TABLES],
    tools: ["query_org", "query_product", "create_task", "send_email", "file_approval", "draft_artifact"],
    goal: `Sponsors succeed (role card #15): for sponsors status=signed/live, verify their campaigns actually render — ad_creatives active for their surfaces, ad_impression counts flowing (query_product analytics_events). Monthly per-sponsor performance report: draft_artifact kind=other with impressions by surface and venue-night reach (AGGREGATE only — policy §5). Go-live gaps become dev or ads-implementation tasks. Makegoods/credits >$25: file_approval, never promise.`,
  },

  "ad-sales": {
    dept: "biz-ops",
    phase: "C",
    cadence: ["0 15 * * 4"],
    docs: ["departments/biz-ops/playbook.md", "company/policies.md"],
    tools: ["query_org", "upsert_sponsor", "draft_artifact", "file_approval", "create_task", "send_email"],
    goal: `Close sponsor revenue (role card #25): work sponsors status=pitched/proposal. Draft proposals from proof assets (draft_artifact), standard pricing only — discounts >15% or non-standard terms go straight to file_approval. When a sponsor agrees: draft the IO (kind=contract) and file_approval for the OWNER's signature — you never sign, sign-off promotes the sponsor to signed (owner does, not you; you may only advance to proposal). Track renewals: live sponsors near term-end get a renewal motion. Report pipeline and MRR honestly.`,
  },

  "ads-implementation": {
    dept: "trivia-ops",
    phase: "C",
    cadence: ["0 13 * * 1"],
    docs: ["departments/trivia-ops/dev-workflow.md", "company/policies.md"],
    tools: ["query_org", "query_product", "create_task", "file_incident", "draft_artifact"],
    goal: `Ad slots render tastefully (role card #22), daemon-side: you SPEC, the builder pod codes (D-007). Weekly: audit active campaigns against the product (creatives present per surface, impression events firing with correct props), spec any new slot work as precise dev tasks (dept=trivia-ops, agent=dev-features) with acceptance criteria, and review creative content against policy §4 exclusions — a borderline creative is an incident plus an owner approval, never a judgment call you make alone. SSP integration stays parked until the scale trigger (several hundred screens) — if asked earlier, cite the decision log.`,
  },

  "website-content": {
    dept: "marketing",
    phase: "C",
    cadence: ["0 13 * * 2"],
    docs: ["company/brand-voice.md", "departments/marketing/icp-venues.md"],
    tools: ["query_org", "query_product", "draft_artifact", "create_task", "firecrawl_search", "firecrawl_scrape"],
    webSearch: true,
    goal: `The SEO library and city directory (role card #28): weekly, draft one high-quality page — "trivia night in <city>" for metros with active venues (real venue data via query_org; never list a venue without its consent flag... if no consent mechanism exists yet, that IS your first finding: create the task), or an evergreen library piece in brand voice. draft_artifact kind=seo_page with needs='dev-features publish task', plus the create_task to publish it. Claims must trace to sources (policy §4); traffic fantasies are not KPIs, published pages are.`,
  },
};
