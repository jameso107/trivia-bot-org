import { db } from "@/lib/db";
import { Section, StatCard, Table, timeAgo, usd } from "@/components/ui";

export const dynamic = "force-dynamic";

const DAY = 24 * 3600 * 1000;

export default async function MoneyPage() {
  const d = db();
  const since7 = new Date(Date.now() - 7 * DAY).toISOString().slice(0, 10);
  const [ledger, flags] = await Promise.all([
    d.from("ledger").select("*").gte("entry_date", since7).order("entry_date", { ascending: false }).limit(200),
    d.from("org_flags").select("key, value"),
  ]);

  const rows = ledger.data ?? [];
  const spend7 = rows.filter((r) => Number(r.amount_usd) < 0).reduce((a, r) => a + Math.abs(Number(r.amount_usd)), 0);
  const revenue7 = rows.filter((r) => Number(r.amount_usd) > 0).reduce((a, r) => a + Number(r.amount_usd), 0);
  const today = new Date().toISOString().slice(0, 10);
  const spendToday = rows
    .filter((r) => r.entry_date === today && Number(r.amount_usd) < 0)
    .reduce((a, r) => a + Math.abs(Number(r.amount_usd)), 0);

  const byAgent = new Map<string, number>();
  for (const r of rows) {
    if (Number(r.amount_usd) >= 0) continue;
    byAgent.set(r.agent ?? "—", (byAgent.get(r.agent ?? "—") ?? 0) + Math.abs(Number(r.amount_usd)));
  }
  const budgetOverride = flags.data?.find((f) => f.key === "daily_budget_usd_override")?.value;

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold">Money</h1>
        <p className="text-sm text-zinc-500">Inference is payroll. Every run meters itself into the ledger.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Spend today" value={usd(spendToday)} />
        <StatCard label="Spend (7d)" value={usd(spend7)} />
        <StatCard label="Revenue (7d)" value={usd(revenue7)} tone={revenue7 > 0 ? "good" : "default"} />
        <StatCard
          label="Daily budget"
          value={typeof budgetOverride === "number" ? usd(budgetOverride) : "env default"}
          sub={typeof budgetOverride === "number" ? "console override active" : "set an override in Controls"}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Spend by agent (7d)">
          <Table head={["agent", "spend"]}>
            {[...byAgent.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([agent, amt]) => (
                <tr key={agent}>
                  <td className="px-3 py-2 font-mono">{agent}</td>
                  <td className="px-3 py-2">{usd(amt)}</td>
                </tr>
              ))}
          </Table>
        </Section>

        <Section title="Ledger (7d)">
          <Table head={["date", "kind", "agent", "amount", "memo"]}>
            {rows.slice(0, 30).map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 text-zinc-500">{r.entry_date}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.kind}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.agent ?? "—"}</td>
                <td className={`px-3 py-2 ${Number(r.amount_usd) < 0 ? "text-zinc-300" : "text-emerald-400"}`}>
                  {usd(Number(r.amount_usd))}
                </td>
                <td className="max-w-56 truncate px-3 py-2 text-xs text-zinc-500" title={r.memo ?? ""}>
                  {r.memo}
                </td>
              </tr>
            ))}
          </Table>
        </Section>
      </div>
    </>
  );
}
