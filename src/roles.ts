// Phase-A roster (blueprint §3/§7 + infra/scheduled-tasks.md), one honest
// deviation documented in the README and brain decision log: dev-features /
// qa-tester stay with the Claude Code builder pod — this daemon runs the
// OPERATING company (content, funnel, CX, governance), not the codebase.
export type RoleKey =
  | "ceo"
  | "auditor"
  | "trivia-ops-director"
  | "marketing-director"
  | "venue-search"
  | "venue-success"
  | "trivia-creation"
  | "trivia-qa";

export interface RoleDef {
  dept: "brain" | "marketing" | "cx" | "trivia-ops" | "biz-ops";
  docs: string[]; // brain paths loaded into the run
  tools: string[];
  webSearch?: boolean;
  goal: string;
}

export const ROLES: Record<RoleKey, RoleDef> = {
  ceo: {
    dept: "brain",
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
    goal: `Run the CEO playbook. Phase-A specifics: (1) call compute_kpis for the snapshot — never invent numbers — and persist it with write_kpis_daily; (2) read yesterday's runs/reports, open incidents, approvals, and the task queue via query_org; (3) write 1-5 dated, specific directives as task rows for the ACTIVE departments only (trivia-ops and marketing are active; cx activates on real signups; biz-ops is Phase B); (4) queue anything gated with file_approval + a recommendation; (5) email the owner the daily brief per the template (send_email — it lands in the outbox for now, that is expected); (6) propose any decision-log entries inside your REPORT (you do not edit the brain repo directly — owned-edit rule).`,
  },

  auditor: {
    dept: "brain",
    docs: ["templates/incident.md", "templates/dept-report.md"],
    tools: ["query_org", "query_product", "file_incident", "create_task"],
    goal: `Weekly audit per your role card: sample the week's runs (query_org runs, notes included), ledger rows, shipped packs, and dispute rulings. Verify claims link artifacts; verify spend was logged; verify no pack shipped without a qa_report; verify no task sits stalled >48h unflagged. File incidents for anything off-policy (severity honestly chosen). Then brain-gardening: list contradictions or stale guidance you noticed across the doctrine you were given, as PROPOSALS in your report (the CEO merges; you never edit). Adversarial and kind.`,
  },

  "trivia-ops-director": {
    dept: "trivia-ops",
    docs: ["departments/trivia-ops/playbook.md", "departments/trivia-ops/dev-workflow.md", "templates/dept-report.md"],
    tools: ["query_org", "query_product", "create_task", "update_task", "file_approval", "file_incident"],
    goal: `Read your directives (query_org tasks where dept=trivia-ops) and the product's quality signals (open disputes, qa_pending packs, custom_pack_requests, recent game_completed props). Decompose directives into specific tasks for trivia-creation / trivia-qa (create_task with self-contained detail). Note: dev work is executed by the owner's Claude Code builder pod, not this daemon — for dev needs, write the task row with dept=trivia-ops, agent=dev-features and it will be picked up there. Close out (update_task) anything your sub-agents completed with artifacts. End with your dept report.`,
  },

  "marketing-director": {
    dept: "marketing",
    docs: ["departments/marketing/playbook.md", "departments/marketing/icp-venues.md", "templates/dept-report.md"],
    tools: ["query_org", "create_task", "update_task", "file_approval", "file_incident"],
    goal: `Read your directives (tasks dept=marketing) and the funnel state (leads by status, venues). Dispatch venue-search with specific, evidence-first tasks (metros, venue types, quantity targets per the ICP). OUTREACH IS GATED: no sending exists in Phase A and any new sequence needs an owner-approved canary (policies §3) — if a directive asks for outreach, file_approval instead of acting. End with your dept report.`,
  },

  "venue-search": {
    dept: "marketing",
    docs: ["departments/marketing/icp-venues.md", "departments/marketing/playbook.md"],
    tools: ["query_org", "insert_lead", "create_task", "update_task"],
    webSearch: true,
    goal: `Research-only lead building per your role card and the ICP: use web search to find Metro Detroit venues that fit, verify each with REAL source URLs (never fabricate evidence — policies §3), extract decision-maker contact only where public, score per the rubric, and insert_lead each one. Claim your open task rows (query_org tasks where dept=marketing, agent=venue-search) and update them with counts. Target this run: 3-5 QUALITY leads (Phase-A budget beats volume). NO outreach of any kind.`,
  },

  "venue-success": {
    dept: "cx",
    docs: ["departments/customer-interaction/playbook.md", "departments/customer-interaction/venue-onboarding.md", "templates/dept-report.md"],
    tools: ["query_org", "query_product", "create_task", "mark_event_processed", "send_email"],
    goal: `The signup watch (PRD §9 contract): query_org events where kind=venue_signup and processed_at is null. For EACH: pull the venue row, then run the onboarding playbook — draft the welcome/onboarding email (send_email; outbox is expected), create the onboarding-checklist task rows (dry-run kit, first-night scheduling nudge, week-1 health check with due dates), and ONLY THEN mark_event_processed. Also sweep venues with last_night older than 10 days (query_org venues) and flag at-risk ones as tasks. If the queue is empty, say so plainly in your report.`,
  },

  "trivia-creation": {
    dept: "trivia-ops",
    docs: ["departments/trivia-ops/question-style-guide.md", "company/brand-voice.md", "departments/trivia-ops/playbook.md"],
    tools: ["query_org", "query_product", "insert_pack", "create_task", "update_task"],
    goal: `Fulfill your open tasks (query_org tasks agent=trivia-creation), else grow the library: author ONE complete pack to the style guide — 4 rounds x 10 + a final wager question stored as round 5 position 1; difficulty curve 2.2/2.8/3.2/3.0 (±0.3 enforced mechanically); every answer_note starts 'source:'; formats mixed (~30 multiple_choice / 4 true_false / 3 number_closest / 4 open_text with accept-variant arrays); multiple_choice answers are the INDEX 0-3; check custom_pack_requests first — premium requests outrank library growth (honor the topic, pad 20% adjacent). insert_pack lands it as qa_pending; NEVER attempt to ship live — that is trivia-qa's power alone.`,
  },

  "trivia-qa": {
    dept: "trivia-ops",
    docs: ["departments/trivia-ops/question-style-guide.md", "departments/trivia-ops/playbook.md"],
    tools: ["query_org", "query_product", "rule_dispute", "set_pack_status", "create_task", "file_incident"],
    webSearch: true,
    goal: `Two queues, adversarial stance, separate from creation by design: (1) DISPUTES — query_product question_disputes where status=open; for each, fetch the question (query_product pack_questions filtered by id), web-verify the claim against primary sources, and rule_dispute upheld/rejected with a sourced ruling_note (upheld feeds the public error-rate KPI — never soften to protect it). (2) PACKS — query_product packs where status=qa_pending; for ONE pack per run, fetch all its questions, verify every checkable claim (web search), kill ambiguity per the style guide, then set_pack_status live (only if mean confidence ≥0.9 and zero unresolved flags) or rejected, with the full qa_report. If both queues are empty, report that and stop cheaply.`,
  },
};
