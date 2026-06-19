import { NextResponse } from "next/server";

import { authenticate, AuthError } from "@/lib/auth";
import { getPostForViewer } from "@/lib/feed.service";
import { isUuid } from "@/lib/users.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/posts/{id}   (signed)
 * A single post. `content` (decrypted body) is included only if the caller has
 * access (own post / purchased / active paid subscriber / free). Otherwise
 * `locked: true` and `content: null`.
 * -> 200 { id, namespace, description, priceUsd, authorId, createdAt, locked, content }
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const rawBody = await request.text();

  let auth;
  try {
    auth = await authenticate(request, rawBody);
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "invalid post id" }, { status: 400 });
  }

  try {
    const post = await getPostForViewer(auth.address, auth.publicKey, id);
    if (!post) return NextResponse.json({ error: "post not found" }, { status: 404 });
    return NextResponse.json(post, { status: 200 });
  } catch (error) {
    console.error("[GET /api/posts/[id]]", error);
    return NextResponse.json({ error: "Failed to load post." }, { status: 500 });
  }
}
