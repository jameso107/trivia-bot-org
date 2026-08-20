// The dry-run ledger of intent: every gated or dry-blocked side effect lands
// here as a would-do record — auditable, replayable, and safe. Emails ALWAYS
// land here in Phase A (no mail credentials yet), even in live mode.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "outbox");
let counter = 0;

export interface OutboxEntry {
  at: string;
  agent: string;
  mode: "dry" | "live";
  action: string;
  payload: unknown;
  note: string;
}

export function writeOutbox(entry: Omit<OutboxEntry, "at">): string {
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = join(dir, `${stamp}-${entry.agent}-${entry.action}-${counter++}.json`);
  writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), ...entry }, null, 2));
  console.log(`  ↳ outbox: [${entry.action}] ${entry.note}`);
  return file;
}
