import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getServerSession } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";
export const runtime = "edge";

type QuestionRow = {
  id: number;
  title: string | null;
  img: string | null;
  text: string;
  epoch_id: string | null;
  closes_at: string | null;
};

type AnswerRow = { id: number; text: string };

/**
 * GET /api/private-data-game/bet/market
 * Returns the current bet market (ACTIVE_ARCIUM question) or null.
 */
export async function GET() {
  try {
    const session = await getServerSession();

    const { data: questions, error: qErr } = await supabase
      .from("questions_repo")
      .select("id, title, img, text, epoch_id, closes_at")
      .eq("game_status", "ACTIVE_ARCIUM")
      .limit(1)
      .maybeSingle();

    if (qErr) {
      console.error("bet/market questions error:", qErr);
      return NextResponse.json({ error: qErr.message }, { status: 500 });
    }

    if (!questions) {
      return NextResponse.json({ market: null });
    }

    const q = questions as QuestionRow;
    const questionId = q.id;
    const epochId = q.epoch_id ?? "";

    const { data: answers, error: aErr } = await supabase
      .from("question_answers")
      .select("id, text")
      .eq("question_id", questionId)
      .order("id");

    if (aErr) {
      console.error("bet/market answers error:", aErr);
      return NextResponse.json({ error: aErr.message }, { status: 500 });
    }

    const answersList = (answers ?? []) as AnswerRow[];
    const answersWithBit = answersList.map((a, i) => ({
      id: a.id,
      text: a.text,
      answerBit: i as 0 | 1,
    }));

    const { data: bets, error: betsErr } = await supabase
      .from("user_bets")
      .select("user_id, answer_bit, xp_amount")
      .eq("question_id", questionId)
      .eq("epoch_id", epochId);

    if (betsErr) {
      console.error("bet/market bets error:", betsErr);
      return NextResponse.json({ error: betsErr.message }, { status: 500 });
    }

    const betsList = bets ?? [];
    let totalXpAnswer0 = 0;
    let totalXpAnswer1 = 0;
    let myBetAnswer0 = 0;
    let myBetAnswer1 = 0;

    const userId = session?.userId;
    for (const b of betsList as {
      user_id: string;
      answer_bit: number;
      xp_amount: number;
    }[]) {
      const amt = b.xp_amount;
      if (b.answer_bit === 0) {
        totalXpAnswer0 += amt;
        if (userId && b.user_id === userId) myBetAnswer0 = amt;
      } else {
        totalXpAnswer1 += amt;
        if (userId && b.user_id === userId) myBetAnswer1 = amt;
      }
    }

    let userTotalXp = 0;
    if (userId) {
      const { data: xpResult } = await supabase.rpc("get_user_total_xp", {
        p_user_id: userId,
      });
      userTotalXp =
        Array.isArray(xpResult) && xpResult[0]?.total_xp != null
          ? Number(xpResult[0].total_xp)
          : 0;
    }

    return NextResponse.json({
      market: {
        id: q.id,
        title: q.title,
        img: q.img,
        text: q.text,
        epochId: epochId,
        closesAt: q.closes_at,
        bettingEndsAt: q.closes_at,
        answers: answersWithBit,
        totalXpAnswer0,
        totalXpAnswer1,
        myBets: { answer0: myBetAnswer0, answer1: myBetAnswer1 },
        userTotalXp,
      },
    });
  } catch (err) {
    console.error("bet/market error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
