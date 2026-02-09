import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  getTestUsers,
  getActiveArciumQuestion,
  getUserTotalXp,
  getUserBets,
  selectRandomUsers,
  randomInt,
} from "@/lib/test-activity-utils";

export const runtime = "edge";

/**
 * GET /api/cron/test-activity-bets
 * CRON job that simulates test users placing bets on ACTIVE_ARCIUM questions
 * Runs every 30 minutes (configurable)
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
        `[TEST-BETS] ${summary.timestamp} - No ACTIVE_ARCIUM question found`
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
      console.log(`[TEST-BETS] ${summary.timestamp} - No test users found`);
      return NextResponse.json({
        success: true,
        message: "No test users found",
        summary,
      });
    }

    // Filter users with XP > 0
    const usersWithXp: Array<{ user: (typeof testUsers)[0]; totalXp: number }> =
      [];
    for (const user of testUsers) {
      const totalXp = await getUserTotalXp(user.id);
      if (totalXp > 0) {
        usersWithXp.push({ user, totalXp });
      }
    }

    if (usersWithXp.length === 0) {
      console.log(
        `[TEST-BETS] ${summary.timestamp} - No test users with XP found`
      );
      return NextResponse.json({
        success: true,
        message: "No test users with XP",
        summary,
      });
    }

    // Select random subset of eligible users
    const betPercentage =
      parseFloat(process.env.TEST_BET_PERCENTAGE || "0.2") || 0.2;
    const selectedUsers = selectRandomUsers(usersWithXp, betPercentage);
    summary.usersSelected = selectedUsers.length;

    if (selectedUsers.length === 0) {
      console.log(`[TEST-BETS] ${summary.timestamp} - No users selected`);
      return NextResponse.json({
        success: true,
        message: "No users selected",
        summary,
      });
    }

    // Configuration for bet amounts
    const minBetXp = parseInt(process.env.TEST_BET_MIN_XP || "1", 10) || 1;
    const maxBetXp = parseInt(process.env.TEST_BET_MAX_XP || "20", 10) || 20;

    // Process each user
    for (const { user, totalXp } of selectedUsers) {
      try {
        // Get existing bets for this question/epoch
        const existingBets = await getUserBets(
          user.id,
          activeQuestion.id,
          activeQuestion.epoch_id
        );

        let existingBetAnswer0 = 0;
        let existingBetAnswer1 = 0;
        for (const bet of existingBets) {
          if (bet.answer_bit === 0) {
            existingBetAnswer0 = bet.xp_amount;
          } else {
            existingBetAnswer1 = bet.xp_amount;
          }
        }

        const currentBetsTotal = existingBetAnswer0 + existingBetAnswer1;
        const availableXp = totalXp - currentBetsTotal;

        if (availableXp < minBetXp) {
          summary.skipped++;
          continue;
        }

        // Random bet amount (within available XP and config limits)
        const maxPossibleBet = Math.min(availableXp, maxBetXp);
        const betAmount = randomInt(minBetXp, maxPossibleBet);

        // Random answer bit (0 or 1)
        const answerBit = Math.random() < 0.5 ? 0 : 1;

        // Calculate new bet amount for this side
        const currentBetOnSide =
          answerBit === 0 ? existingBetAnswer0 : existingBetAnswer1;
        const newBetOnSide = currentBetOnSide + betAmount;

        // Deduct XP (task_code: 2 = betting)
        const { error: xpError } = await supabase.from("user_xp").insert({
          user_id: user.id,
          points: -betAmount,
          task_code: 2,
        });

        if (xpError) {
          throw new Error(`XP deduction failed: ${xpError.message}`);
        }

        // Update or insert bet record
        if (currentBetOnSide === 0) {
          // Insert new bet
          const { error: betError } = await supabase.from("user_bets").insert({
            user_id: user.id,
            question_id: activeQuestion.id,
            epoch_id: activeQuestion.epoch_id,
            answer_bit: answerBit,
            xp_amount: newBetOnSide,
          });

          if (betError) {
            // Rollback XP deduction if bet insert fails
            await supabase.from("user_xp").insert({
              user_id: user.id,
              points: betAmount, // Refund
              task_code: 2,
            });
            throw betError;
          }
        } else {
          // Update existing bet
          const { error: betError } = await supabase
            .from("user_bets")
            .update({ xp_amount: newBetOnSide })
            .eq("user_id", user.id)
            .eq("question_id", activeQuestion.id)
            .eq("epoch_id", activeQuestion.epoch_id)
            .eq("answer_bit", answerBit);

          if (betError) {
            // Rollback XP deduction if bet update fails
            await supabase.from("user_xp").insert({
              user_id: user.id,
              points: betAmount, // Refund
              task_code: 2,
            });
            throw betError;
          }
        }

        summary.successful++;
      } catch (userError) {
        const errorMsg =
          userError instanceof Error ? userError.message : String(userError);
        console.error(
          `[TEST-BETS] Error processing user ${user.username}:`,
          userError
        );
        summary.errors.push(`${user.username}: ${errorMsg}`);
      }
    }

    const duration = Date.now() - startTime;
    console.log(
      `[TEST-BETS] ${summary.timestamp} - Question ${summary.questionId} (${summary.epochId}) - Selected: ${summary.usersSelected}, Success: ${summary.successful}, Skipped: ${summary.skipped}, Errors: ${summary.errors.length}, Duration: ${duration}ms`
    );

    return NextResponse.json({
      success: true,
      summary,
      durationMs: duration,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[TEST-BETS] ${summary.timestamp} - Fatal error:`, err);
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
