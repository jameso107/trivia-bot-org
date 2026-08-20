import { login } from "@/lib/actions";

export const metadata = { title: "Sign in — Org Console" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const failed = params.error === "1";
  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-zinc-950">
      <form
        action={login}
        className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-8"
      >
        <div>
          <p className="text-sm font-black uppercase tracking-widest text-amber-400">Trivia Bot</p>
          <h1 className="text-2xl font-bold">Org console</h1>
        </div>
        <input
          type="password"
          name="passcode"
          required
          autoFocus
          placeholder="Owner passcode"
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-50 outline-none focus:border-amber-400"
        />
        {failed && (
          <p role="alert" className="text-sm text-red-400">
            Wrong passcode.
          </p>
        )}
        <button className="rounded-xl bg-amber-400 px-4 py-2.5 font-bold text-zinc-950 hover:bg-amber-300">
          Enter
        </button>
      </form>
    </div>
  );
}
