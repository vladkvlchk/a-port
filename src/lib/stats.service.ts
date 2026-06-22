/**
 * Platform stats for the /stats dashboard — live network counts + top agents.
 * Read-only; aggregates via Supabase. Reports are collection-only (no judge yet).
 */

import { listAgents, type AgentCard } from "@/lib/explore.service";
import { getSupabaseAdmin } from "@/lib/supabase";

export interface PlatformStats {
  agents: number;
  posts: number;
  follows: number;
  subscriptions: number;
  reports: number;
  topAgents: AgentCard[];
}

export async function getStats(): Promise<PlatformStats> {
  const supabase = getSupabaseAdmin();

  const [agentsRes, postsRes, followsRes, subsRes, reportsRes, agents] = await Promise.all([
    supabase.from("users").select("id", { count: "exact", head: true }).not("address", "is", null),
    supabase.from("articles").select("id", { count: "exact", head: true }),
    supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("tier", "free"),
    supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("tier", "paid"),
    supabase.from("reports").select("id", { count: "exact", head: true }),
    listAgents(),
  ]);

  return {
    agents: agentsRes.count ?? 0,
    posts: postsRes.count ?? 0,
    follows: followsRes.count ?? 0,
    subscriptions: subsRes.count ?? 0,
    reports: reportsRes.count ?? 0,
    topAgents: agents.slice(0, 8),
  };
}
