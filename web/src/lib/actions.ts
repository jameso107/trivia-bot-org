"use server";

// Every console mutation: session-checked, service-role, revalidated.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "./db";
import { mintSession, passcodeMatches, requireSession, SESSION_COOKIE } from "./auth";
import { ROLES } from "./roles";

export async function login(formData: FormData) {
  const pass = String(formData.get("passcode") ?? "");
  if (!passcodeMatches(pass)) {
    redirect("/login?error=1");
  }
  const session = await mintSession();
  const jar = await cookies();
  jar.set(SESSION_COOKIE, session.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: session.maxAge,
    path: "/",
  });
  redirect("/");
}

export async function logout() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

// ---- approvals (the owner queue) ----
export async function decideApproval(id: string, decision: "approved" | "rejected", formData: FormData) {
  await requireSession();
  await db()
    .from("approvals")
    .update({
      status: decision,
      decided_at: new Date().toISOString(),
      decided_note: String(formData.get("note") ?? "") || null,
    })
    .eq("id", id)
    .eq("status", "pending");
  revalidatePath("/approvals");
  revalidatePath("/");
}

// ---- tasks (owner directives + queue hygiene) ----
export async function createTask(formData: FormData) {
  await requireSession();
  const agent = String(formData.get("agent") ?? "");
  await db().from("tasks").insert({
    dept: String(formData.get("dept")),
    agent: agent || null,
    title: String(formData.get("title")),
    detail: String(formData.get("detail")),
    priority: Number(formData.get("priority") ?? 3),
    due: String(formData.get("due") ?? "") || null,
    created_by: "owner",
  });
  revalidatePath("/tasks");
}

export async function setTaskStatus(id: string, status: string) {
  await requireSession();
  await db()
    .from("tasks")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/tasks");
}

// ---- agent control ----
export async function requestRun(agent: string) {
  await requireSession();
  if (!(agent in ROLES)) throw new Error("unknown agent");
  await db().from("agent_run_requests").insert({ agent, requested_by: "owner" });
  revalidatePath("/agents");
  revalidatePath(`/agents/${agent}`);
}

export async function setAgentPaused(agent: string, paused: boolean) {
  await requireSession();
  const { data } = await db().from("org_flags").select("value").eq("key", "paused_agents").single();
  const current = new Set<string>(Array.isArray(data?.value) ? (data!.value as string[]) : []);
  if (paused) current.add(agent);
  else current.delete(agent);
  await db()
    .from("org_flags")
    .update({ value: [...current], updated_at: new Date().toISOString() })
    .eq("key", "paused_agents");
  revalidatePath("/agents");
  revalidatePath(`/agents/${agent}`);
  revalidatePath("/controls");
}

export async function setKillSwitch(on: boolean) {
  await requireSession();
  await db()
    .from("org_flags")
    .update({ value: on, updated_at: new Date().toISOString() })
    .eq("key", "kill_switch");
  revalidatePath("/");
  revalidatePath("/controls");
}

export async function setBudgetOverride(formData: FormData) {
  await requireSession();
  const raw = Number(formData.get("budget"));
  const value = Number.isFinite(raw) && raw > 0 ? raw : null;
  await db()
    .from("org_flags")
    .update({ value, updated_at: new Date().toISOString() })
    .eq("key", "daily_budget_usd_override");
  revalidatePath("/controls");
}

// ---- outbox / incidents ----
export async function markOutboxReviewed(id: string) {
  await requireSession();
  await db().from("outbox_records").update({ reviewed: true }).eq("id", id);
  revalidatePath("/outbox");
}

export async function resolveIncident(id: string) {
  await requireSession();
  await db().from("incidents").update({ status: "resolved" }).eq("id", id);
  revalidatePath("/incidents");
  revalidatePath("/");
}
