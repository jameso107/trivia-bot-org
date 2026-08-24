import { db } from "@/lib/db";
import { ROLES, type RoleKey } from "@/lib/roles";
import { timeAgo, usd } from "@/components/ui";
import { AutoRefresh } from "@/components/auto-refresh";
import { OrgChart, type ChartData, type ChartNode } from "./chart";

export const dynamic = "force-dynamic";

const PHASE_ORDER = { A: 0, B: 1, C: 2 } as const;

// One demo-legible line per card. Registry cards carry the full missions;
// these are the elevator versions.
const BLURBS: Record<string, string> = {
  ceo: "runs the company, briefs the owner",
  "chief-of-staff": "unsticks stalled work",
  analyst: "one truthful KPI snapshot",
  auditor: "adversarial weekly audit",
  "marketing-director": "owns the funnel",
  "venue-search": "finds & qualifies venues",
  "lead-prospector": "grinds lead shards at volume",
  "venue-outreach": "sequences approved outreach",
  "social-media": "drafts the public voice",
  "user-growth": "QR→account experiments",
  "ads-recruit": "finds sponsor prospects",
  "ads-outreach": "pitches sponsor packages",
  "website-content": "SEO pages & city guides",
  "cx-director": "owns activation & retention",
  "venue-success": "onboarding & signup watch",
  "user-support": "feedback queue triage",
  "ads-support": "sponsor campaign health",
  "trivia-ops-director": "owns product quality",
  "trivia-creation": "authors question packs",
  "trivia-qa": "verifies packs, rules disputes",
  "dev-maintenance": "triages product health",
  "ads-implementation": "specs ad-slot work",
  "bizops-director": "owns money & obligations",
  finance: "meters every dollar",
  contracts: "drafts paper, never signs",
  "data-steward": "guards privacy & data",
  "ad-sales": "closes sponsor revenue",
  "dev-features": "ships product features",
  "qa-tester": "release verification",
};

interface RunRow {
  agent: string;
  status: string;
  started_at: string;
  spend_usd: number | null;
}

export default async function OrgPage() {
  const d = db();
  const todayStart = `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
  const [runsQ, pausedQ, hbQ, ledgerQ] = await Promise.all([
    d.from("runs").select("agent, status, started_at, spend_usd").order("started_at", { ascending: false }).limit(300),
    d.from("org_flags").select("value").eq("key", "paused_agents").maybeSingle(),
    d.from("org_flags").select("value").eq("key", "daemon_heartbeat").maybeSingle(),
    d.from("ledger").select("amount_usd").eq("kind", "inference").gte("entry_date", todayStart.slice(0, 10)),
  ]);

  const runs = (runsQ.data ?? []) as RunRow[];
  const paused = new Set<string>(Array.isArray(pausedQ.data?.value) ? (pausedQ.data!.value as string[]) : []);
  const hb = (hbQ.data?.value ?? null) as { at?: string; mode?: string; phase?: string; host?: string } | null;
  const daemonUp = !!hb?.at && Date.now() - Date.parse(hb.at) < 150_000;
  const orgPhase = (hb?.phase === "B" || hb?.phase === "C" ? hb.phase : "A") as "A" | "B" | "C";
  const spendToday = (ledgerQ.data ?? []).reduce((a, r) => a + Math.abs(Number(r.amount_usd)), 0);

  const lastRun = new Map<string, RunRow>();
  const runsToday = new Map<string, number>();
  for (const r of runs) {
    if (!lastRun.has(r.agent)) lastRun.set(r.agent, r);
    if (r.started_at >= todayStart) runsToday.set(r.agent, (runsToday.get(r.agent) ?? 0) + 1);
  }

  const node = (key: string): ChartNode => {
    const role = ROLES[key as RoleKey];
    const last = lastRun.get(key);
    return {
      key,
      blurb: BLURBS[key] ?? "",
      model: role.model?.includes("terra") ? "terra" : "luna",
      phase: role.phase,
      stat: {
        status: last?.status ?? null,
        when: last?.started_at ?? null,
        spendUsd: last?.spend_usd !== null && last?.spend_usd !== undefined ? Number(last.spend_usd) : null,
        runsToday: runsToday.get(key) ?? 0,
        running: last?.status === "running",
        paused: paused.has(key),
        benched: PHASE_ORDER[role.phase] > PHASE_ORDER[orgPhase],
      },
    };
  };
  const podNode = (key: "dev-features" | "qa-tester"): ChartNode => ({
    key,
    blurb: BLURBS[key],
    model: "luna",
    phase: "A",
    pod: true,
    stat: null,
  });

  const reportsOf = (dept: string, director: string | null): ChartNode[] =>
    (Object.entries(ROLES) as [RoleKey, (typeof ROLES)[RoleKey]][])
      .filter(([k, r]) => r.dept === dept && k !== director && k !== "ceo")
      .map(([k]) => node(k));

  const data: ChartData = {
    ownerLine: "approves, signs, pays — the only human",
    ceo: node("ceo"),
    cols: [
      { label: "Brain staff", director: null, reports: reportsOf("brain", null) },
      { label: "Marketing", director: node("marketing-director"), reports: reportsOf("marketing", "marketing-director") },
      { label: "Customer", director: node("cx-director"), reports: reportsOf("cx", "cx-director") },
      {
        label: "Trivia Ops",
        director: node("trivia-ops-director"),
        reports: [...reportsOf("trivia-ops", "trivia-ops-director"), podNode("dev-features"), podNode("qa-tester")],
      },
      { label: "Biz Ops", director: node("bizops-director"), reports: reportsOf("biz-ops", "bizops-director") },
    ],
  };

  const defined = Object.keys(ROLES).length + 2; // + the two builder-pod cards
  const runningNow = runs.filter((r) => r.status === "running").length;

  return (
    <>
      <AutoRefresh seconds={20} />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Org chart</h1>
          <p className="text-sm text-zinc-500">
            {defined} roles · live from the runs table · refreshes every 20s
            {runningNow > 0 && <span className="text-sky-300"> · {runningNow} running now</span>}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-right">
          <p className={`text-sm font-black ${daemonUp ? "text-emerald-400" : "text-red-400"}`}>
            {daemonUp ? "DAEMON LIVE" : "DAEMON OFFLINE"}
          </p>
          <p className="text-[11px] text-zinc-500">
            {hb?.at
              ? daemonUp
                ? `${hb.mode} · phase ${hb.phase} · spend today ${usd(spendToday)}`
                : `last beat ${timeAgo(hb.at)}`
              : "never seen"}
          </p>
        </div>
      </header>
      <OrgChart data={data} />
    </>
  );
}
