// Layer-1 brain access: doctrine files from the trivia-bot-brain repo.
// Agents are stateless — every run re-reads its slice of the brain
// (memory-conventions.md: policies always win, then your role card, then
// your playbook, then OKRs).
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { config } from "./config.js";

const root = resolve(process.cwd(), config.brainPath);

export function brainDoc(relPath: string): string {
  try {
    return readFileSync(join(root, relPath), "utf8");
  } catch {
    return `(!!) brain doc missing: ${relPath} — flag this in your report.`;
  }
}

// Slice one agent's role card out of brain/agent-registry.md by its
// "### N. <key>" heading.
export function roleCard(key: string): string {
  const registry = brainDoc("brain/agent-registry.md");
  const re = new RegExp(`###\\s+\\d+\\.\\s+${key}[\\s\\S]*?(?=\\n###\\s+\\d+\\.|\\n---|$)`);
  const match = registry.match(re);
  return match ? match[0].trim() : `(!!) role card not found for '${key}'`;
}

export function coreDoctrine(): string {
  return [
    "## company/policies.md (THESE OUTRANK EVERYTHING)",
    brainDoc("company/policies.md"),
    "## brain/memory-conventions.md (how you read/write the brain)",
    brainDoc("brain/memory-conventions.md"),
    "## company/okrs.md",
    brainDoc("company/okrs.md"),
  ].join("\n\n");
}
