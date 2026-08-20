import { db } from "@/lib/db";
import { Badge, Section, Table, timeAgo, usd } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const { data: runs } = await db()
    .from("runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(60);

  const total = (runs ?? []).reduce((a, r) => a + Number(r.spend_usd ?? 0), 0);

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold">Runs</h1>
        <p className="text-sm text-zinc-500">
          Every agent turn, its outcome, and its full report. Last {(runs ?? []).length} · {usd(total)} total inference shown.
        </p>
      </header>

      <Section title="History">
        <div className="flex flex-col gap-2">
          {(runs ?? []).map((r) => (
            <details key={r.id} className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
              <summary className="flex cursor-pointer items-center gap-3 text-sm">
                <span className="w-40 font-mono text-amber-300">{r.agent}</span>
                <Badge value={r.status as string} />
                <span className="text-zinc-500">{timeAgo(r.started_at as string)}</span>
                <span className="ml-auto text-zinc-400">{usd(r.spend_usd as number)}</span>
              </summary>
              <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-950 p-3 text-xs text-zinc-400">
                {r.notes ?? "(no report captured)"}
              </pre>
            </details>
          ))}
        </div>
      </Section>
    </>
  );
}
