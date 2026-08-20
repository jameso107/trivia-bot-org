// Phase-A KPI snapshot — deterministic CODE, not model vibes (the analyst
// role arrives in Phase B; until then the CEO calls this). Every number maps
// to brain/kpi-definitions.md; approximations are declared in `notes` so a
// brief can never silently redefine a KPI (that's an incident per doctrine).
import { db } from "./db.js";

const DAY = 24 * 3600 * 1000;
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export async function computeKpis() {
  const d = db();
  const notes: string[] = [];

  const [completed7, accounts7, accounts1, disputes, livePacks, runs24, tasksOpen, ledger1, venues28] =
    await Promise.all([
      d.from("analytics_events").select("venue_id, props, created_at")
        .eq("event", "game_completed").gte("created_at", iso(7 * DAY)),
      d.from("analytics_events").select("id").eq("event", "account_created_from_game")
        .gte("created_at", iso(7 * DAY)),
      d.from("analytics_events").select("id").eq("event", "account_created_from_game")
        .gte("created_at", iso(1 * DAY)),
      d.from("question_disputes").select("status"),
      d.from("packs").select("question_count").eq("status", "live"),
      d.from("runs").select("status").gte("started_at", iso(1 * DAY)),
      d.from("tasks").select("id, updated_at").in("status", ["open", "claimed"]),
      d.from("ledger").select("amount_usd").gte("entry_date", new Date(Date.now() - DAY).toISOString().slice(0, 10)),
      d.from("analytics_events").select("venue_id").eq("event", "game_completed")
        .gte("created_at", iso(28 * DAY)),
    ]);

  const nights = (completed7.data ?? []).map((r) => ({
    venue: r.venue_id as string | null,
    players: Number((r.props as Record<string, unknown>)?.players ?? 0),
    teams: Number((r.props as Record<string, unknown>)?.teams ?? 0),
  }));
  // "Run night" = ≥3 teams and ≥50% of questions played; questions_played vs
  // pack size isn't joined here, so Phase A approximates with the team floor.
  const runNights = nights.filter((n) => n.teams >= 3);
  notes.push("weekly_active_venue_nights approximated as game_completed with teams>=3 (question-share check lands with the analyst role)");

  const upheld = (disputes.data ?? []).filter((x) => x.status === "upheld").length;
  const shippedQuestions = (livePacks.data ?? []).reduce((a, p) => a + Number(p.question_count ?? 0), 0);

  const players7 = nights.reduce((a, n) => a + n.players, 0);
  const runsOk = (runs24.data ?? []).filter((r) => r.status === "ok").length;
  const runsAll = (runs24.data ?? []).length;
  const stalled = (tasksOpen.data ?? []).filter(
    (t) => Date.parse(t.updated_at as string) < Date.now() - 2 * DAY,
  ).length;

  return {
    computed_at: new Date().toISOString(),
    metrics: {
      weekly_active_venue_nights: runNights.length,
      active_venues_28d: new Set((venues28.data ?? []).map((v) => v.venue_id)).size,
      players_per_night_7d: median(nights.map((n) => n.players)),
      players_7d: players7,
      accounts_created_1d: accounts1.data?.length ?? 0,
      accounts_created_7d: accounts7.data?.length ?? 0,
      qr_to_account_7d: players7 > 0 ? Number(((accounts7.data?.length ?? 0) / players7).toFixed(3)) : null,
      pack_error_rate: shippedQuestions > 0 ? Number((upheld / shippedQuestions).toFixed(4)) : null,
      shipped_questions: shippedQuestions,
      open_disputes: (disputes.data ?? []).filter((x) => x.status === "open").length,
      run_success_rate_24h: runsAll > 0 ? Number((runsOk / runsAll).toFixed(2)) : null,
      stalled_tasks: stalled,
      spend_yesterday_usd: Number(
        (ledger1.data ?? []).reduce((a, r) => a + Math.min(0, Number(r.amount_usd)), 0).toFixed(4),
      ) * -1,
    },
    notes,
  };
}
