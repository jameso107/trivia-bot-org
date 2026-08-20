// The daemon's tool belt. Every tool declares its EFFECT; the guard enforces
// the mode: reads are always real, writes execute only in live mode (dry mode
// records them to the outbox as would-do), and 'external' actions (email)
// ALWAYS outbox in Phase A — no mail credentials exist yet, by design.
import { db } from "./db.js";
import { config, isDry } from "./config.js";
import { writeOutbox } from "./outbox.js";
import { computeKpis } from "./kpis.js";

export interface RunCtx {
  agent: string;
  artifacts: string[];
}

export interface OrgTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  effect: "read" | "write" | "external";
  run(args: Record<string, unknown>, ctx: RunCtx): Promise<unknown>;
}

// Tables each side of the house may read (PRD §9: org reads everything, but
// the daemon's product reads stay observational).
const ORG_TABLES = [
  "tasks", "runs", "approvals", "incidents", "leads", "outreach_events",
  "venues", "sponsors", "ledger", "kpis_daily", "events",
];
const PRODUCT_TABLES = [
  "packs", "pack_questions", "games", "game_teams", "analytics_events",
  "question_disputes", "feedback", "custom_pack_requests", "ad_creatives",
];

function queryTool(name: string, tables: string[], description: string): OrgTool {
  return {
    name,
    description: `${description} Allowed tables: ${tables.join(", ")}. Filters are exact-match column=value pairs.`,
    effect: "read",
    parameters: {
      type: "object",
      properties: {
        table: { type: "string", enum: tables },
        select: { type: "string", description: "comma-separated columns, default *" },
        filters: { type: "object", additionalProperties: true },
        is_null: { type: "string", description: "column that must be NULL (e.g. processed_at)" },
        order_by: { type: "string" },
        descending: { type: "boolean" },
        limit: { type: "number", description: "max 50" },
      },
      required: ["table"],
      additionalProperties: false,
    },
    async run(args) {
      const table = String(args.table);
      if (!tables.includes(table)) return { error: `table ${table} not allowed` };
      let q = db().from(table).select(String(args.select ?? "*"));
      for (const [k, v] of Object.entries((args.filters as Record<string, unknown>) ?? {})) {
        q = q.eq(k, v as never);
      }
      if (args.is_null) q = q.is(String(args.is_null), null);
      if (args.order_by) q = q.order(String(args.order_by), { ascending: !args.descending });
      q = q.limit(Math.min(Number(args.limit ?? 20), 50));
      const { data, error } = await q;
      return error ? { error: error.message } : { rows: data, count: data?.length ?? 0 };
    },
  };
}

// A write tool wraps its live implementation with the dry-run guard.
function writeTool(
  spec: Omit<OrgTool, "effect" | "run"> & {
    note: (args: Record<string, unknown>) => string;
    live: (args: Record<string, unknown>, ctx: RunCtx) => Promise<unknown>;
    external?: boolean;
  },
): OrgTool {
  return {
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    effect: spec.external ? "external" : "write",
    async run(args, ctx) {
      const blocked = spec.external || isDry();
      if (blocked) {
        const file = writeOutbox({
          agent: ctx.agent,
          mode: isDry() ? "dry" : "live",
          action: spec.name,
          payload: args,
          note: spec.note(args),
        });
        ctx.artifacts.push(file);
        return {
          recorded: true,
          executed: false,
          mode: isDry() ? "dry-run" : "phase-a-external",
          note: `Recorded to outbox (${spec.external ? "external actions require credentials/approval" : "dry-run mode"}): ${spec.note(args)}`,
        };
      }
      const result = await spec.live(args, ctx);
      return result;
    },
  };
}

export const TOOLBELT: Record<string, OrgTool> = {
  query_org: queryTool("query_org", ORG_TABLES, "Read rows from the org's operational tables."),
  query_product: queryTool("query_product", PRODUCT_TABLES, "Read rows from the product's tables (observational: the product owns them)."),

  compute_kpis: {
    name: "compute_kpis",
    description:
      "Deterministically compute the Phase-A KPI snapshot from the database per brain/kpi-definitions.md (code, not vibes). Returns metrics + methodology notes.",
    effect: "read",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    async run() {
      return computeKpis();
    },
  },

  create_task: writeTool({
    name: "create_task",
    description:
      "Insert a task row — the org's message-passing. detail must be self-contained (the receiver has no memory of your run).",
    parameters: {
      type: "object",
      properties: {
        dept: { type: "string", enum: ["brain", "marketing", "cx", "trivia-ops", "biz-ops"] },
        agent: { type: "string", description: "registry key, or omit for director triage" },
        title: { type: "string" },
        detail: { type: "string" },
        priority: { type: "number", description: "1 (highest) to 5" },
        due: { type: "string", description: "YYYY-MM-DD, optional" },
      },
      required: ["dept", "title", "detail"],
      additionalProperties: false,
    },
    note: (a) => `task → ${a.dept}${a.agent ? `/${a.agent}` : ""}: ${a.title}`,
    async live(args, ctx) {
      const { data, error } = await db()
        .from("tasks")
        .insert({
          dept: args.dept, agent: args.agent ?? null, title: args.title,
          detail: args.detail, priority: args.priority ?? 3,
          due: args.due ?? null, created_by: ctx.agent,
        })
        .select("id")
        .single();
      if (error) return { error: error.message };
      ctx.artifacts.push(`tasks:${data.id}`);
      return { task_id: data.id };
    },
  }),

  update_task: writeTool({
    name: "update_task",
    description:
      "Update a task: status, artifact link, reassignment (agent), or priority. chief-of-staff uses reassignment to unstick stalled work.",
    parameters: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        status: { type: "string", enum: ["open", "claimed", "done", "blocked", "archived"] },
        output_ref: { type: "string" },
        agent: { type: "string", description: "reassign to this registry key" },
        priority: { type: "number" },
      },
      required: ["task_id", "status"],
      additionalProperties: false,
    },
    note: (a) => `task ${a.task_id} → ${a.status}${a.agent ? ` (reassigned: ${a.agent})` : ""}`,
    async live(args, ctx) {
      const patch: Record<string, unknown> = {
        status: args.status,
        output_ref: args.output_ref ?? null,
        updated_at: new Date().toISOString(),
      };
      if (args.agent) patch.agent = args.agent;
      if (args.priority) patch.priority = args.priority;
      const { error } = await db().from("tasks").update(patch).eq("id", args.task_id);
      if (error) return { error: error.message };
      ctx.artifacts.push(`tasks:${args.task_id}`);
      return { updated: true };
    },
  }),

  file_approval: writeTool({
    name: "file_approval",
    description: "Queue a gated action for the owner with a recommendation (policies §1). Never perform the gated action yourself.",
    parameters: {
      type: "object",
      properties: {
        action_class: { type: "string" },
        summary: { type: "string" },
        recommendation: { type: "string" },
      },
      required: ["action_class", "summary", "recommendation"],
      additionalProperties: false,
    },
    note: (a) => `approval queued [${a.action_class}]: ${a.summary}`,
    async live(args, ctx) {
      const { data, error } = await db()
        .from("approvals")
        .insert({ ...args, requested_by: ctx.agent })
        .select("id")
        .single();
      if (error) return { error: error.message };
      ctx.artifacts.push(`approvals:${data.id}`);
      return { approval_id: data.id };
    },
  }),

  file_incident: writeTool({
    name: "file_incident",
    description: "File an incident (policies §6): anything off-policy, public-facing errors, threshold breaches.",
    parameters: {
      type: "object",
      properties: {
        severity: { type: "string", enum: ["low", "med", "high", "critical"] },
        title: { type: "string" },
        body: { type: "string" },
      },
      required: ["severity", "title", "body"],
      additionalProperties: false,
    },
    note: (a) => `incident [${a.severity}]: ${a.title}`,
    async live(args, ctx) {
      const { data, error } = await db()
        .from("incidents")
        .insert({ ...args, filed_by: ctx.agent })
        .select("id")
        .single();
      if (error) return { error: error.message };
      ctx.artifacts.push(`incidents:${data.id}`);
      return { incident_id: data.id };
    },
  }),

  mark_event_processed: writeTool({
    name: "mark_event_processed",
    description: "Stamp an org events row as consumed AFTER you have fully acted on it (tasks created, follow-ups queued).",
    parameters: {
      type: "object",
      properties: { event_id: { type: "string" } },
      required: ["event_id"],
      additionalProperties: false,
    },
    note: (a) => `event ${a.event_id} → processed`,
    async live(args, ctx) {
      const { error } = await db()
        .from("events")
        .update({ processed_at: new Date().toISOString() })
        .eq("id", args.event_id);
      if (error) return { error: error.message };
      ctx.artifacts.push(`events:${args.event_id}`);
      return { processed: true };
    },
  }),

  write_kpis_daily: writeTool({
    name: "write_kpis_daily",
    description: "Write today's KPI snapshot row (metrics keys per brain/kpi-definitions.md). Use compute_kpis first; never invent numbers.",
    parameters: {
      type: "object",
      properties: {
        day: { type: "string", description: "YYYY-MM-DD" },
        metrics: { type: "object", additionalProperties: true },
        note: { type: "string" },
      },
      required: ["day", "metrics"],
      additionalProperties: false,
    },
    note: (a) => `kpis_daily ${a.day}`,
    async live(args, ctx) {
      const { error } = await db()
        .from("kpis_daily")
        .upsert({ day: args.day, metrics: args.metrics, note: args.note ?? null });
      if (error) return { error: error.message };
      ctx.artifacts.push(`kpis_daily:${args.day}`);
      return { written: true };
    },
  }),

  send_email: writeTool({
    name: "send_email",
    description:
      "Send an email (the CEO's daily brief, CX onboarding). Phase A has no mail credentials: ALWAYS lands in the outbox for the owner to see/send.",
    external: true,
    parameters: {
      type: "object",
      properties: {
        to: { type: "string" },
        subject: { type: "string" },
        body: { type: "string", description: "plain text/markdown" },
      },
      required: ["to", "subject", "body"],
      additionalProperties: false,
    },
    note: (a) => `email → ${a.to}: ${a.subject}`,
    async live() {
      return { error: "unreachable: external actions always outbox in Phase A" };
    },
  }),

  rule_dispute: writeTool({
    name: "rule_dispute",
    description:
      "trivia-qa only: rule a question dispute (upheld/rejected) with a sourced ruling_note. Upheld disputes feed pack_error_rate — never soften a ruling to protect the KPI.",
    parameters: {
      type: "object",
      properties: {
        dispute_id: { type: "string" },
        status: { type: "string", enum: ["upheld", "rejected"] },
        ruling_note: { type: "string", description: "one paragraph, cite the source" },
      },
      required: ["dispute_id", "status", "ruling_note"],
      additionalProperties: false,
    },
    note: (a) => `dispute ${a.dispute_id} → ${a.status}`,
    async live(args, ctx) {
      const { error } = await db()
        .from("question_disputes")
        .update({ status: args.status, ruling_note: args.ruling_note, ruled_at: new Date().toISOString() })
        .eq("id", args.dispute_id);
      if (error) return { error: error.message };
      ctx.artifacts.push(`question_disputes:${args.dispute_id}`);
      return { ruled: true };
    },
  }),

  insert_lead: writeTool({
    name: "insert_lead",
    description:
      "venue-search: insert an enriched venue lead. Evidence entries MUST carry real source_urls (policies §3: personalization must be true).",
    parameters: {
      type: "object",
      properties: {
        venue_name: { type: "string" },
        metro: { type: "string" },
        address: { type: "string" },
        website: { type: "string" },
        contact_name: { type: "string" },
        contact_role: { type: "string" },
        contact_email: { type: "string" },
        evidence: {
          type: "array",
          items: {
            type: "object",
            properties: { note: { type: "string" }, source_url: { type: "string" } },
            required: ["note", "source_url"],
            additionalProperties: false,
          },
        },
        score: { type: "number", description: "0-1 fit per the ICP rubric" },
      },
      required: ["venue_name", "metro", "evidence", "score"],
      additionalProperties: false,
    },
    note: (a) => `lead: ${a.venue_name} (${a.metro}) score ${a.score}`,
    async live(args, ctx) {
      const { data, error } = await db()
        .from("leads")
        .insert({ ...args, status: "enriched" })
        .select("id")
        .single();
      if (error) return { error: error.message };
      ctx.artifacts.push(`leads:${data.id}`);
      return { lead_id: data.id };
    },
  }),
};

// ---- Phase B/C tool additions ----

TOOLBELT.update_lead = writeTool({
  name: "update_lead",
  description: "Update a lead's status/score/evidence (funnel states per the org schema). Suppression is permanent — never un-suppress.",
  parameters: {
    type: "object",
    properties: {
      lead_id: { type: "string" },
      status: {
        type: "string",
        enum: ["new", "enriched", "sequenced", "replied", "signed_up", "nurture", "suppressed", "archived"],
      },
      score: { type: "number" },
      suppressed_reason: { type: "string" },
    },
    required: ["lead_id", "status"],
    additionalProperties: false,
  },
  note: (a) => `lead ${a.lead_id} → ${a.status}`,
  async live(args, ctx) {
    const { data: current } = await db().from("leads").select("status").eq("id", args.lead_id).maybeSingle();
    if (current?.status === "suppressed" && args.status !== "suppressed") {
      return { error: "suppression is permanent (policies §3)" };
    }
    const patch: Record<string, unknown> = { status: args.status, updated_at: new Date().toISOString() };
    if (args.score !== undefined) patch.score = args.score;
    if (args.suppressed_reason) patch.suppressed_reason = args.suppressed_reason;
    const { error } = await db().from("leads").update(patch).eq("id", args.lead_id);
    if (error) return { error: error.message };
    ctx.artifacts.push(`leads:${args.lead_id}`);
    return { updated: true };
  },
});

// Outreach is TRIPLE-LOCKED in code (policies §3), not in prompts:
// live mode + OUTREACH_ENABLED env + an approved canary approvals row —
// and even then the suppression list and daily ramp cap are checked here.
// Until mail credentials exist this still outboxes, but every lock is real.
TOOLBELT.send_outreach = writeTool({
  name: "send_outreach",
  description:
    "Send ONE outreach email to a lead within an owner-approved sequence. Hard-gated in code: approved canary, ramp caps, permanent suppression list, CAN-SPAM footer required. Logs the outreach_event.",
  external: true, // Phase A/B without mail creds: always outbox — locks below still evaluated first
  parameters: {
    type: "object",
    properties: {
      lead_id: { type: "string" },
      sequence: { type: "string", description: "approved sequence name" },
      touch: { type: "number", description: "1-3" },
      subject: { type: "string" },
      body: { type: "string", description: "must include truthful sender identity, unsubscribe, postal address" },
    },
    required: ["lead_id", "sequence", "touch", "subject", "body"],
    additionalProperties: false,
  },
  note: (a) => `outreach [${a.sequence} t${a.touch}] → lead ${a.lead_id}: ${a.subject}`,
  async live() {
    return { error: "unreachable: outreach outboxes until mail credentials exist" };
  },
});
// Wrap send_outreach's guard: evaluate the locks BEFORE outboxing so a
// blocked send is visibly blocked, not quietly recorded as a would-do.
{
  const base = TOOLBELT.send_outreach;
  TOOLBELT.send_outreach = {
    ...base,
    async run(args, ctx) {
      const locks: string[] = [];
      if (isDry()) locks.push("ORG_MODE=dry");
      if (!config.outreachEnabled) locks.push("OUTREACH_ENABLED is false");
      const { data: approval } = await db()
        .from("approvals")
        .select("id, status")
        .eq("action_class", "outreach.sequence.canary_send")
        .eq("status", "approved")
        .limit(1);
      if (!approval || approval.length === 0) locks.push("no approved canary in approvals");
      const { data: lead } = await db().from("leads").select("status, contact_email").eq("id", args.lead_id).maybeSingle();
      if (!lead) locks.push("lead not found");
      if (lead?.status === "suppressed") locks.push("lead is SUPPRESSED (permanent)");
      if (!lead?.contact_email) locks.push("lead has no contact email");
      const today = new Date().toISOString().slice(0, 10);
      const { count: sentToday } = await db()
        .from("outreach_events")
        .select("id", { count: "exact", head: true })
        .eq("event", "sent")
        .gte("created_at", `${today}T00:00:00Z`);
      if ((sentToday ?? 0) >= 25) locks.push("daily ramp cap reached (25/day canary tier)");
      const bodyLower = String(args.body).toLowerCase();
      if (!bodyLower.includes("unsubscribe")) locks.push("body missing unsubscribe (CAN-SPAM)");

      if (locks.length > 0) {
        return { sent: false, blocked_by: locks, note: "outreach locks are code, not judgment — resolve them or file_approval" };
      }
      return base.run(args, ctx); // external → outbox until mail creds exist
    },
  };
}

TOOLBELT.log_outreach_event = writeTool({
  name: "log_outreach_event",
  description: "Record an outreach lifecycle event (sent/delivered/bounced/replied/unsubscribed/complaint) for a lead — deliverability KPIs read from here.",
  parameters: {
    type: "object",
    properties: {
      lead_id: { type: "string" },
      sequence: { type: "string" },
      touch: { type: "number" },
      event: { type: "string", enum: ["sent", "delivered", "bounced", "replied", "unsubscribed", "complaint"] },
      message_id: { type: "string" },
      meta: { type: "object", additionalProperties: true },
    },
    required: ["lead_id", "sequence", "touch", "event"],
    additionalProperties: false,
  },
  note: (a) => `outreach_event ${a.event} [${a.sequence} t${a.touch}] lead ${a.lead_id}`,
  async live(args, ctx) {
    const { data, error } = await db().from("outreach_events").insert(args).select("id").single();
    if (error) return { error: error.message };
    ctx.artifacts.push(`outreach_events:${data.id}`);
    return { logged: true };
  },
});

TOOLBELT.update_feedback = writeTool({
  name: "update_feedback",
  description: "user-support: move a feedback row through its queue (new → triaged → done). Convert bugs into dev task rows before marking done.",
  parameters: {
    type: "object",
    properties: {
      feedback_id: { type: "string" },
      status: { type: "string", enum: ["new", "triaged", "done"] },
    },
    required: ["feedback_id", "status"],
    additionalProperties: false,
  },
  note: (a) => `feedback ${a.feedback_id} → ${a.status}`,
  async live(args, ctx) {
    const { error } = await db().from("feedback").update({ status: args.status }).eq("id", args.feedback_id);
    if (error) return { error: error.message };
    ctx.artifacts.push(`feedback:${args.feedback_id}`);
    return { updated: true };
  },
});

TOOLBELT.insert_ledger_entry = writeTool({
  name: "insert_ledger_entry",
  description: "finance: record a non-inference money event (tool/infra cost, revenue, refund). Inference is metered automatically — never double-log it.",
  parameters: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["tool", "infra", "revenue", "refund", "other"] },
      amount_usd: { type: "number", description: "negative = cost, positive = revenue" },
      dept: { type: "string" },
      memo: { type: "string" },
      artifact_ref: { type: "string" },
    },
    required: ["kind", "amount_usd", "memo"],
    additionalProperties: false,
  },
  note: (a) => `ledger ${a.kind}: $${a.amount_usd} — ${a.memo}`,
  async live(args, ctx) {
    const { data, error } = await db()
      .from("ledger")
      .insert({ ...args, agent: ctx.agent })
      .select("id")
      .single();
    if (error) return { error: error.message };
    ctx.artifacts.push(`ledger:${data.id}`);
    return { logged: true };
  },
});

TOOLBELT.upsert_sponsor = writeTool({
  name: "upsert_sponsor",
  description:
    "ads pipeline: insert a sponsor prospect or advance its status (prospect→pitched→proposal→signed→live→churned). 'signed' and beyond require an owner-approved IO — file_approval first; never self-advance past proposal.",
  parameters: {
    type: "object",
    properties: {
      sponsor_id: { type: "string", description: "omit to insert a new prospect" },
      business: { type: "string" },
      contact_email: { type: "string" },
      package: { type: "string" },
      mrr_usd: { type: "number" },
      status: { type: "string", enum: ["prospect", "pitched", "proposal"] },
    },
    required: ["business", "status"],
    additionalProperties: false,
  },
  note: (a) => `sponsor ${a.business} → ${a.status}`,
  async live(args, ctx) {
    if (args.sponsor_id) {
      const { error } = await db()
        .from("sponsors")
        .update({ status: args.status, package: args.package ?? null, mrr_usd: args.mrr_usd ?? null })
        .eq("id", args.sponsor_id);
      if (error) return { error: error.message };
      ctx.artifacts.push(`sponsors:${args.sponsor_id}`);
      return { updated: true };
    }
    const { data, error } = await db()
      .from("sponsors")
      .insert({
        business: args.business, contact_email: args.contact_email ?? null,
        package: args.package ?? null, mrr_usd: args.mrr_usd ?? null, status: args.status,
      })
      .select("id")
      .single();
    if (error) return { error: error.message };
    ctx.artifacts.push(`sponsors:${data.id}`);
    return { sponsor_id: data.id };
  },
});

TOOLBELT.draft_artifact = writeTool({
  name: "draft_artifact",
  description:
    "Produce a reviewable draft that has no execution channel yet: contracts (ALWAYS drafts — policies §1), social posts, SEO pages, board packets, incident postmortems. Lands in the outbox with a kind tag for the owner or downstream agent.",
  external: true,
  parameters: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: ["contract", "social_post", "seo_page", "board_packet", "postmortem", "playbook_diff", "other"],
      },
      title: { type: "string" },
      content: { type: "string", description: "the complete draft, markdown" },
      needs: { type: "string", description: "what must happen next (owner signature, dev publish task, counsel review...)" },
    },
    required: ["kind", "title", "content", "needs"],
    additionalProperties: false,
  },
  note: (a) => `draft [${a.kind}]: ${a.title} — needs: ${a.needs}`,
  async live() {
    return { error: "unreachable: drafts always land in the outbox" };
  },
});

// ---- content pipeline (PRD §9: creation INSERTs qa_pending; qa flips) ----

TOOLBELT.insert_pack = writeTool({
  name: "insert_pack",
  description:
    "trivia-creation: insert a complete draft pack as status='qa_pending' (NEVER live — only trivia-qa promotes). Mechanical style-guide checks run before insert; violations are returned for you to fix.",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string" },
      topic: { type: "string" },
      description: { type: "string" },
      rounds: { type: "number" },
      difficulty_curve: { type: "array", items: { type: "number" } },
      tags: { type: "array", items: { type: "string" } },
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            round: { type: "number" },
            position: { type: "number" },
            format: { type: "string", enum: ["multiple_choice", "true_false", "number_closest", "open_text"] },
            prompt: { type: "string" },
            options: { type: ["array", "null"], items: { type: "string" } },
            answer: {},
            answer_note: { type: "string" },
            difficulty: { type: "number" },
            time_limit_s: { type: "number" },
          },
          required: ["round", "position", "format", "prompt", "answer", "answer_note", "difficulty", "time_limit_s"],
          additionalProperties: false,
        },
      },
    },
    required: ["title", "topic", "rounds", "difficulty_curve", "questions"],
    additionalProperties: false,
  },
  note: (a) => `pack draft → qa_pending: ${a.title} (${(a.questions as unknown[]).length} questions)`,
  async live(args, ctx) {
    const qs = args.questions as Array<Record<string, unknown>>;
    const rounds = Number(args.rounds);
    const violations: string[] = [];
    for (const q of qs) {
      const words = String(q.prompt).trim().split(/\s+/).length;
      if (words > 25) violations.push(`R${q.round}P${q.position}: prompt ${words} words (>25)`);
      if (!String(q.answer_note).toLowerCase().startsWith("source:"))
        violations.push(`R${q.round}P${q.position}: answer_note must start with 'source:'`);
      if (q.format === "multiple_choice" && (!Array.isArray(q.options) || (q.options as unknown[]).length !== 4))
        violations.push(`R${q.round}P${q.position}: multiple_choice needs exactly 4 options`);
      const d = Number(q.difficulty);
      if (d < 1 || d > 5) violations.push(`R${q.round}P${q.position}: difficulty ${d} outside 1-5`);
    }
    for (let r = 1; r <= rounds; r++) {
      const inRound = qs.filter((q) => Number(q.round) === r);
      const mean = inRound.reduce((a, q) => a + Number(q.difficulty), 0) / Math.max(1, inRound.length);
      const target = (args.difficulty_curve as number[])[r - 1];
      if (target !== undefined && Math.abs(mean - target) > 0.3)
        violations.push(`round ${r}: mean difficulty ${mean.toFixed(2)} off target ${target} by >0.3`);
    }
    if (violations.length) return { inserted: false, violations };

    const { data: pack, error } = await db()
      .from("packs")
      .insert({
        title: args.title, topic: args.topic, description: args.description ?? null,
        rounds, difficulty_curve: args.difficulty_curve, question_count: qs.length,
        tags: args.tags ?? [], status: "qa_pending", created_by: "org",
      })
      .select("id")
      .single();
    if (error) return { error: error.message };
    const { error: qErr } = await db()
      .from("pack_questions")
      .insert(qs.map((q) => ({ ...q, pack_id: pack.id })));
    if (qErr) return { error: `questions failed: ${qErr.message} (pack ${pack.id} left in qa_pending, incomplete — flag it)` };
    ctx.artifacts.push(`packs:${pack.id}`);
    return { inserted: true, pack_id: pack.id, status: "qa_pending" };
  },
});

TOOLBELT.set_pack_status = writeTool({
  name: "set_pack_status",
  description:
    "trivia-qa ONLY: promote qa_pending→live or reject, with the qa_report (mean confidence ≥0.9 and zero unresolved flags required for live — the style guide's shipping bar, enforced mechanically).",
  parameters: {
    type: "object",
    properties: {
      pack_id: { type: "string" },
      status: { type: "string", enum: ["live", "rejected"] },
      qa_report: {
        type: "object",
        properties: {
          mean_confidence: { type: "number" },
          flags: { type: "array", items: { type: "string" } },
          kill_list: { type: "array", items: { type: "string" } },
          summary: { type: "string" },
        },
        required: ["mean_confidence", "flags", "summary"],
        additionalProperties: true,
      },
    },
    required: ["pack_id", "status", "qa_report"],
    additionalProperties: false,
  },
  note: (a) => `pack ${a.pack_id} → ${a.status}`,
  async live(args, ctx) {
    const report = args.qa_report as { mean_confidence: number; flags: string[] };
    if (args.status === "live" && (report.mean_confidence < 0.9 || report.flags.length > 0)) {
      return {
        error: `shipping bar not met (confidence ${report.mean_confidence}, ${report.flags.length} flags) — fix or reject`,
      };
    }
    const { error } = await db()
      .from("packs")
      .update({ status: args.status, qa_report: args.qa_report })
      .eq("id", args.pack_id)
      .eq("status", "qa_pending");
    if (error) return { error: error.message };
    ctx.artifacts.push(`packs:${args.pack_id}`);
    return { updated: true };
  },
});

export function toolsFor(names: string[]): OrgTool[] {
  return names.map((n) => {
    const t = TOOLBELT[n];
    if (!t) throw new Error(`unknown tool: ${n}`);
    return t;
  });
}
