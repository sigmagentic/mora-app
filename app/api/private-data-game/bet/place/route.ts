import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getServerSession } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";
export const runtime = "edge";

type PlacePayload = {
  questionId: number;
  epochId: string;
  answerBit: 0 | 1;
  xpAmount: number;
};

function isPlacePayload(v: unknown): v is PlacePayload {
  return (
    typeof v === "object" &&
    v !== null &&
    "questionId" in v &&
    typeof (v as PlacePayload).questionId === "number" &&
    "epochId" in v &&
    typeof (v as PlacePayload).epochId === "string" &&
    "answerBit" in v &&
    ((v as PlacePayload).answerBit === 0 ||
      (v as PlacePayload).answerBit === 1) &&
    "xpAmount" in v &&
    typeof (v as PlacePayload).xpAmount === "number" &&
    (v as PlacePayload).xpAmount !== 0
  );
}

/**
 * POST /api/private-data-game/bet/place
 * Body: { questionId, epochId, answerBit, xpAmount } - xpAmount positive to add, negative to remove
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || !isPlacePayload(body)) {
      return NextResponse.json(
        {
          error:
            "Invalid body: need questionId, epochId, answerBit (0|1), xpAmount (non-zero)",
        },
        { status: 400 }
      );
    }

    const { questionId, epochId, answerBit, xpAmount } = body;

    const { data: question, error: qErr } = await supabase
      .from("questions_repo")
      .select("id, game_status, closes_at")
      .eq("id", questionId)
      .eq("epoch_id", epochId)
      .single();

    if (qErr || !question) {
      return NextResponse.json({ error: "Market not found" }, { status: 404 });
    }

    if (question.game_status !== "ACTIVE_ARCIUM") {
      return NextResponse.json(
        { error: "Market is not open for betting" },
        { status: 400 }
      );
    }

    const { data: xpResult } = await supabase.rpc("get_user_total_xp", {
      p_user_id: session.userId,
    });
    const userTotalXp =
      Array.isArray(xpResult) && xpResult[0]?.total_xp != null
        ? Number(xpResult[0].total_xp)
        : 0;

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
    const currentBetsTotal = myBetAnswer0 + myBetAnswer1;

    const currentBetOnSide = answerBit === 0 ? myBetAnswer0 : myBetAnswer1;
    const newBetOnSide = currentBetOnSide + xpAmount;

    if (newBetOnSide < 0) {
      return NextResponse.json(
        { error: "Cannot remove more XP than you have bet on this answer" },
        { status: 400 }
      );
    }

    if (xpAmount > 0) {
      const availableAfterBets = userTotalXp - currentBetsTotal;
      if (xpAmount > availableAfterBets) {
        return NextResponse.json(
          {
            error:
              "Insufficient XP. You have " +
              userTotalXp +
              " XP total, " +
              currentBetsTotal +
              " already in bets.",
          },
          { status: 400 }
        );
      }
    }

    if (xpAmount > 0) {
      const { error: xpErr } = await supabase.from("user_xp").insert({
        user_id: session.userId,
        points: -xpAmount,
        task_code: 2,
      });
      if (xpErr) {
        console.error("bet/place user_xp insert error:", xpErr);
        return NextResponse.json(
          { error: "Failed to deduct XP" },
          { status: 500 }
        );
      }
    } else {
      const { error: xpErr } = await supabase.from("user_xp").insert({
        user_id: session.userId,
        points: Math.abs(xpAmount),
        task_code: 2,
      });
      if (xpErr) {
        console.error("bet/place user_xp refund insert error:", xpErr);
        return NextResponse.json(
          { error: "Failed to refund XP" },
          { status: 500 }
        );
      }
    }

    if (newBetOnSide === 0) {
      const { error: delErr } = await supabase
        .from("user_bets")
        .delete()
        .eq("user_id", session.userId)
        .eq("question_id", questionId)
        .eq("epoch_id", epochId)
        .eq("answer_bit", answerBit);
      if (delErr) {
        console.error("bet/place delete error:", delErr);
      }
    } else {
      const { data: existing } = await supabase
        .from("user_bets")
        .select("id, xp_amount")
        .eq("user_id", session.userId)
        .eq("question_id", questionId)
        .eq("epoch_id", epochId)
        .eq("answer_bit", answerBit)
        .maybeSingle();

      if (existing) {
        const { error: updErr } = await supabase
          .from("user_bets")
          .update({ xp_amount: newBetOnSide })
          .eq("id", existing.id);
        if (updErr) {
          console.error("bet/place update error:", updErr);
        }
      } else {
        const { error: insErr } = await supabase.from("user_bets").insert({
          user_id: session.userId,
          question_id: questionId,
          epoch_id: epochId,
          answer_bit: answerBit,
          xp_amount: newBetOnSide,
        });
        if (insErr) {
          console.error("bet/place insert error:", insErr);
        }
      }
    }

    const { data: bets } = await supabase
      .from("user_bets")
      .select("user_id, answer_bit, xp_amount")
      .eq("question_id", questionId)
      .eq("epoch_id", epochId);

    let totalXpAnswer0 = 0;
    let totalXpAnswer1 = 0;
    let newMyBetAnswer0 = 0;
    let newMyBetAnswer1 = 0;
    for (const b of (bets ?? []) as {
      user_id: string;
      answer_bit: number;
      xp_amount: number;
    }[]) {
      const amt = b.xp_amount;
      if (b.answer_bit === 0) {
        totalXpAnswer0 += amt;
        if (b.user_id === session.userId) newMyBetAnswer0 = amt;
      } else {
        totalXpAnswer1 += amt;
        if (b.user_id === session.userId) newMyBetAnswer1 = amt;
      }
    }

    const { data: xpResult2 } = await supabase.rpc("get_user_total_xp", {
      p_user_id: session.userId,
    });
    const newUserTotalXp =
      Array.isArray(xpResult2) && xpResult2[0]?.total_xp != null
        ? Number(xpResult2[0].total_xp)
        : 0;

    return NextResponse.json({
      ok: true,
      market: {
        totalXpAnswer0,
        totalXpAnswer1,
        myBets: { answer0: newMyBetAnswer0, answer1: newMyBetAnswer1 },
        userTotalXp: newUserTotalXp,
      },
    });
  } catch (err) {
    console.error("bet/place error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
