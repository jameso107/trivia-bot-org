// Entrypoints:
//   npm run once -- <role> [--live] [--focus "..."]   one agent turn
//   npm run dryrun                                    the §9 handoff dry-run
//   npm run daemon                                    the scheduled heartbeat
//   npm run seed:signup                               a REAL venue signup via the app's own RPC
import { readdirSync } from "node:fs";
import { hostname } from "node:os";
import cron from "node-cron";
import { createClient } from "@supabase/supabase-js";
import { config, isDry, phaseActive } from "./config.js";
import { db } from "./db.js";
import { ingestMail, mailConfigured } from "./mail.js";
import { runAgent } from "./agent.js";
import { ROLES, type RoleKey } from "./roles.js";

const [, , cmd, ...rest] = process.argv;

function assertRole(k: string | undefined): RoleKey {
  if (!k || !(k in ROLES)) {
    console.error(`unknown role '${k}'. Roles: ${Object.keys(ROLES).join(", ")}`);
    process.exit(1);
  }
  return k as RoleKey;
}

async function seedSignup() {
  const pub = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!pub) throw new Error("SUPABASE_PUBLISHABLE_KEY missing");
  const suffix = Math.random().toString(36).slice(2, 8);
  const email = `dryrun-owner-${suffix}@example.com`;

  console.log(`creating venue owner ${email} and signing up through the app's own RPC…`);
  const admin = db();
  const { data: user, error: uErr } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (uErr) throw uErr;
  const { data: link, error: lErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (lErr) throw lErr;

  const anon = createClient(config.supabaseUrl, pub, { auth: { persistSession: false } });
  const { data: verified, error: vErr } = await anon.auth.verifyOtp({
    type: "email",
    token_hash: link.properties.hashed_token,
  });
  if (vErr) throw vErr;

  const asUser = createClient(config.supabaseUrl, pub, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${verified.session!.access_token}` } },
  });
  const { data: venueId, error: sErr } = await asUser.rpc("signup_venue", {
    p_name: `Dry Run Tavern ${suffix}`,
    p_metro: "Detroit",
    p_slug: `dry-run-tavern-${suffix}`,
  });
  if (sErr) throw sErr;
  console.log(`✓ venue ${venueId} signed up (user ${user.user.id})`);

  const { data: ev } = await admin
    .from("events")
    .select("id, kind, payload, processed_at")
    .eq("kind", "venue_signup")
    .is("processed_at", null);
  console.log(`✓ unprocessed venue_signup events now in queue: ${ev?.length ?? 0}`);
}

async function dryrun() {
  console.log(`\n╔══ trivia-bot-org §9 DRY-RUN · mode=${config.mode} · model=${config.model} ══╗\n`);
  if (!isDry()) {
    console.error("refusing: set ORG_MODE=dry for the handoff dry-run");
    process.exit(1);
  }

  const { data: queue } = await db()
    .from("events")
    .select("id, kind, created_at")
    .is("processed_at", null);
  console.log(`event queue: ${queue?.length ?? 0} unprocessed row(s) ${queue?.map((e) => e.kind).join(", ") || ""}\n`);

  console.log("── 1/3 venue-success (CX consumes the signup wake-up) ──");
  const cx = await runAgent("venue-success");
  console.log("\n── 2/3 ceo (KPI snapshot + directives + owner brief) ──");
  const ceo = await runAgent("ceo");
  console.log("\n── 3/3 trivia-qa (dispute + pack queues) ──");
  const qa = await runAgent("trivia-qa");

  const outbox = (() => {
    try {
      return readdirSync("outbox").length;
    } catch {
      return 0;
    }
  })();
  const total = cx.spendUsd + ceo.spendUsd + qa.spendUsd;
  console.log(`\n╚══ dry-run complete · 3 runs · $${total.toFixed(4)} inference · ${outbox} outbox record(s) · runs+ledger rows written to the org tables ══╝`);
}

async function daemon() {
  console.log(`trivia-bot-org daemon up · mode=${config.mode} · model=${config.model} · phase=${config.phase} · TZ America/Detroit`);
  console.log("KILL SWITCH: the console's Controls page (org_flags.kill_switch) — or stop this process.");
  const tz = { timezone: "America/Detroit" };

  // Liveness for the console: org_flags.daemon_heartbeat, stamped on boot and
  // every minute. The console reads OFFLINE at >150s stale.
  const upSince = new Date().toISOString();
  const beat = () =>
    void db()
      .from("org_flags")
      .upsert({
        key: "daemon_heartbeat",
        value: {
          at: new Date().toISOString(),
          up_since: upSince,
          mode: config.mode,
          phase: config.phase,
          model: config.model,
          host: hostname(),
        },
        updated_at: new Date().toISOString(),
      })
      .then(({ error }) => {
        if (error) console.warn(`heartbeat write failed: ${error.message}`);
      });
  beat();
  let active = 0;
  let benched = 0;
  for (const [key, role] of Object.entries(ROLES) as [RoleKey, (typeof ROLES)[RoleKey]][]) {
    if (!phaseActive(role.phase)) {
      benched++;
      continue;
    }
    for (const expr of role.cadence) {
      cron.schedule(expr, () => void runAgent(key), tz);
    }
    if (role.cadence.length > 0) active++;
  }
  console.log(
    `roster: ${active} agents scheduled (phase ≤ ${config.phase}); ${benched} defined but benched — raise ORG_PHASE to hire them. dev-features/qa-tester run in the Claude Code builder pod (D-007).`,
  );

  // Inbound mail → events rows (kind=email_received), every 5 minutes.
  // Ingest is observation, not action: it runs even under the kill switch,
  // like the heartbeat — agents acting on the events is what the switch stops.
  if (mailConfigured()) {
    console.log(`mail: polling ${config.agentmailInbox} every 5m → events(kind=email_received)`);
    cron.schedule("*/5 * * * *", async () => {
      const r = await ingestMail();
      if (r.ingested > 0) console.log(`✉ ingested ${r.ingested} inbound email(s) → events`);
      if (r.error) console.warn(`mail ingest: ${r.error}`);
    }, tz);
  } else {
    console.log("mail: not configured (AGENTMAIL_API_KEY/AGENTMAIL_INBOX) — send_email outboxes, no ingest");
  }

  // Console "Run now" requests: poll minutely, execute serially, cheaply.
  let working = false;
  cron.schedule("* * * * *", async () => {
    beat(); // before the guard — a long request run must not read as an outage
    if (working) return;
    working = true;
    try {
      const { data: reqs } = await db()
        .from("agent_run_requests")
        .select("id, agent")
        .eq("status", "pending")
        .order("created_at")
        .limit(3);
      for (const req of reqs ?? []) {
        if (!(req.agent in ROLES)) {
          await db().from("agent_run_requests").update({ status: "skipped" }).eq("id", req.id);
          continue;
        }
        await db()
          .from("agent_run_requests")
          .update({ status: "started", started_at: new Date().toISOString() })
          .eq("id", req.id);
        console.log(`▶ console requested a run: ${req.agent}`);
        const result = await runAgent(req.agent as RoleKey);
        await db()
          .from("agent_run_requests")
          .update({ status: result.status === "failed" ? "failed" : "done", run_id: result.runId })
          .eq("id", req.id);
      }
    } catch (e) {
      console.warn(`run-request poll error: ${e instanceof Error ? e.message : e}`);
    } finally {
      working = false;
    }
  }, tz);
}

const main = async () => {
  switch (cmd) {
    case "once": {
      const role = assertRole(rest.find((a) => !a.startsWith("--")));
      if (!phaseActive(ROLES[role].phase)) {
        console.log(
          `note: ${role} is a Phase-${ROLES[role].phase} hire (current ORG_PHASE=${config.phase}) — running on demand anyway; the daemon won't schedule it until you raise the phase.`,
        );
      }
      if (rest.includes("--live")) process.env.ORG_MODE = "live"; // config already parsed; guard:
      if (rest.includes("--live") && config.mode !== "live") {
        console.error("to run live, set ORG_MODE=live in .env (explicit beats flags for something this sharp)");
        process.exit(1);
      }
      const focusIdx = rest.indexOf("--focus");
      await runAgent(role, focusIdx >= 0 ? rest[focusIdx + 1] : undefined);
      break;
    }
    case "dryrun":
      await dryrun();
      break;
    case "daemon":
      await daemon();
      return; // keep process alive
    case "seed-signup":
      await seedSignup();
      break;
    default:
      console.log("commands: once <role> [--focus ...] · dryrun · daemon · seed-signup");
  }
  process.exit(0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
