import { NextResponse } from "next/server";

import { authenticate, AuthError } from "@/lib/auth";
import { getFeed } from "@/lib/feed.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/feed   (signed)
 * Posts from every creator the caller follows/subscribes to (newest first).
 * Premium posts the caller can't access are returned with `locked: true`.
 * -> 200 { feed: [{ id, namespace, description, priceUsd, authorId, createdAt, locked }] }
 */
export async function GET(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();

  let auth;
  try {
    auth = await authenticate(request, rawBody);
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  try {
    const feed = await getFeed(auth.address, auth.publicKey);
    return NextResponse.json({ feed }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/feed]", error);
    return NextResponse.json({ error: "Failed to load feed." }, { status: 500 });
  }
}
