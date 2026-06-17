import { NextResponse } from "next/server";
import { z } from "zod";

import { publishArticle } from "@/lib/articles.service";

// supabase-js needs the Node.js runtime; never cache this mutation.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const publishSchema = z.object({
  authorId: z.string().uuid("authorId must be a valid UUID"),
  title: z.string().trim().min(1, "title is required").max(200),
  description: z.string().trim().min(1, "description is required").max(2000),
  body: z.string().min(1, "body is required"),
  priceUsd: z
    .number({ invalid_type_error: "priceUsd must be a number" })
    .nonnegative("priceUsd must be >= 0"),
});

/**
 * POST /api/articles/publish
 * Body: { authorId, title, description, body, priceUsd }
 * -> 201 { id }
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
    const { id } = await publishArticle(parsed.data);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/articles/publish]", error);
    return NextResponse.json(
      { error: "Failed to publish article." },
      { status: 500 },
    );
  }
}
