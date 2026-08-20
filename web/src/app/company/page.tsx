import { db } from "@/lib/db";
import { Badge, Section, StatCard, Table, timeAgo } from "@/components/ui";

export const dynamic = "force-dynamic";

// The product through the org's eyes: venue health, the signup event queue,
// the content pipeline, and the player-facing quality queues.
export default async function CompanyPage() {
  const d = db();
  const [venues, events, packs, disputes, feedback, requests] = await Promise.all([
    d.from("venues").select("id, name, metro, status, first_night, last_night, nights_run, slug").order("nights_run", { ascending: false }).limit(40),
    d.from("events").select("*").order("created_at", { ascending: false }).limit(20),
    d.from("packs").select("id, title, topic, status, question_count, created_by, created_at").order("created_at", { ascending: false }).limit(25),
    d.from("question_disputes").select("id, status, claim, ruling_note, created_at").order("created_at", { ascending: false }).limit(15),
    d.from("feedback").select("id, source, body, status, created_at").order("created_at", { ascending: false }).limit(15),
    d.from("custom_pack_requests").select("id, topic, status, requested_at").order("requested_at", { ascending: false }).limit(10),
  ]);

  const unprocessed = (events.data ?? []).filter((e) => !e.processed_at).length;

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold">Company</h1>
        <p className="text-sm text-zinc-500">Venues, the signup queue, and the content pipeline.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Venues" value={(venues.data ?? []).length} />
        <StatCard label="Unprocessed events" value={unprocessed} tone={unprocessed > 0 ? "warn" : "good"} />
        <StatCard label="Live packs" value={(packs.data ?? []).filter((p) => p.status === "live").length} sub={`${(packs.data ?? []).filter((p) => p.status === "qa_pending").length} in QA`} />
        <StatCard label="Open disputes" value={(disputes.data ?? []).filter((x) => x.status === "open").length} />
      </div>

      <Section title="Venues">
        <Table head={["venue", "metro", "status", "slug", "first night", "last night", "nights"]}>
          {(venues.data ?? []).map((v) => (
            <tr key={v.id}>
              <td className="px-3 py-2">{v.name}</td>
              <td className="px-3 py-2 text-zinc-500">{v.metro}</td>
              <td className="px-3 py-2">
                <Badge value={v.status as string} />
              </td>
              <td className="px-3 py-2 font-mono text-xs text-zinc-500">{v.slug ? `/v/${v.slug}` : "—"}</td>
              <td className="px-3 py-2 text-zinc-500">{v.first_night ?? "—"}</td>
              <td className="px-3 py-2 text-zinc-500">{v.last_night ?? "—"}</td>
              <td className="px-3 py-2">{v.nights_run}</td>
            </tr>
          ))}
        </Table>
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Org event queue">
          <Table head={["kind", "payload", "state", "when"]}>
            {(events.data ?? []).map((e) => (
              <tr key={e.id}>
                <td className="px-3 py-2 font-mono text-xs">{e.kind}</td>
                <td className="max-w-52 truncate px-3 py-2 text-xs text-zinc-500" title={JSON.stringify(e.payload)}>
                  {JSON.stringify(e.payload)}
                </td>
                <td className="px-3 py-2">{e.processed_at ? <Badge value="done" /> : <Badge value="pending" />}</td>
                <td className="px-3 py-2 text-zinc-500">{timeAgo(e.created_at as string)}</td>
              </tr>
            ))}
          </Table>
        </Section>

        <Section title="Content pipeline">
          <Table head={["pack", "status", "questions", "by", "when"]}>
            {(packs.data ?? []).map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2">{p.title}</td>
                <td className="px-3 py-2">
                  <Badge value={p.status as string} />
                </td>
                <td className="px-3 py-2 text-zinc-500">{p.question_count}</td>
                <td className="px-3 py-2 font-mono text-xs text-zinc-500">{p.created_by}</td>
                <td className="px-3 py-2 text-zinc-500">{timeAgo(p.created_at as string)}</td>
              </tr>
            ))}
          </Table>
          {(requests.data ?? []).length > 0 && (
            <p className="text-xs text-zinc-500">
              Custom requests:{" "}
              {(requests.data ?? []).map((r) => `“${r.topic}” (${r.status})`).join(" · ")}
            </p>
          )}
        </Section>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Disputes (trivia-qa's queue)">
          <div className="flex flex-col gap-2 text-sm">
            {(disputes.data ?? []).map((x) => (
              <div key={x.id} className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2">
                <div className="flex items-center gap-2">
                  <Badge value={x.status as string} />
                  <span className="text-zinc-400">{x.claim ?? "(one-tap challenge, no claim text)"}</span>
                  <span className="ml-auto text-xs text-zinc-500">{timeAgo(x.created_at as string)}</span>
                </div>
                {x.ruling_note && <p className="mt-1 text-xs text-zinc-500">{x.ruling_note}</p>}
              </div>
            ))}
            {(disputes.data ?? []).length === 0 && <p className="text-zinc-500">No challenges filed.</p>}
          </div>
        </Section>

        <Section title="Feedback (user-support's queue)">
          <div className="flex flex-col gap-2 text-sm">
            {(feedback.data ?? []).map((f) => (
              <div key={f.id} className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2">
                <div className="flex items-center gap-2">
                  <Badge value={f.status as string} />
                  <span className="font-mono text-xs text-zinc-500">{f.source}</span>
                  <span className="ml-auto text-xs text-zinc-500">{timeAgo(f.created_at as string)}</span>
                </div>
                <p className="mt-1 text-zinc-300">{f.body}</p>
              </div>
            ))}
            {(feedback.data ?? []).length === 0 && <p className="text-zinc-500">Queue empty.</p>}
          </div>
        </Section>
      </div>
    </>
  );
}
