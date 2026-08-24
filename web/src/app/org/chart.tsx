// The org chart, purely presentational: the page assembles ChartData from the
// live tables and this renders it. No server imports on purpose — it can be
// rendered standalone (that's how it's verified) and stays demo-portable.

export interface NodeStat {
  status: string | null; // last run status; null = never ran
  when: string | null; // ISO of last run start
  spendUsd: number | null;
  runsToday: number;
  running: boolean;
  paused: boolean;
  benched: boolean; // defined but not scheduled at the current org phase
}

export interface ChartNode {
  key: string;
  blurb: string;
  model: "terra" | "luna";
  phase: "A" | "B" | "C";
  pod?: boolean; // executes in the owner's Claude Code builder pod (D-007)
  stat: NodeStat | null; // pod nodes carry no run stats
}

export interface ChartCol {
  label: string;
  director: ChartNode | null; // brain staff hang straight off the CEO
  reports: ChartNode[];
}

export interface ChartData {
  ownerLine: string;
  ceo: ChartNode;
  cols: ChartCol[];
}

// Dense-card formatters (shorter than the console-wide helpers by design).
function ago(iso: string | null): string {
  if (!iso) return "";
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 90) return `${Math.max(1, Math.round(s))}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  if (s < 129600) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
const money = (n: number) => `$${n.toFixed(n !== 0 && n < 0.01 ? 4 : 2)}`;

function dotClass(n: ChartNode): string {
  if (n.pod) return "bg-violet-400";
  const s = n.stat;
  if (!s || !s.status) return "bg-zinc-600";
  if (s.running) return "animate-pulse bg-sky-400";
  if (s.status === "ok") return "bg-emerald-400";
  if (s.status === "failed") return "bg-red-500";
  return "bg-amber-400"; // killed = cap/kill-switch, not a crash
}

function statLine(n: ChartNode): string {
  if (n.pod) return "runs in the builder pod (D-007)";
  const s = n.stat;
  if (!s || !s.status) return "never run";
  const today = s.runsToday > 0 ? ` · ${s.runsToday} today` : "";
  if (s.running) return `running now${today}`;
  const spend = s.spendUsd !== null ? ` · ${money(s.spendUsd)}` : "";
  return `${s.status} ${ago(s.when)}${spend}${today}`;
}

function Chip({ text, tone }: { text: string; tone: "amber" | "violet" | "red" | "zinc" }) {
  const cls =
    tone === "amber"
      ? "border-amber-800 text-amber-300"
      : tone === "violet"
        ? "border-violet-800 text-violet-300"
        : tone === "red"
          ? "border-red-900 text-red-400"
          : "border-zinc-700 text-zinc-500";
  return (
    <span className={`inline-block rounded-full border px-1.5 py-px text-[10px] font-semibold leading-4 ${cls}`}>
      {text}
    </span>
  );
}

function NodeCard({ n, emphasis = false }: { n: ChartNode; emphasis?: boolean }) {
  const dim = n.stat?.benched || n.stat?.paused;
  const frame = n.stat?.paused
    ? "border-red-900/70"
    : n.stat?.benched
      ? "border-dashed border-zinc-800"
      : emphasis
        ? "border-amber-900/70"
        : "border-zinc-800";
  const ring = n.stat?.running ? " ring-1 ring-sky-500/50" : "";
  const inner = (
    <div className={`rounded-xl border bg-zinc-900 px-3 py-2 transition-colors ${frame}${ring} ${dim ? "opacity-45" : ""} ${n.pod ? "" : "hover:border-amber-500/60"}`}>
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass(n)}`} />
        <span className="break-words font-mono text-[13px] font-semibold leading-tight text-zinc-100">{n.key}</span>
        <span className="ml-auto shrink-0">
          <Chip text={n.pod ? "pod" : n.model} tone={n.pod ? "violet" : n.model === "terra" ? "amber" : "zinc"} />
        </span>
      </div>
      <p className="mt-0.5 truncate text-[11px] leading-4 text-zinc-500">{n.blurb}</p>
      <p className="mt-1 truncate text-[11px] leading-4 text-zinc-400">{statLine(n)}</p>
      {(n.stat?.paused || n.stat?.benched) && (
        <p className="mt-1 flex gap-1">
          {n.stat?.paused && <Chip text="paused" tone="red" />}
          {n.stat?.benched && <Chip text={`phase ${n.phase} — benched`} tone="zinc" />}
        </p>
      )}
    </div>
  );
  // Pod cards have no /agents detail page; everything else links to one.
  return n.pod ? inner : <a href={`/agents/${n.key}`}>{inner}</a>;
}

export function OrgChart({ data }: { data: ChartData }) {
  return (
    <div className="overflow-x-auto pb-2">
      <div className="min-w-[1060px]">
        {/* Owner */}
        <div className="mx-auto w-64 rounded-xl border border-amber-700/60 bg-zinc-900 px-3 py-2 text-center">
          <p className="font-mono text-[13px] font-semibold text-amber-300">James · owner</p>
          <p className="text-[11px] text-zinc-500">{data.ownerLine}</p>
        </div>
        <div className="mx-auto h-5 w-px bg-zinc-700" />

        {/* CEO */}
        <div className="mx-auto w-72">
          <NodeCard n={data.ceo} emphasis />
        </div>
        <div className="mx-auto h-5 w-px bg-zinc-700" />

        {/* Spine + departments (5 equal columns; spine spans their centers) */}
        <div className="relative">
          <div className="absolute left-[10%] right-[10%] top-0 h-px bg-zinc-700" />
          <div className="grid grid-cols-5 gap-3">
            {data.cols.map((col) => (
              <div key={col.label} className="min-w-0">
                <div className="mx-auto h-4 w-px bg-zinc-700" />
                <p className="mb-1 text-center text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                  {col.label}
                </p>
                {col.director && <NodeCard n={col.director} emphasis />}
                <ul className={`flex flex-col gap-2 border-l border-zinc-800 pl-3 ${col.director ? "ml-4 mt-2" : "ml-4"}`}>
                  {col.reports.map((n) => (
                    <li key={n.key} className="relative">
                      <span className="absolute -left-[13px] top-1/2 h-px w-[13px] bg-zinc-800" />
                      <NodeCard n={n} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Legend — the demo cheat-sheet */}
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400" /> last run ok</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 animate-pulse rounded-full bg-sky-400" /> running now</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" /> capped/killed</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" /> failed</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-zinc-600" /> never run</span>
          <Chip text="terra" tone="amber" /> <span className="-ml-2">judgment model</span>
          <Chip text="pod" tone="violet" /> <span className="-ml-2">builder pod (D-007)</span>
          <span>dashed = future hire (benched until its phase)</span>
        </div>
      </div>
    </div>
  );
}
