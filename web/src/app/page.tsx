import Link from "next/link";
import { db } from "@/lib/db";
import { Badge, Section, StatCard, Table, timeAgo, usd } from "@/components/ui";

export const dynamic = "force-dynamic";

const DAY = 24 * 3600 * 1000;

export default async function Overview() {
  const today = new Date().toISOString().slice(0, 10);
  const d = db();
  const [kpis, ledgerToday, runs24, approvals, incidents, events, tasks, brief, requests, heartbeat] =
    await Promise.all([
      d.from("kpis_daily").select("day, metrics, note").order("day", { ascending: false }).limit(1).maybeSingle(),
      d.from("ledger").select("amount_usd").eq("kind", "inference").eq("entry_date", today),
      d.from("runs").select("status").gte("started_at", new Date(Date.now() - DAY).toISOString()),
      d.from("approvals").select("id").eq("status", "pending"),
      d.from("incidents").select("id, severity").eq("status", "open"),
      d.from("events").select("id").is("processed_at", null),
      d.from("tasks").select("id, updated_at").in("status", ["open", "claimed"]),
      d
        .from("outbox_records")
        .select("id, payload, created_at")
        .eq("agent", "ceo")
        .eq("action", "send_email")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      d.from("agent_run_requests").select("id, agent, status, created_at").order("created_at", { ascending: false }).limit(5),
      d.from("org_flags").select("value").eq("key", "daemon_heartbeat").maybeSingle(),
    ]);

  const spendToday = (ledgerToday.data ?? []).reduce((a, r) => a + Math.abs(Number(r.amount_usd)), 0);
  const okRuns = (runs24.data ?? []).filter((r) => r.status === "ok").length;
  const totalRuns = (runs24.data ?? []).length;
  const stalled = (tasks.data ?? []).filter((t) => Date.parse(t.updated_at as string) < Date.now() - 2 * DAY).length;
  const metrics = (kpis.data?.metrics ?? {}) as Record<string, number | null>;
  const briefPayload = (brief.data?.payload ?? null) as { subject?: string; body?: string } | null;
  const hb = (heartbeat.data?.value ?? null) as { at?: string; mode?: string; phase?: string; host?: string } | null;
  const daemonUp = !!hb?.at && Date.now() - Date.parse(hb.at) < 150_000;

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold">Company overview</h1>
        <p className="text-sm text-zinc-500">
          KPI snapshot {kpis.data ? `from ${kpis.data.day}` : "— none yet (run the analyst or ceo)"}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Daemon"
          value={daemonUp ? "LIVE" : "OFFLINE"}
          sub={
            hb?.at
              ? daemonUp
                ? `${hb.mode} · phase ${hb.phase} · ${hb.host}`
                : `last beat ${timeAgo(hb.at)}`
              : "never seen — start it"
          }
          tone={daemonUp ? "good" : "bad"}
        />
        <StatCard
          label="Venue-nights (7d)"
          value={metrics.weekly_active_venue_nights ?? "—"}
          sub="north star"
          tone={(metrics.weekly_active_venue_nights ?? 0) > 0 ? "good" : "warn"}
        />
        <StatCard label="Active venues (28d)" value={metrics.active_venues_28d ?? "—"} />
        <StatCard label="Accounts (7d)" value={metrics.accounts_created_7d ?? "—"} />
        <StatCard
          label="Pack error rate"
          value={metrics.pack_error_rate !== null && metrics.pack_error_rate !== undefined ? `${(Number(metrics.pack_error_rate) * 100).toFixed(2)}%` : "—"}
          sub={`${metrics.shipped_questions ?? 0} shipped questions`}
          tone={(metrics.pack_error_rate ?? 0) < 0.002 ? "good" : "bad"}
        />
        <StatCard label="Spend today" value={usd(spendToday)} sub="inference" />
        <StatCard
          label="Runs (24h)"
          value={totalRuns ? `${okRuns}/${totalRuns} ok` : "0"}
          tone={totalRuns && okRuns === totalRuns ? "good" : totalRuns ? "warn" : "default"}
        />
        <StatCard
          label="Approvals waiting"
          value={approvals.data?.length ?? 0}
          tone={(approvals.data?.length ?? 0) > 0 ? "warn" : "good"}
        />
        <StatCard
          label="Open incidents"
          value={incidents.data?.length ?? 0}
          tone={(incidents.data?.length ?? 0) > 0 ? "bad" : "good"}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Needs you">
          <ul className="flex flex-col gap-2 text-sm">
            <li className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
              <Link href="/approvals" className="text-amber-300 hover:underline">
                {approvals.data?.length ?? 0} approval{(approvals.data?.length ?? 0) === 1 ? "" : "s"} in the queue
              </Link>
            </li>
            <li className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
              {(events.data?.length ?? 0) > 0 ? (
                <span className="text-amber-300">{events.data!.length} unprocessed signup event(s) — CX will sweep hourly</span>
              ) : (
                <span className="text-zinc-400">Signup queue clear</span>
              )}
            </li>
            <li className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
              {stalled > 0 ? (
                <Link href="/tasks" className="text-red-400 hover:underline">
                  {stalled} task(s) stalled &gt;48h
                </Link>
              ) : (
                <span className="text-zinc-400">No stalled tasks</span>
              )}
            </li>
          </ul>
        </Section>

        <Section title="Latest owner brief">
          {briefPayload ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-sm font-semibold text-zinc-200">{briefPayload.subject}</p>
              <p className="text-xs text-zinc-500">{timeAgo(brief.data!.created_at as string)}</p>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-zinc-400">
                {briefPayload.body}
              </pre>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No brief yet — run the CEO from Agents.</p>
          )}
        </Section>
      </div>

      <Section title="Recent run requests">
        <Table head={["agent", "status", "requested"]}>
          {(requests.data ?? []).map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2 font-mono">{r.agent}</td>
              <td className="px-3 py-2">
                <Badge value={r.status as string} />
              </td>
              <td className="px-3 py-2 text-zinc-500">{timeAgo(r.created_at as string)}</td>
            </tr>
          ))}
        </Table>
        {daemonUp ? (
          <p className="text-xs text-zinc-500">The daemon is live — run requests execute within a minute.</p>
        ) : (
          <p className="text-xs text-amber-300">The daemon is OFFLINE — requests queue here until it&apos;s back up.</p>
        )}
      </Section>
    </>
  );
}
