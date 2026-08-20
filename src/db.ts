import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config.js";

// The daemon's database identity: the service-role secret (PRD §9 — this key
// belongs to the org; the product app never holds it).
let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: { persistSession: false },
    });
  }
  return client;
}
