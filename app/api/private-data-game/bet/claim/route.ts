import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getServerSession } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";
export const runtime = "edge";

type ClaimPayload = {
  questionId: number;
  epochId: string;
};

function isClaimPayload(v: unknown): v is ClaimPayload {
  return (
    typeof v === "object" &&
    v !== null &&
    "questionId" in v &&
    typeof (v as ClaimPayload).questionId === "number" &&
    "epochId" in v &&
    typeof (v as ClaimPayload).epochId === "string"
  );
}

/**
 * POST /api/private-data-game/bet/claim
 * Body: { questionId, epochId }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || !isClaimPayload(body)) {
      return NextResponse.json(
        { error: "Invalid body: need questionId, epochId" },
        { status: 400 }
      );
    }

    const { questionId, epochId } = body;

    const { data: question, error: qErr } = await supabase
      .from("questions_repo")
      .select("id, game_status")
      .eq("id", questionId)
      .eq("epoch_id", epochId)
      .single();

    if (qErr || !question) {
      return NextResponse.json({ error: "Market not found" }, { status: 404 });
    }

    if (
      question.game_status !== "FINALIZED_ARCIUM" &&
      question.game_status !== "DEACTIVATE_ARCIUM"
    ) {
      return NextResponse.json(
        { error: "Market is not claimable yet" },
        { status: 400 }
      );
    }

    const { data: existingClaim } = await supabase
      .from("user_bet_claims")
      .select("id")
      .eq("user_id", session.userId)
      .eq("question_id", questionId)
      .eq("epoch_id", epochId)
      .maybeSingle();

    if (existingClaim) {
      return NextResponse.json({ error: "Already claimed" }, { status: 400 });
    }

    const { data: myBets } = await supabase
      .from("user_bets")
      .select("answer_bit, xp_amount")
      .eq("user_id", session.userId)
      .eq("question_id", questionId)
      .eq("epoch_id", epochId);

    let myBetAnswer0 = 0;
    let myBetAnswer1 = 0;
    for (const b of myBets ?? []) {
      if (b.answer_bit === 0) myBetAnswer0 = b.xp_amount;
      else myBetAnswer1 = b.xp_amount;
    }
    const myTotalBet = myBetAnswer0 + myBetAnswer1;

    if (myTotalBet === 0) {
      return NextResponse.json(
        { error: "You did not bet on this market" },
        { status: 400 }
      );
    }

    let xpToClaim = 0;
    let referenceText = "";

    if (question.game_status === "DEACTIVATE_ARCIUM") {
      xpToClaim = myTotalBet;
      referenceText = `bet refund q${questionId} epoch ${epochId}`;
    } else {
      const { data: agg } = await supabase
        .from("question_aggregates")
        .select("winning_answer")
        .eq("question_id", questionId)
        .eq("epoch_id", epochId)
        .single();

      if (!agg) {
        return NextResponse.json(
          { error: "Aggregate not found" },
          { status: 500 }
        );
      }

      const winningAnswer = agg.winning_answer as 0 | 1;
      const myStake = winningAnswer === 0 ? myBetAnswer0 : myBetAnswer1;

      if (myStake === 0) {
        return NextResponse.json(
          { error: "You did not bet on the winning answer" },
          { status: 400 }
        );
      }

      const { data: allBets } = await supabase
        .from("user_bets")
        .select("answer_bit, xp_amount")
        .eq("question_id", questionId)
        .eq("epoch_id", epochId);

      let winningPool = 0;
      let losingPool = 0;
      for (const b of allBets ?? []) {
        const amt = b.xp_amount;
        if (b.answer_bit === winningAnswer) {
          winningPool += amt;
        } else {
          losingPool += amt;
        }
      }

      xpToClaim =
        winningPool > 0
          ? myStake + Math.floor((myStake / winningPool) * losingPool)
          : myStake;
      referenceText = `bet win q${questionId} epoch ${epochId}: ${myStake} + ${
        xpToClaim - myStake
      } winnings`;
    }

    const { data: claimRow, error: claimErr } = await supabase
      .from("user_bet_claims")
      .insert({
        user_id: session.userId,
        question_id: questionId,
        epoch_id: epochId,
        xp_claimed: xpToClaim,
      })
      .select("id")
      .single();

    if (claimErr) {
      console.error("bet/claim insert claim error:", claimErr);
      return NextResponse.json(
        { error: "Failed to record claim" },
        { status: 500 }
      );
    }

    const taskCode = question.game_status === "DEACTIVATE_ARCIUM" ? 4 : 3;
    const { error: xpErr } = await supabase.from("user_xp").insert({
      user_id: session.userId,
      points: xpToClaim,
      task_code: taskCode,
      reference_id: claimRow?.id ?? null,
      reference_text: referenceText,
    });

    if (xpErr) {
      console.error("bet/claim user_xp insert error:", xpErr);
      return NextResponse.json({ error: "Failed to add XP" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      xpClaimed: xpToClaim,
      resolutionType: question.game_status,
    });
  } catch (err) {
    console.error("bet/claim error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
