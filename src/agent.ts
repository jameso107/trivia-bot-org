// The generic agent turn: role card + doctrine in, tool-loop in the middle,
// run row + ledger row out. Stateless by design (blueprint §1) — a run's
// legacy is only what it writes back.
import OpenAI from "openai";
import { config, isDry } from "./config.js";
import { db } from "./db.js";
import { brainDoc, coreDoctrine, roleCard } from "./brain.js";
import { estimateUsd } from "./pricing.js";
import { toolsFor, type OrgTool, type RunCtx } from "./tools.js";
import { ROLES, type RoleKey } from "./roles.js";

const MAX_TURNS = 12;

export interface RunResult {
  runId: string | null;
  status: "ok" | "failed" | "killed";
  spendUsd: number;
  report: string;
  artifacts: string[];
}

async function spentTodayUsd(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await db()
    .from("ledger")
    .select("amount_usd")
    .eq("kind", "inference")
    .eq("entry_date", today);
  return (data ?? []).reduce((a, r) => a + Math.abs(Number(r.amount_usd)), 0);
}

export async function runAgent(roleKey: RoleKey, focus?: string): Promise<RunResult> {
  const role = ROLES[roleKey];
  const client = new OpenAI({ apiKey: config.openaiKey });
  const modeBanner = isDry()
    ? "MODE: DRY-RUN — reads are real; every write/email you attempt is RECORDED to the outbox instead of executed. Act exactly as you would live; the record IS the output."
    : "MODE: LIVE — writes execute. Policies gate what needs approval.";

  // Budget precheck (policies §2: at 100% stop and escalate).
  const spentToday = await spentTodayUsd();
  if (spentToday >= config.dailyBudgetUsd) {
    console.log(`⛔ daily inference budget exhausted ($${spentToday.toFixed(2)}/$${config.dailyBudgetUsd}) — skipping ${roleKey}`);
    return { runId: null, status: "killed", spendUsd: 0, report: "daily budget exhausted; run skipped", artifacts: [] };
  }

  const { data: runRow } = await db()
    .from("runs")
    .insert({ agent: roleKey, status: "running" })
    .select("id")
    .single();
  const runId = (runRow?.id as string) ?? null;

  const docs = role.docs.map((p) => `## ${p}\n${brainDoc(p)}`).join("\n\n");
  const instructions = [
    `You are the **${roleKey}** agent of Trivia Bot — a stateless worker in an agentic company. Today is ${new Date().toISOString().slice(0, 10)}. The owner is James — ALL owner-addressed mail goes to ${config.ownerEmail}, never a placeholder.`,
    modeBanner,
    `TASK ADDRESSING: when a tool takes an \`agent\` value, it MUST be an exact registry key (ceo, auditor, chief-of-staff, analyst, trivia-ops-director, trivia-creation, trivia-qa, dev-features, dev-maintenance, qa-tester, ads-implementation, marketing-director, venue-search, venue-outreach, user-growth, ads-recruit, ads-outreach, social-media, website-content, cx-director, venue-success, user-support, ads-support, bizops-director, finance, ad-sales, contracts, data-steward) or omitted for director triage — never an invented name.`,
    `RUN CONTRACT: read the doctrine below, do today's work with your tools, and END with your run report in this exact shape:\n\nREPORT\ndone: <bullet lines, each with its artifact (row id / outbox file)>\nblocked: <or "nothing">\nlearned: <one or two lines>\nnext: <what tomorrow's run should pick up>\n\nEvery claimed completion MUST name an artifact — unverifiable claims are incidents (blueprint §11). Silence is the only forbidden outcome.`,
    `# CORE DOCTRINE\n${coreDoctrine()}`,
    `# YOUR ROLE CARD\n${roleCard(roleKey)}`,
    `# YOUR DOCS\n${docs}`,
    `# TODAY'S GOAL\n${role.goal}`,
  ].join("\n\n");

  const fnTools: OrgTool[] = toolsFor(role.tools);
  const apiTools = [
    ...fnTools.map((t) => ({
      type: "function" as const,
      name: t.name,
      description: t.description,
      parameters: t.parameters,
      strict: false,
    })),
    ...(role.webSearch ? [{ type: "web_search" as const }] : []),
  ];

  const ctx: RunCtx = { agent: roleKey, artifacts: [] };
  let input: OpenAI.Responses.ResponseInput = [
    { role: "user", content: focus ?? "Begin your run for today." },
  ];
  let spend = 0;
  let report = "";
  let status: RunResult["status"] = "ok";

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const res = await client.responses.create({
        model: config.model,
        instructions,
        input,
        tools: apiTools as never,
        max_output_tokens: 6000,
      });
      spend += estimateUsd(config.model, res.usage?.input_tokens ?? 0, res.usage?.output_tokens ?? 0);

      const calls = res.output.filter((o) => o.type === "function_call");
      input = [...input, ...res.output] as OpenAI.Responses.ResponseInput;

      if (calls.length === 0) {
        report = res.output_text || "(no report text)";
        break;
      }
      for (const call of calls) {
        const tool = fnTools.find((t) => t.name === call.name);
        let output: unknown;
        if (!tool) {
          output = { error: `tool ${call.name} not in your allowlist` };
        } else {
          try {
            output = await tool.run(JSON.parse(call.arguments || "{}"), ctx);
          } catch (e) {
            output = { error: e instanceof Error ? e.message : String(e) };
          }
        }
        console.log(`  ⚙ ${roleKey} → ${call.name}`);
        input.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(output),
        });
      }

      if (spend >= config.maxRunUsd) {
        input.push({
          role: "user",
          content: "BUDGET: this run hit its inference cap. Stop tool use and produce your REPORT now, marking unfinished work as blocked.",
        });
        status = "killed";
      }
      if (turn === MAX_TURNS - 1) {
        report = "(run hit its turn ceiling before reporting)";
        status = "killed";
      }
    }
  } catch (e) {
    status = "failed";
    report = `run crashed: ${e instanceof Error ? e.message : String(e)}`;
  }

  const notePrefix = isDry() ? "[DRY-RUN] " : "";
  if (runId) {
    await db()
      .from("runs")
      .update({
        status: status === "ok" ? "ok" : status,
        finished_at: new Date().toISOString(),
        spend_usd: Number(spend.toFixed(4)),
        notes: `${notePrefix}${report}\n\nartifacts: ${ctx.artifacts.join(", ") || "none"}`,
      })
      .eq("id", runId);
  }
  await db().from("ledger").insert({
    kind: "inference",
    agent: roleKey,
    dept: role.dept,
    amount_usd: -Number(spend.toFixed(4)),
    memo: `${notePrefix}${config.model} run ${runId ?? "?"}`,
  });

  console.log(`\n═══ ${roleKey} [${status}] $${spend.toFixed(4)} · artifacts: ${ctx.artifacts.length} ═══`);
  console.log(report);
  return { runId, status, spendUsd: spend, report, artifacts: ctx.artifacts };
}
