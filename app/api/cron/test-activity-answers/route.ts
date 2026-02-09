import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  getTestUsers,
  getActiveArciumQuestion,
  generateUniqueNullifier,
  generateDummyCommitment,
  generateDummyEncryptedAnswer,
  selectRandomUsers,
  hasUserAnswered,
} from "@/lib/test-activity-utils";

export const runtime = "edge";

/**
 * GET /api/cron/test-activity-answers
 * CRON job that simulates test users answering ACTIVE_ARCIUM questions
 * Runs every 15 minutes (configurable)
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const summary = {
    timestamp: new Date().toISOString(),
    questionId: null as number | null,
    epochId: null as string | null,
    usersSelected: 0,
    successful: 0,
    skipped: 0,
    errors: [] as string[],
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

    // Get active ARCIUM question
    const activeQuestion = await getActiveArciumQuestion();
    if (!activeQuestion) {
      console.log(
        `[TEST-ANSWERS] ${summary.timestamp} - No ACTIVE_ARCIUM question found`
      );
      return NextResponse.json({
        success: true,
        message: "No active ARCIUM question",
        summary,
      });
    }

    summary.questionId = activeQuestion.id;
    summary.epochId = activeQuestion.epoch_id;

    // Get all test users
    const testUsers = await getTestUsers();
    if (testUsers.length === 0) {
      console.log(`[TEST-ANSWERS] ${summary.timestamp} - No test users found`);
      return NextResponse.json({
        success: true,
        message: "No test users found",
        summary,
      });
    }

    // Select random subset of users
    const answerPercentage =
      parseFloat(process.env.TEST_ANSWER_PERCENTAGE || "0.3") || 0.3;
    const selectedUsers = selectRandomUsers(testUsers, answerPercentage);
    summary.usersSelected = selectedUsers.length;

    if (selectedUsers.length === 0) {
      console.log(`[TEST-ANSWERS] ${summary.timestamp} - No users selected`);
      return NextResponse.json({
        success: true,
        message: "No users selected",
        summary,
      });
    }

    // Process each user
    for (const user of selectedUsers) {
      try {
        // Generate unique nullifier for this user/question/epoch combination
        const nullifier = generateUniqueNullifier(
          user.id,
          activeQuestion.id,
          activeQuestion.epoch_id
        );

        // Check if user already answered
        const alreadyAnswered = await hasUserAnswered(
          nullifier,
          activeQuestion.id,
          activeQuestion.epoch_id
        );

        if (alreadyAnswered) {
          summary.skipped++;
          continue;
        }

        // Generate dummy values
        const commitment = generateDummyCommitment();
        const encryptedAnswer = generateDummyEncryptedAnswer();
        const answerBit = Math.random() < 0.5 ? 0 : 1; // Random 0 or 1

        // Insert response commitment
        const insertRow: Record<string, unknown> = {
          question_id: activeQuestion.id,
          epoch_id: activeQuestion.epoch_id,
          nullifier,
          commitment,
          encrypted_answer: encryptedAnswer,
          tmp_answer_bit: answerBit,
        };

        if (activeQuestion.arcium_poll_id != null) {
          insertRow.arcium_poll_id = activeQuestion.arcium_poll_id;
        }

        const { error: insertError } = await supabase
          .from("response_commitments")
          .insert(insertRow);

        if (insertError) {
          if (insertError.code === "23505") {
            // Unique constraint violation (already answered)
            summary.skipped++;
            continue;
          }
          throw insertError;
        }

        // Award 10 XP (task_code: 1 = answered a question)
        const XP_AWARDED = 10;
        const { error: xpError } = await supabase.from("user_xp").insert({
          user_id: user.id,
          points: XP_AWARDED,
          task_code: 1,
        });

        if (xpError) {
          console.error(
            `[TEST-ANSWERS] Failed to award XP to user ${user.id}:`,
            xpError
          );
          summary.errors.push(
            `XP award failed for ${user.username}: ${xpError.message}`
          );
        } else {
          summary.successful++;
        }
      } catch (userError) {
        const errorMsg =
          userError instanceof Error ? userError.message : String(userError);
        console.error(
          `[TEST-ANSWERS] Error processing user ${user.username}:`,
          userError
        );
        summary.errors.push(`${user.username}: ${errorMsg}`);
      }
    }

    const duration = Date.now() - startTime;
    console.log(
      `[TEST-ANSWERS] ${summary.timestamp} - Question ${summary.questionId} (${summary.epochId}) - Selected: ${summary.usersSelected}, Success: ${summary.successful}, Skipped: ${summary.skipped}, Errors: ${summary.errors.length}, Duration: ${duration}ms`
    );

    return NextResponse.json({
      success: true,
      summary,
      durationMs: duration,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[TEST-ANSWERS] ${summary.timestamp} - Fatal error:`, err);
    summary.errors.push(`Fatal: ${errorMsg}`);

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
