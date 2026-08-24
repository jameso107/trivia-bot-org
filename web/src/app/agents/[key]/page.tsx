import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ROLES, type RoleKey } from "@/lib/roles";
import { requestRun, setAgentPaused } from "@/lib/actions";
import { Badge, Section, Table, timeAgo, usd } from "@/components/ui";
import { ActionButton } from "@/components/action-button";

export const dynamic = "force-dynamic";

export default async function AgentDetail({ params }: PageProps<"/agents/[key]">) {
  const { key } = await params;
  if (!(key in ROLES)) notFound();
  const role = ROLES[key as RoleKey];
  const d = db();
  const [runs, tasks, outbox, flags] = await Promise.all([
    d.from("runs").select("id, status, started_at, finished_at, spend_usd, notes").eq("agent", key).order("started_at", { ascending: false }).limit(10),
    d.from("tasks").select("id, title, status, priority, created_at").eq("agent", key).order("created_at", { ascending: false }).limit(10),
    d.from("outbox_records").select("id, action, note, created_at").eq("agent", key).order("created_at", { ascending: false }).limit(10),
    d.from("org_flags").select("value").eq("key", "paused_agents").single(),
  ]);
  const isPaused = Array.isArray(flags.data?.value) && (flags.data!.value as string[]).includes(key);

  return (
    <>
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-mono text-3xl font-bold">{key}</h1>
          <p className="text-sm text-zinc-500">
            {role.dept} · phase <Badge value={role.phase} /> ·{" "}
            <span className="font-mono text-xs">{role.cadence.join(" · ") || "on demand"}</span>
            {role.webSearch && " · web search"}
            {isPaused && <span className="ml-2 font-bold text-red-400">PAUSED</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <form action={requestRun.bind(null, key)}>
            <ActionButton pendingText="Queuing…" className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-bold text-zinc-950">
              Run now
            </ActionButton>
          </form>
          <form action={setAgentPaused.bind(null, key, !isPaused)}>
            <ActionButton className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-red-500">
              {isPaused ? "Resume" : "Pause"}
            </ActionButton>
          </form>
        </div>
      </header>

      <Section title="Mandate">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-300">
          <p className="whitespace-pre-wrap">{role.goal}</p>
          <p className="mt-3 text-xs text-zinc-500">
            tools: <span className="font-mono">{role.tools.join(", ")}</span>
          </p>
          <p className="text-xs text-zinc-500">
            doctrine: <span className="font-mono">{role.docs.join(", ")}</span>
          </p>
        </div>
      </Section>

      <Section title="Recent runs">
        <div className="flex flex-col gap-2">
          {(runs.data ?? []).map((r) => (
            <details key={r.id} className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
              <summary className="cursor-pointer text-sm">
                <Badge value={r.status as string} />{" "}
                <span className="text-zinc-400">{timeAgo(r.started_at as string)}</span>{" "}
                <span className="text-zinc-500">· {usd(r.spend_usd as number)}</span>
              </summary>
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-xs text-zinc-400">
                {r.notes ?? "(no report)"}
              </pre>
            </details>
          ))}
          {(runs.data ?? []).length === 0 && <p className="text-sm text-zinc-500">No runs yet.</p>}
        </div>
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Assigned tasks">
          <Table head={["title", "status", "p", "created"]}>
            {(tasks.data ?? []).map((t) => (
              <tr key={t.id}>
                <td className="px-3 py-2">{t.title}</td>
                <td className="px-3 py-2">
                  <Badge value={t.status as string} />
                </td>
                <td className="px-3 py-2 text-zinc-500">{t.priority}</td>
                <td className="px-3 py-2 text-zinc-500">{timeAgo(t.created_at as string)}</td>
              </tr>
            ))}
          </Table>
        </Section>
        <Section title="Recent outbox">
          <Table head={["action", "note", "when"]}>
            {(outbox.data ?? []).map((o) => (
              <tr key={o.id}>
                <td className="px-3 py-2 font-mono text-xs">{o.action}</td>
                <td className="px-3 py-2 text-zinc-400">{o.note}</td>
                <td className="px-3 py-2 text-zinc-500">{timeAgo(o.created_at as string)}</td>
              </tr>
            ))}
          </Table>
        </Section>
      </div>
    </>
  );
}
