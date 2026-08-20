import Link from "next/link";
import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const toneCls =
    tone === "good"
      ? "text-emerald-400"
      : tone === "warn"
        ? "text-amber-300"
        : tone === "bad"
          ? "text-red-400"
          : "text-zinc-50";
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs uppercase tracking-wider text-zinc-400">{label}</p>
      <p className={`mt-1 text-2xl font-black ${toneCls}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

const BADGE_TONES: Record<string, string> = {
  // runs / requests
  ok: "border-emerald-800 text-emerald-400",
  done: "border-emerald-800 text-emerald-400",
  running: "border-amber-800 text-amber-300",
  started: "border-amber-800 text-amber-300",
  pending: "border-amber-800 text-amber-300",
  failed: "border-red-900 text-red-400",
  killed: "border-red-900 text-red-400",
  skipped: "border-zinc-700 text-zinc-400",
  // tasks
  open: "border-amber-800 text-amber-300",
  claimed: "border-sky-800 text-sky-300",
  blocked: "border-red-900 text-red-400",
  archived: "border-zinc-700 text-zinc-500",
  // approvals / incidents / packs / disputes / feedback / leads
  approved: "border-emerald-800 text-emerald-400",
  rejected: "border-red-900 text-red-400",
  expired: "border-zinc-700 text-zinc-500",
  resolved: "border-emerald-800 text-emerald-400",
  low: "border-zinc-700 text-zinc-300",
  med: "border-amber-800 text-amber-300",
  high: "border-red-900 text-red-400",
  critical: "border-red-700 text-red-300",
  live: "border-emerald-800 text-emerald-400",
  qa_pending: "border-amber-800 text-amber-300",
  draft: "border-zinc-700 text-zinc-400",
  retired: "border-zinc-700 text-zinc-500",
  upheld: "border-red-900 text-red-400",
  new: "border-amber-800 text-amber-300",
  triaged: "border-sky-800 text-sky-300",
  enriched: "border-emerald-800 text-emerald-400",
  suppressed: "border-red-900 text-red-400",
  // phases
  A: "border-emerald-800 text-emerald-400",
  B: "border-amber-800 text-amber-300",
  C: "border-zinc-700 text-zinc-400",
};

export function Badge({ value }: { value: string }) {
  const tone = BADGE_TONES[value] ?? "border-zinc-700 text-zinc-300";
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${tone}`}>
      {value}
    </span>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-200">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-zinc-900 text-xs uppercase tracking-wider text-zinc-400">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800 text-zinc-300">{children}</tbody>
      </table>
    </div>
  );
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 90) return `${Math.max(1, Math.round(s))}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  if (s < 129600) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function usd(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `$${Number(n).toFixed(Math.abs(Number(n)) < 1 ? 4 : 2)}`;
}

export function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900 hover:text-amber-300"
    >
      {label}
    </Link>
  );
}
