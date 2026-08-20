// Passcode gate for the console. One shared owner passcode → signed session
// cookie (HMAC over an expiry). WebCrypto only, so both proxy (edge) and
// server actions verify the same way.
import { cookies } from "next/headers";

export const SESSION_COOKIE = "org_session";
const THIRTY_DAYS_S = 30 * 24 * 3600;

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Buffer.from(sig).toString("base64url");
}

export async function mintSession(): Promise<{ value: string; maxAge: number }> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET missing");
  const exp = Math.floor(Date.now() / 1000) + THIRTY_DAYS_S;
  const sig = await hmac(secret, `ok:${exp}`);
  return { value: `${exp}.${sig}`, maxAge: THIRTY_DAYS_S };
}

export async function verifySessionValue(value: string | undefined, secret: string): Promise<boolean> {
  if (!value) return false;
  const [expStr, sig] = value.split(".");
  const exp = Number(expStr);
  if (!exp || exp < Date.now() / 1000 || !sig) return false;
  const expected = await hmac(secret, `ok:${exp}`);
  return sig === expected;
}

// Defense in depth: every server action re-checks the cookie itself.
export async function requireSession(): Promise<void> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET missing");
  const jar = await cookies();
  const ok = await verifySessionValue(jar.get(SESSION_COOKIE)?.value, secret);
  if (!ok) throw new Error("not signed in");
}

export function passcodeMatches(input: string): boolean {
  const expected = process.env.ORG_CONSOLE_PASSWORD ?? "";
  if (!expected || input.length !== expected.length) return false;
  // constant-time-ish compare
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= input.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
