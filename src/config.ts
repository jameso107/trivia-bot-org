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
  model: process.env.ORG_MODEL ?? "gpt-5-mini",
  dailyBudgetUsd: Number(process.env.DAILY_BUDGET_USD ?? 5),
  maxRunUsd: Number(process.env.MAX_RUN_USD ?? 1),
  brainPath: process.env.BRAIN_PATH ?? "../trivia-bot-brain",
  ownerEmail: process.env.OWNER_EMAIL ?? "james@syzygy.services",
  // Which phases the SCHEDULER activates (blueprint: grow into the org chart).
  // A = boot roster · B = hardening roster · C = scale roster.
  // `once <role>` can always run any defined role regardless of phase.
  phase: (["A", "B", "C"].includes(process.env.ORG_PHASE ?? "A")
    ? (process.env.ORG_PHASE ?? "A")
    : "A") as "A" | "B" | "C",
  // Outreach stays triple-locked (policies §3): live mode AND this flag AND an
  // approved canary row. Until all three, sends are outbox records.
  outreachEnabled: process.env.OUTREACH_ENABLED === "true",
  // Firecrawl (YC credits): real web search/scrape for the web-facing roles.
  // Optional — tools degrade to a clear error when unset.
  firecrawlKey: process.env.FIRECRAWL_API_KEY ?? "",
};

export function phaseActive(rolePhase: "A" | "B" | "C"): boolean {
  const order = { A: 0, B: 1, C: 2 };
  return order[rolePhase] <= order[config.phase];
}

export const isDry = () => config.mode === "dry";
