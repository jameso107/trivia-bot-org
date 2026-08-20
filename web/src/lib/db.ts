import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// SERVER ONLY. The console wields the org's service-role secret — it must
// never reach a client bundle. Guarded twice: no NEXT_PUBLIC_ name, and a
// runtime check.
let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("db() must never run in the browser");
  }
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error("missing SUPABASE_URL / SUPABASE_SECRET_KEY");
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}
