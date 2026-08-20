import { db } from "@/lib/db";
import { ROLES } from "@/lib/roles";
import { createTask, setTaskStatus } from "@/lib/actions";
import { Badge, Section, Table, timeAgo } from "@/components/ui";

export const dynamic = "force-dynamic";

const DEPTS = ["brain", "marketing", "cx", "trivia-ops", "biz-ops"];
const STALL_MS = 48 * 3600 * 1000;

export default async function TasksPage() {
  const d = db();
  const [active, recent] = await Promise.all([
    d.from("tasks").select("*").in("status", ["open", "claimed", "blocked"]).order("priority").order("created_at"),
    d.from("tasks").select("*").in("status", ["done", "archived"]).order("updated_at", { ascending: false }).limit(15),
  ]);

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold">Task queue</h1>
        <p className="text-sm text-zinc-500">
          The org&apos;s message bus. Rows you create here are owner directives — the highest priority input any agent has.
        </p>
      </header>

      <Section title="New directive">
        <form action={createTask} className="grid gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4 lg:grid-cols-2">
          <input name="title" required placeholder="Title — specific and measurable"
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm lg:col-span-2" />
          <textarea name="detail" required rows={2}
            placeholder="Detail — self-contained; the receiving agent has no memory of this conversation"
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm lg:col-span-2" />
          <select name="dept" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">
            {DEPTS.map((x) => (
              <option key={x} value={x}>
                dept: {x}
              </option>
            ))}
          </select>
          <select name="agent" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">
            <option value="">agent: director triages</option>
            {Object.keys(ROLES).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
            <option value="dev-features">dev-features (builder pod)</option>
            <option value="qa-tester">qa-tester (builder pod)</option>
          </select>
          <select name="priority" defaultValue="3" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">
            {[1, 2, 3, 4, 5].map((p) => (
              <option key={p} value={p}>
                priority {p}
              </option>
            ))}
          </select>
          <input name="due" type="date" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" />
          <button className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-zinc-950 lg:col-span-2">
            File directive
          </button>
        </form>
      </Section>

      <Section title={`Active (${active.data?.length ?? 0})`}>
        <Table head={["p", "title", "dept/agent", "status", "age", "by", ""]}>
          {(active.data ?? []).map((t) => {
            const stalled = Date.parse(t.updated_at as string) < Date.now() - STALL_MS;
            return (
              <tr key={t.id} className={stalled ? "bg-red-950/30" : ""}>
                <td className="px-3 py-2 text-zinc-500">{t.priority}</td>
                <td className="px-3 py-2">
                  <details>
                    <summary className="cursor-pointer">{t.title}{stalled && <span className="ml-2 text-xs text-red-400">stalled</span>}</summary>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-500">{t.detail}</p>
                    {t.output_ref && <p className="mt-1 font-mono text-xs text-zinc-500">→ {t.output_ref}</p>}
                  </details>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-zinc-400">
                  {t.dept}
                  {t.agent ? `/${t.agent}` : ""}
                </td>
                <td className="px-3 py-2">
                  <Badge value={t.status as string} />
                </td>
                <td className="px-3 py-2 text-zinc-500">{timeAgo(t.created_at as string)}</td>
                <td className="px-3 py-2 font-mono text-xs text-zinc-500">{t.created_by}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <form action={setTaskStatus.bind(null, t.id as string, "done")}>
                      <button className="rounded border border-zinc-700 px-2 py-0.5 text-xs hover:border-emerald-500">done</button>
                    </form>
                    <form action={setTaskStatus.bind(null, t.id as string, "archived")}>
                      <button className="rounded border border-zinc-800 px-2 py-0.5 text-xs text-zinc-500 hover:border-zinc-600">archive</button>
                    </form>
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      </Section>

      <Section title="Recently closed">
        <Table head={["title", "dept/agent", "status", "closed"]}>
          {(recent.data ?? []).map((t) => (
            <tr key={t.id}>
              <td className="px-3 py-2 text-zinc-400">{t.title}</td>
              <td className="px-3 py-2 font-mono text-xs text-zinc-500">
                {t.dept}
                {t.agent ? `/${t.agent}` : ""}
              </td>
              <td className="px-3 py-2">
                <Badge value={t.status as string} />
              </td>
              <td className="px-3 py-2 text-zinc-500">{timeAgo(t.updated_at as string)}</td>
            </tr>
          ))}
        </Table>
      </Section>
    </>
  );
}
