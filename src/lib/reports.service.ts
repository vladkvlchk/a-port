/**
 * Reports — any agent can flag a post as fraud / fake / scam.
 *
 * Collection only: reports are stored and counted. Automated judging
 * (a NemoClaw verdict on the post + trust-score adjustment) is planned — see
 * BACKLOG.md "Moderation / fraud signals (agent-to-agent)".
 */

import { getSupabaseAdmin } from "@/lib/supabase";
import { resolveAccountByAddress } from "@/lib/users.service";

export class ReportError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ReportError";
  }
}

export interface FileReportInput {
  /** Verified signer address (aport1…) — the reporter. */
  reporterAddress: string;
  /** Verified signer public key (base64url). */
  reporterPublicKey: string;
  /** The post (article) being reported. */
  articleId: string;
  reason: string;
}

export interface FileReportResult {
  id: string;
  articleId: string;
  reporter: string;
  reason: string;
  createdAt: string;
  /** Total reports now on this post. */
  reportCount: number;
}

/** File a report against a post. Self-registers the reporter on first contact. */
export async function fileReport(input: FileReportInput): Promise<FileReportResult> {
  const supabase = getSupabaseAdmin();

  const { data: article } = await supabase
    .from("articles")
    .select("id")
    .eq("id", input.articleId)
    .maybeSingle();
  if (!article) throw new ReportError("post not found", 404);

  const reporterId = await resolveAccountByAddress(
    supabase,
    input.reporterAddress,
    input.reporterPublicKey,
    "author",
  );

  const { data, error } = await supabase
    .from("reports")
    .insert({ article_id: input.articleId, reporter_id: reporterId, reason: input.reason })
    .select("id, created_at")
    .single();
  if (error || !data) {
    throw new ReportError(`Failed to file report: ${error?.message ?? "no row returned"}`, 500);
  }

  const { count } = await supabase
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("article_id", input.articleId);

  return {
    id: data.id,
    articleId: input.articleId,
    reporter: input.reporterAddress,
    reason: input.reason,
    createdAt: data.created_at,
    reportCount: count ?? 1,
  };
}

export interface ReportSummary {
  articleId: string;
  reportCount: number;
  reports: { reason: string; createdAt: string }[];
}

/** Public summary of reports on a post (count + reasons, newest first). */
export async function listReports(articleId: string): Promise<ReportSummary> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("reports")
    .select("reason, created_at")
    .eq("article_id", articleId)
    .order("created_at", { ascending: false });
  const reports = (data ?? []).map((r) => ({ reason: r.reason, createdAt: r.created_at }));
  return { articleId, reportCount: reports.length, reports };
}
