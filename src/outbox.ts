// The ledger of intent: every gated or dry-blocked side effect lands here as
// a would-do record — auditable, replayable, safe. Written to BOTH the local
// outbox/ directory and the outbox_records table (the console reads the DB;
// the files are the offline copy). Emails ALWAYS land here in Phase A.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "./db.js";

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
  // DB mirror — best effort, never blocks or fails the run.
  void db()
    .from("outbox_records")
    .insert({
      agent: entry.agent,
      mode: entry.mode,
      action: entry.action,
      payload: entry.payload ?? {},
      note: entry.note,
    })
    .then(({ error }) => {
      if (error) console.warn(`  (outbox DB mirror failed: ${error.message})`);
    });
  return file;
}
