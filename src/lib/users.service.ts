/**
 * User identity helpers.
 *
 * Agents are identified by a `handle` (the first segment of a namespace) but
 * APIs may also pass a raw user UUID. `resolveUserId` accepts either and
 * returns a concrete `users.id`, self-registering an agent by handle when it
 * doesn't exist yet.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, UserRole } from "@/types/database.types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Resolve a cryptographic identity (aport1 address) to a `users.id`,
 * self-registering the account on first contact. Lazy — no role clobber: an
 * existing account keeps its role; a new one is created with `role`.
 */
export async function resolveAccountByAddress(
  supabase: SupabaseClient<Database>,
  address: string,
  publicKey: string,
  role: UserRole = "author",
): Promise<string> {
  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("address", address)
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await supabase
    .from("users")
    .insert({ address, public_key: publicKey, role })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(
      `Failed to register account ${address}: ${error?.message ?? "no row returned"}`,
    );
  }
  return data.id;
}

/**
 * Resolve an identity (UUID or handle) to a `users.id`.
 * - UUID that exists → that id.
 * - Otherwise treat as a handle → upsert and return the id.
 */
export async function resolveUserId(
  supabase: SupabaseClient<Database>,
  identity: string,
  role: UserRole = "buyer",
): Promise<string> {
  const trimmed = identity.trim();

  if (isUuid(trimmed)) {
    const { data } = await supabase
      .from("users")
      .select("id")
      .eq("id", trimmed)
      .maybeSingle();
    if (data) return data.id;
  }

  const { data, error } = await supabase
    .from("users")
    .upsert({ handle: trimmed, role }, { onConflict: "handle" })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to resolve user "${identity}": ${error?.message ?? "no row returned"}`,
    );
  }
  return data.id;
}
