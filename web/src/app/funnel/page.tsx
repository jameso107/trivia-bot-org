import { db } from "@/lib/db";
import { Badge, Section, StatCard, Table, timeAgo } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function FunnelPage() {
  const d = db();
  const [leads, sponsors, outreach] = await Promise.all([
    d.from("leads").select("*").order("updated_at", { ascending: false }).limit(50),
    d.from("sponsors").select("*").order("created_at", { ascending: false }).limit(25),
    d.from("outreach_events").select("event").limit(500),
  ]);

  const byStatus = new Map<string, number>();
  for (const l of leads.data ?? []) byStatus.set(l.status as string, (byStatus.get(l.status as string) ?? 0) + 1);
  const sent = (outreach.data ?? []).filter((o) => o.event === "sent").length;
  const replied = (outreach.data ?? []).filter((o) => o.event === "replied").length;

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold">Funnel</h1>
        <p className="text-sm text-zinc-500">Leads → replies → activations, and the sponsor pipeline.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Leads (shown)" value={(leads.data ?? []).length} sub={[...byStatus.entries()].map(([s, n]) => `${n} ${s}`).join(" · ") || "none yet"} />
        <StatCard label="Outreach sent" value={sent} sub="all-time (capped view)" />
        <StatCard label="Replies" value={replied} tone={replied > 0 ? "good" : "default"} />
        <StatCard label="Sponsors" value={(sponsors.data ?? []).length} />
      </div>

      <Section title="Recent leads">
        <Table head={["venue", "metro", "score", "status", "contact", "evidence", "updated"]}>
          {(leads.data ?? []).map((l) => (
            <tr key={l.id}>
              <td className="px-3 py-2">{l.venue_name}</td>
              <td className="px-3 py-2 text-zinc-500">{l.metro}</td>
              <td className="px-3 py-2">{l.score ?? "—"}</td>
              <td className="px-3 py-2">
                <Badge value={l.status as string} />
              </td>
              <td className="px-3 py-2 text-xs text-zinc-500">{l.contact_email ?? l.contact_name ?? "—"}</td>
              <td className="px-3 py-2 text-xs">
                {Array.isArray(l.evidence) && l.evidence.length > 0 ? (
                  <details>
                    <summary className="cursor-pointer text-zinc-400">{l.evidence.length} item(s)</summary>
                    <ul className="mt-1 flex flex-col gap-1">
                      {(l.evidence as Array<{ note: string; source_url: string }>).map((e, i) => (
                        <li key={i}>
                          <a href={e.source_url} target="_blank" rel="noreferrer" className="text-amber-300 hover:underline">
                            {e.note}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-3 py-2 text-zinc-500">{timeAgo(l.updated_at as string)}</td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="Sponsor pipeline">
        <Table head={["business", "status", "package", "mrr", "contact"]}>
          {(sponsors.data ?? []).map((s) => (
            <tr key={s.id}>
              <td className="px-3 py-2">{s.business}</td>
              <td className="px-3 py-2">
                <Badge value={s.status as string} />
              </td>
              <td className="px-3 py-2 text-zinc-500">{s.package ?? "—"}</td>
              <td className="px-3 py-2 text-zinc-400">{s.mrr_usd ? `$${s.mrr_usd}` : "—"}</td>
              <td className="px-3 py-2 text-xs text-zinc-500">{s.contact_email ?? "—"}</td>
            </tr>
          ))}
        </Table>
      </Section>
    </>
  );
}
