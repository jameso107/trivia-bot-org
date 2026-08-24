import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env: ${name} (see .env.example)`);
  return v;
}

export const config = {
  openaiKey: required("OPENAI_API_KEY"),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseSecretKey: required("SUPABASE_SECRET_KEY"),
  mode: (process.env.ORG_MODE === "live" ? "live" : "dry") as "dry" | "live",
  // Fleet default (owner decision 2026-08-24, D-013): gpt-5.6-terra for the
  // whole fleet; judgment-critical roles override to SOL in roles.ts.
  // ORG_MODEL still beats this for the fleet.
  model: process.env.ORG_MODEL ?? "gpt-5.6-terra",
  dailyBudgetUsd: Number(process.env.DAILY_BUDGET_USD ?? 5),
  monthlyBudgetUsd: Number(process.env.MONTHLY_BUDGET_USD ?? 100),
  // Per-run ceiling for roles without an explicit maxRunUsd — sized for the
  // terra fleet default (D-013); the org_flags budget overrides are the real
  // circuit breaker.
  maxRunUsd: Number(process.env.MAX_RUN_USD ?? 2),
  brainPath: process.env.BRAIN_PATH ?? "../trivia-bot-brain",
  ownerEmail: process.env.OWNER_EMAIL ?? "james@syzygy.services",
  // Which phases the SCHEDULER activates (blueprint: grow into the org chart).
  // A = boot roster · B = hardening roster · C = scale roster.
  // Default B since 2026-08-24 (D-013: owner unbenched the hardening roster;
  // venue-outreach stays held via org_flags.paused_agents until the outreach
  // domain + canary exist). `once <role>` can always run any defined role.
  phase: (["A", "B", "C"].includes(process.env.ORG_PHASE ?? "B")
    ? (process.env.ORG_PHASE ?? "B")
    : "B") as "A" | "B" | "C",
  // Outreach stays triple-locked (policies §3): live mode AND this flag AND an
  // approved canary row. Until all three, sends are outbox records.
  outreachEnabled: process.env.OUTREACH_ENABLED === "true",
  // Firecrawl (YC credits): real web search/scrape for the web-facing roles.
  // Optional — tools degrade to a clear error when unset.
  firecrawlKey: process.env.FIRECRAWL_API_KEY ?? "",
  // AgentMail (D-010): the mail loop. Both optional — without them send_email
  // outboxes everything and the daemon skips inbox polling.
  agentmailKey: process.env.AGENTMAIL_API_KEY ?? "",
  agentmailInbox: process.env.AGENTMAIL_INBOX ?? "",
};

export function phaseActive(rolePhase: "A" | "B" | "C"): boolean {
  const order = { A: 0, B: 1, C: 2 };
  return order[rolePhase] <= order[config.phase];
}

export const isDry = () => config.mode === "dry";
