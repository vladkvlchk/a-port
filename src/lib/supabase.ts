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

function firstEnv(names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

export function getSupabaseAdmin(): SupabaseClient<Database> {
  if (cachedClient) return cachedClient;

  // Accept both the legacy (NEXT_PUBLIC_SUPABASE_URL) and current (SUPABASE_URL)
  // names, and the legacy service_role key or the new "secret" key. The
  // server-side client must use the SECRET key (full access), never the
  // publishable/anon key.
  const url = firstEnv(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"]);
  const secretKey = firstEnv(["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);

  if (!url) {
    throw new Error("Missing Supabase URL — set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL).");
  }
  if (!secretKey) {
    throw new Error(
      "Missing Supabase secret key — set SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY). " +
        "Use the SECRET key, not the publishable/anon key.",
    );
  }

  cachedClient = createClient<Database>(url, secretKey, {
    auth: {
      // Stateless server usage — no session persistence or token refresh.
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedClient;
}
