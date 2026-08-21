import { db } from "@/lib/db";
import { markOutboxReviewed } from "@/lib/actions";
import { Section, timeAgo } from "@/components/ui";

export const dynamic = "force-dynamic";

// The org's would-do stream: drafted emails, gated writes, contracts, posts.
// Everything an agent WANTED to do but had no channel or clearance for.
export default async function OutboxPage() {
  const { data: records } = await db()
    .from("outbox_records")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(80);

  const unreviewed = (records ?? []).filter((r) => !r.reviewed);

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold">Outbox</h1>
        <p className="text-sm text-zinc-500">
          {unreviewed.length} unreviewed of {(records ?? []).length} shown. Briefs, drafts, and dry-run would-dos land here.
        </p>
      </header>

      <Section title="Stream">
        <div className="flex flex-col gap-2">
          {(records ?? []).map((r) => {
            const payload = (r.payload ?? {}) as Record<string, unknown>;
            const isEmail = r.action === "send_email" || r.action === "send_outreach";
            const isDraft = r.action === "draft_artifact";
            return (
              <details
                key={r.id}
                className={`rounded-xl border px-4 py-3 ${r.reviewed ? "border-zinc-800 bg-zinc-900/50 opacity-60" : "border-zinc-700 bg-zinc-900"}`}
              >
                <summary className="flex cursor-pointer items-center gap-3 text-sm">
                  <span className="w-36 shrink-0 font-mono text-amber-300">{r.agent}</span>
                  <span className="w-40 shrink-0 font-mono text-xs text-zinc-500">{r.action}</span>
                  <span className="truncate text-zinc-300">{r.note}</span>
                  <span className="ml-auto shrink-0 text-xs text-zinc-500">{timeAgo(r.created_at as string)}</span>
                </summary>
                <div className="mt-3 rounded-lg bg-zinc-950 p-3">
                  {isEmail ? (
                    <>
                      <p className="text-sm text-zinc-300">
                        <span className="text-zinc-500">to:</span> {String(payload.to ?? "")}
                      </p>
                      <p className="text-sm font-semibold text-zinc-200">{String(payload.subject ?? "")}</p>
                      <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-xs text-zinc-400">
                        {String(payload.body ?? "")}
                      </pre>
                    </>
                  ) : isDraft ? (
                    <>
                      <p className="text-sm font-semibold text-zinc-200">
                        [{String(payload.kind ?? "")}] {String(payload.title ?? "")}
                      </p>
                      <p className="text-xs text-amber-300">needs: {String(payload.needs ?? "")}</p>
                      <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-xs text-zinc-400">
                        {String(payload.content ?? "")}
                      </pre>
                    </>
                  ) : (
                    <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs text-zinc-400">
                      {JSON.stringify(payload, null, 2)}
                    </pre>
                  )}
                </div>
                {!r.reviewed && (
                  <form action={markOutboxReviewed.bind(null, r.id as string)} className="mt-2">
                    <button className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:border-emerald-500">
                      Mark reviewed
                    </button>
                  </form>
                )}
              </details>
            );
          })}
        </div>
      </Section>
    </>
  );
}
