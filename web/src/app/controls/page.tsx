import { db } from "@/lib/db";
import { setBudgetOverride, setKillSwitch, setMonthlyBudgetOverride } from "@/lib/actions";
import { Section, timeAgo } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ControlsPage() {
  const { data: flags } = await db().from("org_flags").select("*").order("key");
  const flag = (k: string) => flags?.find((f) => f.key === k);
  const killed = flag("kill_switch")?.value === true;
  const paused = (flag("paused_agents")?.value as string[] | undefined) ?? [];
  const budget = flag("daily_budget_usd_override")?.value;
  const monthlyBudget = flag("monthly_budget_usd_override")?.value;
  const hb = flag("daemon_heartbeat")?.value as
    | { at?: string; up_since?: string; mode?: string; phase?: string; model?: string; host?: string }
    | undefined;
  const daemonUp = !!hb?.at && Date.now() - Date.parse(hb.at) < 150_000;

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold">Controls</h1>
        <p className="text-sm text-zinc-500">
          The org_flags control plane. The daemon re-reads these before EVERY run — changes bite within a minute.
        </p>
      </header>

      <Section title="Daemon host">
        <div className={`rounded-xl border p-5 ${daemonUp ? "border-zinc-800 bg-zinc-900" : "border-amber-800 bg-amber-950/40"}`}>
          <p className="text-lg font-bold">{daemonUp ? "🟢 Daemon LIVE" : "🟡 Daemon OFFLINE"}</p>
          {hb?.at ? (
            <p className="mt-1 text-sm text-zinc-400">
              <span className="font-mono">{hb.host}</span> · mode <span className="font-mono">{hb.mode}</span> · phase{" "}
              <span className="font-mono">{hb.phase}</span> · model <span className="font-mono">{hb.model}</span> · last
              beat {timeAgo(hb.at)}
              {hb.up_since ? ` · up since ${new Date(hb.up_since).toLocaleString("en-US", { timeZone: "America/Detroit" })} ET` : ""}
            </p>
          ) : (
            <p className="mt-1 text-sm text-zinc-400">No heartbeat has ever been written — the daemon has not run since this feature shipped.</p>
          )}
          <p className="mt-2 text-xs text-zinc-500">
            Heartbeats write to org_flags every minute. Mode, phase, and model are env vars on the daemon&apos;s host
            (Railway → Variables → redeploy) — deliberate restarts, not remote switches. Run exactly ONE daemon at a
            time: cloud up means the laptop copy stays off.
          </p>
        </div>
      </Section>

      <Section title="Kill switch">
        <div className={`flex items-center justify-between rounded-xl border p-5 ${killed ? "border-red-800 bg-red-950" : "border-zinc-800 bg-zinc-900"}`}>
          <div>
            <p className="text-lg font-bold">{killed ? "⛔ ALL AGENT RUNS REFUSED" : "Org is running"}</p>
            <p className="text-sm text-zinc-400">
              {killed
                ? "Scheduled and requested runs are skipped until you flip this back."
                : "One click pauses every scheduled and requested run (blueprint §5)."}
            </p>
            {flag("kill_switch") && (
              <p className="mt-1 text-xs text-zinc-500">changed {timeAgo(flag("kill_switch")!.updated_at as string)}</p>
            )}
          </div>
          <form action={setKillSwitch.bind(null, !killed)}>
            <button
              className={`rounded-xl px-5 py-2.5 font-bold ${killed ? "bg-emerald-500 text-zinc-950" : "border border-red-800 text-red-400 hover:bg-red-950"}`}
            >
              {killed ? "Resume the org" : "KILL"}
            </button>
          </form>
        </div>
      </Section>

      <Section title="Paused agents">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm">
          {paused.length === 0 ? (
            <p className="text-zinc-500">None — pause individual agents from the Agents page.</p>
          ) : (
            <p className="font-mono text-amber-300">{paused.join(", ")}</p>
          )}
        </div>
      </Section>

      <Section title="Daily inference budget override">
        <form action={setBudgetOverride} className="flex items-end gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <label className="flex flex-col gap-1 text-sm text-zinc-300">
            USD per day (empty = use the daemon&apos;s env default)
            <input
              name="budget"
              type="number"
              step="0.5"
              min="0"
              defaultValue={typeof budget === "number" ? budget : ""}
              className="w-40 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
            />
          </label>
          <button className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-zinc-950">Save</button>
          <p className="ml-auto max-w-sm text-xs text-zinc-500">
            Policies §2: at 100% of budget the org stops and escalates. This override raises or lowers the daily cap without touching the daemon host.
          </p>
        </form>
      </Section>

      <Section title="Monthly inference budget override">
        <form action={setMonthlyBudgetOverride} className="flex items-end gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <label className="flex flex-col gap-1 text-sm text-zinc-300">
            USD per calendar month (empty = daemon default, $100)
            <input
              name="budget"
              type="number"
              step="5"
              min="0"
              defaultValue={typeof monthlyBudget === "number" ? monthlyBudget : ""}
              className="w-40 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
            />
          </label>
          <button className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-zinc-950">Save</button>
          <p className="ml-auto max-w-sm text-xs text-zinc-500">
            The month-to-date ledger is checked before every run — at the cap the org halts until the calendar flips or you raise this.
          </p>
        </form>
      </Section>

      <Section title="Notes">
        <ul className="flex flex-col gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
          <li>• ORG_PHASE (hiring waves) and ORG_MODE (dry/live) are deliberate restarts on the daemon host — not remote switches.</li>
          <li>• Outreach sending additionally requires OUTREACH_ENABLED on the daemon plus an approved canary — three locks, all in code.</li>
          <li>• This console holds the service key server-side. Keep the passcode strong; enable Vercel Authentication for a second lock.</li>
        </ul>
      </Section>
    </>
  );
}
