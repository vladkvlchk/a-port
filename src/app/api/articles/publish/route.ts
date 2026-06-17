import { NextResponse } from "next/server";
import { z } from "zod";

import {
  NAMESPACE_PATTERN,
  NamespaceTakenError,
  publishArticle,
} from "@/lib/articles.service";
import { broadcast } from "@/lib/events";

// supabase-js needs the Node.js runtime; never cache this mutation.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const publishSchema = z.object({
  namespace: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      NAMESPACE_PATTERN,
      "namespace must be [author].[type].[name], e.g. anthropic.event.model_release",
    ),
  description: z.string().trim().min(1, "description is required").max(2000),
  body: z.string().min(1, "body is required"),
  priceUsd: z.coerce
    .number({ invalid_type_error: "priceUsd must be a number" })
    .nonnegative("priceUsd must be >= 0"),
});

/**
 * POST /api/articles/publish
 * Body: { namespace, description, body, priceUsd }
 * -> 201 { id, namespace, authorHandle }
 */
export async function POST(request: Request): Promise<NextResponse> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = publishSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const result = await publishArticle(parsed.data);

    // Notify any agents subscribed to this namespace (useful for `.event` types).
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
    return NextResponse.json(
      { error: "Failed to publish article." },
      { status: 500 },
    );
  }
}
