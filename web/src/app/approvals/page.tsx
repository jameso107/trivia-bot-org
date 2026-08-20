import { db } from "@/lib/db";
import { decideApproval } from "@/lib/actions";
import { Badge, Section, timeAgo } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const d = db();
  const [pending, decided] = await Promise.all([
    d.from("approvals").select("*").eq("status", "pending").order("created_at"),
    d.from("approvals").select("*").neq("status", "pending").order("decided_at", { ascending: false }).limit(15),
  ]);

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold">Approvals</h1>
        <p className="text-sm text-zinc-500">
          The owner queue (policies §1) — agents drafted these and are waiting. Your 15 minutes a day.
        </p>
      </header>

      <Section title={`Waiting on you (${pending.data?.length ?? 0})`}>
        <div className="flex flex-col gap-3">
          {(pending.data ?? []).map((a) => (
            <div key={a.id} className="rounded-xl border border-amber-900 bg-zinc-900 p-4">
              <div className="flex items-center justify-between gap-4">
                <p className="font-semibold text-zinc-100">{a.summary}</p>
                <span className="shrink-0 font-mono text-xs text-zinc-500">{a.action_class}</span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                requested by <span className="font-mono">{a.requested_by}</span> · {timeAgo(a.created_at)}
              </p>
              {a.recommendation && (
                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-950 p-3 text-xs text-zinc-400">
                  {a.recommendation}
                </pre>
              )}
              <div className="mt-3 flex items-end gap-2">
                <form action={decideApproval.bind(null, a.id as string, "approved")} className="flex items-end gap-2">
                  <input
                    name="note"
                    placeholder="note (optional)"
                    className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
                  />
                  <button className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-bold text-zinc-950">
                    Approve
                  </button>
                </form>
                <form action={decideApproval.bind(null, a.id as string, "rejected")}>
                  <input type="hidden" name="note" value="" />
                  <button className="rounded-lg border border-red-800 px-3 py-1.5 text-sm text-red-400 hover:bg-red-950">
                    Reject
                  </button>
                </form>
              </div>
            </div>
          ))}
          {(pending.data ?? []).length === 0 && (
            <p className="text-sm text-zinc-500">Queue is empty — the org is fully unblocked.</p>
          )}
        </div>
      </Section>

      <Section title="Recently decided">
        <div className="flex flex-col gap-2">
          {(decided.data ?? []).map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm">
              <span className="text-zinc-300">{a.summary}</span>
              <span className="flex items-center gap-2 text-xs text-zinc-500">
                <Badge value={a.status as string} /> {timeAgo(a.decided_at as string)}
              </span>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
