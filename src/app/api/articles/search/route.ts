import { NextResponse } from "next/server";
import { z } from "zod";

import { searchArticles } from "@/lib/articles.service";

// supabase-js needs the Node.js runtime; results depend on the live DB.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const searchSchema = z.object({
  query: z.string().trim().min(1, "query is required").max(500),
});

/**
 * GET /api/articles/search?query=string
 * -> 200 { results: ArticleSearchResult[] }   (body_encrypted is never included)
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);

  const parsed = searchSchema.safeParse({
    query: searchParams.get("query") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Missing or invalid 'query' parameter.",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  try {
    const results = await searchArticles(parsed.data.query);
    return NextResponse.json({ results }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/articles/search]", error);
    return NextResponse.json(
      { error: "Failed to search articles." },
      { status: 500 },
    );
  }
}
