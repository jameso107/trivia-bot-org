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

export async function sendMail(to: string, subject: string, textBody: string) {
  return api("POST", `${inboxPath()}/messages/send`, { to: [to], subject, text: textBody });
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
