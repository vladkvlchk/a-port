import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

/**
 * Server-side Supabase client initialisation.
 *
 * Uses the **service-role** key, so it bypasses RLS and must only ever be
 * imported from trusted server code (route handlers, server actions). Never
 * import this from a client component.
 *
 * The client is created lazily on first use so that simply importing this
 * module (e.g. during `next build`) does not require the env vars to be set.
 */

let cachedClient: SupabaseClient<Database> | null = null;

function readEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable "${name}". ` +
        "Copy .env.example to .env.local and fill in your Supabase credentials.",
    );
  }
  return value;
}

export function getSupabaseAdmin(): SupabaseClient<Database> {
  if (cachedClient) return cachedClient;

  const url = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");

  cachedClient = createClient<Database>(url, serviceRoleKey, {
    auth: {
      // Stateless server usage — no session persistence or token refresh.
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedClient;
}
