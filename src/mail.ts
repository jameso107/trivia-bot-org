// AgentMail (decision D-010): the org's mail transport + ingest.
// Policy lives in tools.ts (Phase A: only owner-addressed mail transmits);
// this module only moves bytes. Ingest turns unread inbound mail into
// events rows (kind=email_received) — the same wake-up channel the product
// uses for signups, so agents consume mail with the tools they already have.
import { config } from "./config.js";
import { db } from "./db.js";

const BASE = "https://api.agentmail.to/v0";

export const mailConfigured = (): boolean => Boolean(config.agentmailKey && config.agentmailInbox);

async function api(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown> & { error?: string }> {
  if (!mailConfigured()) return { error: "AgentMail is not configured (AGENTMAIL_API_KEY / AGENTMAIL_INBOX)" };
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { authorization: `Bearer ${config.agentmailKey}`, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) return { error: `agentmail ${method} ${path} failed (${res.status}): ${text.slice(0, 300)}` };
    return (text ? JSON.parse(text) : {}) as Record<string, unknown>;
  } catch (e) {
    return { error: `agentmail ${method} ${path} error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

const inboxPath = () => `/inboxes/${encodeURIComponent(config.agentmailInbox)}`;

// Markdown-lite → email HTML. Agents write markdown-ish text; inboxes get a
// clean HTML rendering (headings, bold, bullets, paragraphs) plus the raw
// text as the fallback part. No dependency — email HTML wants to be boring.
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
export function toEmailHtml(text: string): string {
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");
  const blocks = text.split(/\n{2,}/).map((block) => {
    const lines = block.split("\n");
    if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
      const items = lines.map((l) => `<li>${inline(l.replace(/^\s*[-•]\s+/, ""))}</li>`).join("");
      return `<ul style="margin:0 0 14px;padding-left:22px">${items}</ul>`;
    }
    if (/^#{1,3}\s+/.test(lines[0])) {
      const h = inline(lines[0].replace(/^#{1,3}\s+/, ""));
      const rest = lines.slice(1).join("<br>");
      return `<h3 style="margin:18px 0 6px;font-size:16px">${h}</h3>${rest ? `<p style="margin:0 0 14px">${inline(rest)}</p>` : ""}`;
    }
    return `<p style="margin:0 0 14px">${lines.map(inline).join("<br>")}</p>`;
  });
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.55;color:#18181b;max-width:640px">${blocks.join("")}</div>`;
}

export async function sendMail(to: string, subject: string, textBody: string) {
  return api("POST", `${inboxPath()}/messages/send`, {
    to: [to],
    subject,
    text: textBody,
    html: toEmailHtml(textBody),
  });
}

export async function readMessage(messageId: string) {
  return api("GET", `${inboxPath()}/messages/${encodeURIComponent(messageId)}`);
}

async function markRead(messageId: string) {
  return api("PATCH", `${inboxPath()}/messages/${encodeURIComponent(messageId)}`, { remove_labels: ["unread"] });
}

// Unread IS the work queue: each unread inbound message becomes ONE events row,
// then loses its unread label. Insert-before-mark so a failed insert retries on
// the next poll; the message_id dedupe covers the crack between the two.
export async function ingestMail(): Promise<{ ingested: number; error?: string }> {
  const out = await api("GET", `${inboxPath()}/messages?labels=unread&limit=20`);
  if (out.error) return { ingested: 0, error: out.error };
  const messages = (out.messages ?? []) as Record<string, unknown>[];
  let ingested = 0;
  for (const m of messages) {
    const id = String(m.message_id ?? m.id ?? "");
    if (!id) continue;
    const labels = (m.labels ?? []) as string[];
    if (!labels.includes("received")) {
      await markRead(id); // sent-copies etc. — just clear the flag
      continue;
    }
    const { data: dupe } = await db()
      .from("events")
      .select("id")
      .eq("kind", "email_received")
      .eq("payload->>message_id", id)
      .limit(1);
    if (!dupe || dupe.length === 0) {
      const { error } = await db()
        .from("events")
        .insert({
          kind: "email_received",
          payload: {
            message_id: id,
            thread_id: m.thread_id ?? null,
            from: m.from ?? null,
            subject: m.subject ?? null,
            preview: String(m.preview ?? m.text ?? "").slice(0, 500),
            inbox: config.agentmailInbox,
            received_at: m.timestamp ?? null,
          },
        });
      if (error) {
        console.warn(`mail ingest: events insert failed (${error.message}) — will retry next poll`);
        continue;
      }
      ingested++;
    }
    await markRead(id);
  }
  return { ingested };
}
