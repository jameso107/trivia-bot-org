import Link from "next/link";
import { db } from "@/lib/db";
import { ROLES, type RoleKey } from "@/lib/roles";
import { requestRun, setAgentPaused } from "@/lib/actions";
import { Badge, Section, Table, timeAgo, usd } from "@/components/ui";
import { ActionButton } from "@/components/action-button";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const d = db();
  const [runs, flags, reqs] = await Promise.all([
    d.from("runs").select("agent, status, started_at, spend_usd").order("started_at", { ascending: false }).limit(200),
    d.from("org_flags").select("value").eq("key", "paused_agents").single(),
    d.from("agent_run_requests").select("agent, status").in("status", ["pending", "started"]),
  ]);
  const paused = new Set<string>(Array.isArray(flags.data?.value) ? (flags.data!.value as string[]) : []);
  const lastRun = new Map<string, { status: string; started_at: string; spend_usd: number }>();
  for (const r of runs.data ?? []) {
    if (!lastRun.has(r.agent as string)) lastRun.set(r.agent as string, r as never);
  }
  // Queue state per agent: requestRun refuses duplicates, and this chip is
  // the visible receipt that a click actually landed.
  const queued = new Map<string, string>();
  for (const q of reqs.data ?? []) queued.set(q.agent as string, q.status as string);

  const roster = Object.entries(ROLES) as [RoleKey, (typeof ROLES)[RoleKey]][];

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold">Agents</h1>
        <p className="text-sm text-zinc-500">
          All {roster.length} registry roles. Phase-gated scheduling; Run now works whenever the daemon is up.
          dev-features &amp; qa-tester execute in the Claude Code builder pod (D-007).
        </p>
      </header>

      <Section title={`Roster (${roster.length} defined)`}>
        <Table head={["agent", "dept", "phase", "cadence", "last run", "spend", "", ""]}>
          {roster.map(([key, role]) => {
            const last = lastRun.get(key);
            const isPaused = paused.has(key);
            return (
              <tr key={key} className={isPaused ? "opacity-50" : ""}>
                <td className="px-3 py-2">
                  <Link href={`/agents/${key}`} className="font-mono text-amber-300 hover:underline">
                    {key}
                  </Link>
                  {isPaused && <span className="ml-2 text-xs text-red-400">paused</span>}
                </td>
                <td className="px-3 py-2 text-zinc-400">{role.dept}</td>
                <td className="px-3 py-2">
                  <Badge value={role.phase} />
                </td>
                <td className="px-3 py-2 font-mono text-xs text-zinc-500">{role.cadence.join(" · ") || "on demand"}</td>
                <td className="px-3 py-2">
                  {last ? (
                    <span>
                      <Badge value={last.status} />{" "}
                      <span className="text-xs text-zinc-500">{timeAgo(last.started_at)}</span>
                    </span>
                  ) : (
                    <span className="text-zinc-600">never</span>
                  )}
                </td>
                <td className="px-3 py-2 text-zinc-400">{last ? usd(last.spend_usd) : "—"}</td>
                <td className="px-3 py-2">
                  <form action={requestRun.bind(null, key)}>
                    <ActionButton
                      pendingText="Queuing…"
                      className="rounded-lg border border-zinc-700 px-2 py-1 text-xs hover:border-amber-400"
                    >
                      Run now
                    </ActionButton>
                  </form>
                  {queued.has(key) && (
                    <span className={`mt-1 block text-[10px] font-semibold ${queued.get(key) === "started" ? "text-sky-300" : "text-amber-300"}`}>
                      {queued.get(key) === "started" ? "running…" : "✓ queued"}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <form action={setAgentPaused.bind(null, key, !isPaused)}>
                    <ActionButton className="rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-400 hover:border-red-500">
                      {isPaused ? "Resume" : "Pause"}
                    </ActionButton>
                  </form>
                </td>
              </tr>
            );
          })}
        </Table>
      </Section>
    </>
  );
}
