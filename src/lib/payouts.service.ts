/**
 * Payout methods — the payment rails an agent accepts.
 *
 * An agent advertises a LIST of methods (ethereum, later solana/stripe); the
 * payer picks any compatible one. This list also feeds the HTTP 402 payment
 * challenge when someone buys the agent's content.
 */

import { getSupabaseAdmin } from "@/lib/supabase";
import { resolveAccountByAddress } from "@/lib/users.service";

export interface PayoutMethodInput {
  kind: string;
  address: string;
}

export interface PayoutMethod {
  kind: string;
  address: string;
  verified: boolean;
}

export class PayoutValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayoutValidationError";
  }
}

/** Per-kind address validators. Add solana/stripe here to support more rails. */
const VALIDATORS: Record<string, (address: string) => boolean> = {
  ethereum: (a) => /^0x[0-9a-fA-F]{40}$/.test(a),
};

export const SUPPORTED_KINDS = Object.keys(VALIDATORS);

export function validatePayouts(methods: PayoutMethodInput[]): void {
  const seen = new Set<string>();
  for (const m of methods) {
    const validate = VALIDATORS[m.kind];
    if (!validate) {
      throw new PayoutValidationError(
        `unsupported kind "${m.kind}" (supported: ${SUPPORTED_KINDS.join(", ")})`,
      );
    }
    if (!validate(m.address)) {
      throw new PayoutValidationError(`invalid ${m.kind} address: "${m.address}"`);
    }
    if (seen.has(m.kind)) {
      throw new PayoutValidationError(`duplicate kind "${m.kind}" (one entry per rail)`);
    }
    seen.add(m.kind);
  }
}

async function listByAgentId(agentId: string): Promise<PayoutMethod[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("payout_methods")
    .select("kind, address, verified")
    .eq("agent_id", agentId);
  return (data ?? []).map((r) => ({ kind: r.kind, address: r.address, verified: r.verified }));
}

/**
 * Replace the agent's full set of payout methods (declarative PUT).
 * Self-registers the agent by address on first contact.
 */
export async function setPayouts(
  address: string,
  publicKey: string,
  methods: PayoutMethodInput[],
): Promise<PayoutMethod[]> {
  validatePayouts(methods);
  const supabase = getSupabaseAdmin();
  const agentId = await resolveAccountByAddress(supabase, address, publicKey, "author");

  // Replace semantics: clear, then insert the new set.
  await supabase.from("payout_methods").delete().eq("agent_id", agentId);
  if (methods.length > 0) {
    const { error } = await supabase.from("payout_methods").insert(
      methods.map((m) => ({ agent_id: agentId, kind: m.kind, address: m.address })),
    );
    if (error) {
      throw new Error(`Failed to save payout methods: ${error.message}`);
    }
  }
  return listByAgentId(agentId);
}

export interface AgentProfile {
  address: string;
  publicKey: string | null;
  role: string;
  trustScore: number;
  payouts: PayoutMethod[];
  namespaces: { namespace: string | null; priceUsd: number }[];
}

/** Public profile / whois for an address. Null if the agent doesn't exist. */
export async function getAgentProfile(address: string): Promise<AgentProfile | null> {
  const supabase = getSupabaseAdmin();
  const { data: user } = await supabase
    .from("users")
    .select("id, address, public_key, role, trust_score")
    .eq("address", address)
    .maybeSingle();
  if (!user) return null;

  const [payouts, articles] = await Promise.all([
    listByAgentId(user.id),
    supabase
      .from("articles")
      .select("namespace, price_usd")
      .eq("author_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return {
    address: user.address ?? address,
    publicKey: user.public_key,
    role: user.role,
    trustScore: user.trust_score,
    payouts,
    namespaces: (articles.data ?? []).map((a) => ({
      namespace: a.namespace,
      priceUsd: a.price_usd,
    })),
  };
}
