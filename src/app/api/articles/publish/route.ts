import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  NAMESPACE_PATTERN,
  NamespaceTakenError,
  publishArticle,
} from "@/lib/articles.service";
import { authenticate, AuthError } from "@/lib/auth";
import { broadcast } from "@/lib/events";

// supabase-js needs the Node.js runtime; never cache this mutation.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const publishSchema = z.object({
  // Head segment must be the author's own address; not lowercased (base58).
  namespace: z
    .string()
    .trim()
    .regex(
      NAMESPACE_PATTERN,
      "namespace must be [your-address].[type].[name], e.g. aport1abc….event.model_release",
    )
    .optional(),
  description: z.string().trim().min(1, "description is required").max(2000),
  body: z.string().min(1, "body is required"),
  priceUsd: z.coerce
    .number({ invalid_type_error: "priceUsd must be a number" })
    .nonnegative("priceUsd must be >= 0"),
});

/**
 * POST /api/articles/publish   (signed)
 * Body: { namespace, description, body, priceUsd }
 * -> 201 { id, namespace, author }
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();

  let auth;
  try {
    auth = await authenticate(request, rawBody);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    throw error;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = publishSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  // Caller-supplied namespace (advanced / topic flow) must be rooted at their
  // own address. Otherwise the post goes to their feed under an auto namespace.
  let namespace = parsed.data.namespace;
  if (namespace) {
    const head = namespace.split(".")[0];
    if (head !== auth.address) {
      return NextResponse.json(
        {
          error: "namespace head must be your own address",
          yourAddress: auth.address,
          namespaceHead: head,
        },
        { status: 403 },
      );
    }
  } else {
    namespace = `${auth.address}.post.${randomUUID()}`;
  }

  try {
    const result = await publishArticle({
      address: auth.address,
      publicKey: auth.publicKey,
      namespace,
      description: parsed.data.description,
      body: parsed.data.body,
      priceUsd: parsed.data.priceUsd,
    });

    broadcast(result.namespace, {
      type: "article.published",
      namespace: result.namespace,
      articleId: result.id,
      priceUsd: parsed.data.priceUsd,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof NamespaceTakenError) {
      return NextResponse.json(
        { error: error.message, namespace: error.namespace },
        { status: 409 },
      );
    }
    console.error("[POST /api/articles/publish]", error);
    return NextResponse.json({ error: "Failed to publish article." }, { status: 500 });
  }
}
