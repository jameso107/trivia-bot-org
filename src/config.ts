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
};

export const isDry = () => config.mode === "dry";
