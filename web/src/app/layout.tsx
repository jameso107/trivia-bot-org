import type { Metadata } from "next";
import "./globals.css";
import { NavLink } from "@/components/ui";
import { ActionButton } from "@/components/action-button";
import { db } from "@/lib/db";
import { logout } from "@/lib/actions";
import { headers } from "next/headers";

export const metadata: Metadata = {
  title: "Trivia Bot — Org Console",
  description: "Mission control for the agentic company.",
};

export const dynamic = "force-dynamic";

const NAV = [
  ["/", "Overview"],
  ["/agents", "Agents"],
  ["/org", "Org chart"],
  ["/approvals", "Approvals"],
  ["/tasks", "Tasks"],
  ["/runs", "Runs"],
  ["/outbox", "Outbox"],
  ["/incidents", "Incidents"],
  ["/money", "Money"],
  ["/funnel", "Funnel"],
  ["/company", "Company"],
  ["/controls", "Controls"],
] as const;

async function killSwitchOn(): Promise<boolean> {
  try {
    const h = await headers();
    if (h.get("x-invoke-path") === "/login") return false;
    const { data } = await db().from("org_flags").select("value").eq("key", "kill_switch").single();
    return data?.value === true;
  } catch {
    return false;
  }
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const killed = await killSwitchOn();
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full bg-zinc-950 text-zinc-50 antialiased">
        <aside className="sticky top-0 flex h-screen w-52 shrink-0 flex-col gap-1 border-r border-zinc-800 p-4">
          <p className="mb-3 px-3 text-sm font-black uppercase tracking-widest text-amber-400">
            Trivia Bot <span className="block text-[10px] font-semibold text-zinc-500">org console</span>
          </p>
          {NAV.map(([href, label]) => (
            <NavLink key={href} href={href} label={label} />
          ))}
          <form action={logout} className="mt-auto">
            <ActionButton pendingText="Signing out…" className="w-full rounded-lg px-3 py-1.5 text-left text-sm text-zinc-500 hover:bg-zinc-900">
              Sign out
            </ActionButton>
          </form>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          {killed && (
            <p className="border-b border-red-900 bg-red-950 px-6 py-2 text-center text-sm font-bold text-red-300">
              ⛔ KILL SWITCH IS ON — all agent runs are refused. Turn it off in Controls.
            </p>
          )}
          <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
