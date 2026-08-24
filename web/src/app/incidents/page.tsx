import { db } from "@/lib/db";
import { resolveIncident } from "@/lib/actions";
import { Badge, Section, timeAgo } from "@/components/ui";
import { ActionButton } from "@/components/action-button";

export const dynamic = "force-dynamic";

export default async function IncidentsPage() {
  const { data: incidents } = await db()
    .from("incidents")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  const open = (incidents ?? []).filter((i) => i.status === "open");

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold">Incidents</h1>
        <p className="text-sm text-zinc-500">
          Policy §6: every incident owes a playbook diff within 72h. {open.length} open.
        </p>
      </header>

      <Section title="Log">
        <div className="flex flex-col gap-2">
          {(incidents ?? []).map((i) => (
            <div key={i.id} className={`rounded-xl border px-4 py-3 ${i.status === "open" ? "border-red-900 bg-zinc-900" : "border-zinc-800 bg-zinc-900/50"}`}>
              <div className="flex items-center gap-3">
                <Badge value={i.severity as string} />
                <p className="font-semibold text-zinc-200">{i.title}</p>
                <span className="ml-auto text-xs text-zinc-500">
                  {i.filed_by} · {timeAgo(i.created_at as string)}
                </span>
              </div>
              {i.body && <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-400">{i.body}</p>}
              {i.status === "open" && (
                <form action={resolveIncident.bind(null, i.id as string)} className="mt-2">
                  <ActionButton pendingText="Resolving…" className="rounded-lg border border-zinc-700 px-3 py-1 text-xs hover:border-emerald-500">
                    Mark resolved
                  </ActionButton>
                </form>
              )}
            </div>
          ))}
          {(incidents ?? []).length === 0 && <p className="text-sm text-zinc-500">No incidents ever filed. Either very good or very early.</p>}
        </div>
      </Section>
    </>
  );
}
