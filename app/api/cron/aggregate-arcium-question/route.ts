import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "edge";

/**
 * GET /api/cron/aggregate-arcium-question
 * CRON job that automatically aggregates AGGREGATING_ARCIUM questions
 * Runs at the beginning of each UTC day (0 0 * * *)
 * 
 * Logic:
 * - Finds ALL questions with status AGGREGATING_ARCIUM
 * - For each question, checks how many commitments it has
 * - If commitments >= threshold (default 10, configurable via AGGREGATE_MIN_COMMITMENTS):
 *   - Triggers aggregation (converts to FINALIZED_ARCIUM)
 * - If commitments < threshold:
 *   - Marks question as DEACTIVATE_ARCIUM (insufficient participation)
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const summary = {
    timestamp: new Date().toISOString(),
    threshold: 10,
    processed: [] as Array<{
      questionId: number;
      epochId: string;
      commitmentsCount: number;
      action: "aggregated" | "deactivated" | "error";
      error?: string;
    }>,
    totalProcessed: 0,
    totalAggregated: 0,
    totalDeactivated: 0,
    totalErrors: 0,
  };

  try {
    // Check CRON secret protection
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const providedSecret = request.nextUrl.searchParams.get("secret");
      if (!providedSecret || providedSecret !== cronSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // Get threshold from environment (default 10)
    const minCommitments = parseInt(
      process.env.AGGREGATE_MIN_COMMITMENTS || "10",
      10
    ) || 10;
    summary.threshold = minCommitments;

    // Check MANAGE_API_KEY is configured (needed for aggregation)
    const manageApiKey = process.env.MANAGE_API_KEY;
    if (!manageApiKey) {
      const errorMsg = "MANAGE_API_KEY is not configured";
      console.error(`[AGGREGATE-ARCIUM] ${summary.timestamp} - ${errorMsg}`);
      return NextResponse.json(
        {
          success: false,
          error: errorMsg,
          summary,
        },
        { status: 500 }
      );
    }

    // Get base URL for internal API call
    // Priority: 1) NEXT_PUBLIC_BASE_URL env var, 2) VERCEL_URL env var, 3) Extract from request URL, 4) localhost fallback
    let baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    if (!baseUrl) {
      if (process.env.VERCEL_URL) {
        baseUrl = `https://${process.env.VERCEL_URL}`;
      } else {
        // Extract origin from request URL (works for CRON jobs on Vercel)
        const requestOrigin = request.nextUrl.origin;
        baseUrl = requestOrigin || "http://localhost:3000";
      }
    }

    // Find ALL questions with status AGGREGATING_ARCIUM
    const { data: questions, error: questionError } = await supabase
      .from("questions_repo")
      .select("id, epoch_id")
      .eq("game_status", "AGGREGATING_ARCIUM")
      .order("created_at", { ascending: false });

    if (questionError) {
      const errorMsg = `Error fetching AGGREGATING_ARCIUM questions: ${questionError.message}`;
      console.error(`[AGGREGATE-ARCIUM] ${summary.timestamp} - ${errorMsg}`);
      return NextResponse.json(
        {
          success: false,
          error: "Database error",
          summary,
          details: questionError.message,
        },
        { status: 500 }
      );
    }

    if (!questions || questions.length === 0) {
      console.log(
        `[AGGREGATE-ARCIUM] ${summary.timestamp} - No AGGREGATING_ARCIUM questions found`
      );
      return NextResponse.json({
        success: true,
        message: "No AGGREGATING_ARCIUM questions found",
        summary,
      });
    }

    console.log(
      `[AGGREGATE-ARCIUM] ${summary.timestamp} - Found ${questions.length} AGGREGATING_ARCIUM question(s) to process`
    );

    // Process each question
    for (const question of questions) {
      if (!question.epoch_id) {
        const errorMsg = `Question ${question.id} has no epoch_id`;
        console.error(`[AGGREGATE-ARCIUM] ${summary.timestamp} - ${errorMsg}`);
        summary.processed.push({
          questionId: question.id,
          epochId: "",
          commitmentsCount: 0,
          action: "error",
          error: errorMsg,
        });
        summary.totalErrors++;
        continue;
      }

      // Count commitments for this epoch_id
      const { data: commitments, error: commitmentsError } = await supabase
        .from("response_commitments")
        .select("id")
        .eq("epoch_id", question.epoch_id);

      if (commitmentsError) {
        const errorMsg = `Error counting commitments: ${commitmentsError.message}`;
        console.error(
          `[AGGREGATE-ARCIUM] ${summary.timestamp} - Question ${question.id}: ${errorMsg}`
        );
        summary.processed.push({
          questionId: question.id,
          epochId: question.epoch_id,
          commitmentsCount: 0,
          action: "error",
          error: errorMsg,
        });
        summary.totalErrors++;
        continue;
      }

      const commitmentsCount = commitments?.length || 0;

      // Check if we meet the threshold
      if (commitmentsCount >= minCommitments) {
        // Aggregate: call the aggregate endpoint
        const aggregateUrl = `${baseUrl}/api/private-data-game/manage/aggregate-commitments`;

        try {
          const aggregateResponse = await fetch(aggregateUrl, {
            method: "POST",
            headers: {
              "x-api-key": manageApiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ epoch_id: question.epoch_id }),
          });

          const aggregateBody = await aggregateResponse.json().catch(() => ({}));

          if (!aggregateResponse.ok) {
            const errorMsg =
              (aggregateBody.error as string) || aggregateResponse.statusText;
            console.error(
              `[AGGREGATE-ARCIUM] ${summary.timestamp} - Question ${question.id}: Aggregation failed: ${errorMsg}`
            );
            summary.processed.push({
              questionId: question.id,
              epochId: question.epoch_id,
              commitmentsCount,
              action: "error",
              error: errorMsg,
            });
            summary.totalErrors++;
            continue;
          }

          console.log(
            `[AGGREGATE-ARCIUM] ${summary.timestamp} - Question ${question.id} (${question.epoch_id}): Aggregated successfully - Commitments: ${commitmentsCount}`
          );
          summary.processed.push({
            questionId: question.id,
            epochId: question.epoch_id,
            commitmentsCount,
            action: "aggregated",
          });
          summary.totalAggregated++;
        } catch (fetchError) {
          const errorMsg =
            fetchError instanceof Error
              ? fetchError.message
              : String(fetchError);
          console.error(
            `[AGGREGATE-ARCIUM] ${summary.timestamp} - Question ${question.id}: Fetch error: ${errorMsg}`
          );
          summary.processed.push({
            questionId: question.id,
            epochId: question.epoch_id,
            commitmentsCount,
            action: "error",
            error: errorMsg,
          });
          summary.totalErrors++;
          continue;
        }
      } else {
        // Deactivate: mark as DEACTIVATE_ARCIUM
        const { error: updateError } = await supabase
          .from("questions_repo")
          .update({ game_status: "DEACTIVATE_ARCIUM" })
          .eq("id", question.id)
          .eq("epoch_id", question.epoch_id);

        if (updateError) {
          const errorMsg = `Failed to deactivate: ${updateError.message}`;
          console.error(
            `[AGGREGATE-ARCIUM] ${summary.timestamp} - Question ${question.id}: ${errorMsg}`
          );
          summary.processed.push({
            questionId: question.id,
            epochId: question.epoch_id,
            commitmentsCount,
            action: "error",
            error: errorMsg,
          });
          summary.totalErrors++;
          continue;
        }

        console.log(
          `[AGGREGATE-ARCIUM] ${summary.timestamp} - Question ${question.id} (${question.epoch_id}): Deactivated (insufficient participation) - Commitments: ${commitmentsCount} < ${minCommitments}`
        );
        summary.processed.push({
          questionId: question.id,
          epochId: question.epoch_id,
          commitmentsCount,
          action: "deactivated",
        });
        summary.totalDeactivated++;
      }
    }

    summary.totalProcessed = summary.processed.length;
    const duration = Date.now() - startTime;

    console.log(
      `[AGGREGATE-ARCIUM] ${summary.timestamp} - Completed: Processed: ${summary.totalProcessed}, Aggregated: ${summary.totalAggregated}, Deactivated: ${summary.totalDeactivated}, Errors: ${summary.totalErrors}, Duration: ${duration}ms`
    );

    return NextResponse.json({
      success: true,
      message: `Processed ${summary.totalProcessed} question(s)`,
      summary,
      durationMs: duration,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[AGGREGATE-ARCIUM] ${summary.timestamp} - Fatal error:`, err);

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        summary,
        details: errorMsg,
      },
      { status: 500 }
    );
  }
}
