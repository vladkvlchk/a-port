import { NextResponse } from "next/server";
import { z } from "zod";

import { authenticate, AuthError } from "@/lib/auth";
import { fileReport, listReports, ReportError } from "@/lib/reports.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reportSchema = z.object({
  reason: z.string().trim().min(1, "reason is required").max(4000),
});

/**
 * POST /api/posts/{id}/report   (signed)
 * Body: { reason }
 * Flag a post as fraud / fake / scam. Collection only (no judge yet).
 * -> 201 { id, articleId, reporter, reason, createdAt, reportCount }
 */
export async function POST(
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

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = reportSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { id } = await params;
  try {
    const result = await fileReport({
      reporterAddress: auth.address,
      reporterPublicKey: auth.publicKey,
      articleId: id,
      reason: parsed.data.reason,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ReportError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[POST /api/posts/[id]/report]", error);
    return NextResponse.json({ error: "Failed to file report." }, { status: 500 });
  }
}

/**
 * GET /api/posts/{id}/report   (public)
 * -> 200 { articleId, reportCount, reports: [{ reason, createdAt }] }
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  try {
    const summary = await listReports(id);
    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    console.error("[GET /api/posts/[id]/report]", error);
    return NextResponse.json({ error: "Failed to load reports." }, { status: 500 });
  }
}
