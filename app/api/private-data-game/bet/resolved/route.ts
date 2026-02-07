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
  epoch_id: string;
  game_status: string;
  closes_at: string | null;
};

type AnswerRow = { id: number; text: string };

type AggregateRow = {
  question_id: number;
  epoch_id: string;
  winning_answer: number;
  finalized_at: string;
};

/**
 * GET /api/private-data-game/bet/resolved
 * Returns resolved bet markets (FINALIZED or DEACTIVATE) that had bets.
 */
export async function GET() {
  try {
    const session = await getServerSession();

    const { data: betMarkets, error: betErr } = await supabase
      .from("user_bets")
      .select("question_id, epoch_id")
      .limit(1000);

    if (betErr) {
      console.error("bet/resolved user_bets error:", betErr);
      return NextResponse.json({ error: betErr.message }, { status: 500 });
    }

    const markets = betMarkets ?? [];
    const seen = new Set<string>();
    const marketKeys: { question_id: number; epoch_id: string }[] = [];
    for (const m of markets as { question_id: number; epoch_id: string }[]) {
      const key = `${m.question_id}:${m.epoch_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        marketKeys.push(m);
      }
    }

    if (marketKeys.length === 0) {
      return NextResponse.json({ resolved: [] });
    }

    const { data: questions, error: qErr } = await supabase
      .from("questions_repo")
      .select("id, title, img, text, epoch_id, game_status, closes_at")
      .in("game_status", ["FINALIZED", "DEACTIVATE"]);

    if (qErr) {
      console.error("bet/resolved questions error:", qErr);
      return NextResponse.json({ error: qErr.message }, { status: 500 });
    }

    const marketKeySet = new Set(
      marketKeys.map((m) => `${m.question_id}:${m.epoch_id}`)
    );
    const resolvedQuestions = (questions ?? []).filter((q) =>
      marketKeySet.has(`${q.id}:${q.epoch_id}`)
    ) as QuestionRow[];

    if (resolvedQuestions.length === 0) {
      return NextResponse.json({ resolved: [] });
    }

    const questionIds = Array.from(new Set(resolvedQuestions.map((q) => q.id)));

    const { data: aggregates } = await supabase
      .from("question_aggregates")
      .select("question_id, epoch_id, winning_answer, finalized_at")
      .in("question_id", questionIds);

    const aggMap = new Map<string, AggregateRow>();
    for (const a of (aggregates ?? []) as AggregateRow[]) {
      aggMap.set(`${a.question_id}:${a.epoch_id}`, a);
    }

    const { data: answers } = await supabase
      .from("question_answers")
      .select("question_id, id, text")
      .in("question_id", questionIds);

    const answersByQ = new Map<number, AnswerRow[]>();
    for (const a of (answers ?? []) as {
      question_id: number;
      id: number;
      text: string;
    }[]) {
      const list = answersByQ.get(a.question_id) ?? [];
      list.push({ id: a.id, text: a.text });
      answersByQ.set(a.question_id, list);
    }

    const { data: allBets } = await supabase
      .from("user_bets")
      .select("user_id, question_id, epoch_id, answer_bit, xp_amount")
      .in(
        "question_id",
        resolvedQuestions.map((q) => q.id)
      );

    const { data: allClaims } = await supabase
      .from("user_bet_claims")
      .select("user_id, question_id, epoch_id, xp_claimed")
      .in(
        "question_id",
        resolvedQuestions.map((q) => q.id)
      );

    const userId = session?.userId;

    type BetRow = {
      user_id: string;
      question_id: number;
      epoch_id: string;
      answer_bit: number;
      xp_amount: number;
    };
    type ClaimRow = {
      user_id: string;
      question_id: number;
      epoch_id: string;
      xp_claimed: number;
    };

    const betsByMarket = new Map<string, BetRow[]>();
    for (const b of (allBets ?? []) as BetRow[]) {
      const key = `${b.question_id}:${b.epoch_id}`;
      const list = betsByMarket.get(key) ?? [];
      list.push(b);
      betsByMarket.set(key, list);
    }

    const claimsByUserMarket = new Map<string, ClaimRow>();
    for (const c of (allClaims ?? []) as ClaimRow[]) {
      claimsByUserMarket.set(`${c.user_id}:${c.question_id}:${c.epoch_id}`, c);
    }

    const resolved = resolvedQuestions.map((q) => {
      const key = `${q.id}:${q.epoch_id}`;
      const agg = aggMap.get(key);
      const resolutionType =
        q.game_status === "FINALIZED" ? "FINALIZED" : "DEACTIVATE";
      const winningAnswer =
        resolutionType === "FINALIZED" && agg ? agg.winning_answer : null;

      const bets = betsByMarket.get(key) ?? [];
      let totalXpAnswer0 = 0;
      let totalXpAnswer1 = 0;
      let myBetAnswer0 = 0;
      let myBetAnswer1 = 0;
      for (const b of bets) {
        if (b.answer_bit === 0) {
          totalXpAnswer0 += b.xp_amount;
          if (userId && b.user_id === userId) myBetAnswer0 = b.xp_amount;
        } else {
          totalXpAnswer1 += b.xp_amount;
          if (userId && b.user_id === userId) myBetAnswer1 = b.xp_amount;
        }
      }

      const myRefundable = myBetAnswer0 + myBetAnswer1;
      const claim = userId
        ? claimsByUserMarket.get(`${userId}:${q.id}:${q.epoch_id}`)
        : null;
      const myClaimed = claim?.xp_claimed ?? null;

      let canClaim = false;
      let myWinnings: number | null = null;

      if (resolutionType === "FINALIZED" && winningAnswer !== null) {
        const winningPool =
          winningAnswer === 0 ? totalXpAnswer0 : totalXpAnswer1;
        const losingPool =
          winningAnswer === 0 ? totalXpAnswer1 : totalXpAnswer0;
        const myStake = winningAnswer === 0 ? myBetAnswer0 : myBetAnswer1;
        if (myStake > 0 && !claim && winningPool > 0) {
          myWinnings =
            myStake + Math.floor((myStake / winningPool) * losingPool);
          canClaim = true;
        }
      } else if (resolutionType === "DEACTIVATE") {
        if (myRefundable > 0 && !claim) {
          canClaim = true;
        }
      }

      const ansList = answersByQ.get(q.id) ?? [];
      const answerA = ansList[0]?.text ?? "";
      const answerB = ansList[1]?.text ?? "";

      return {
        questionId: q.id,
        epochId: q.epoch_id,
        title: q.title,
        img: q.img,
        text: q.text,
        closesAt: q.closes_at,
        resolutionType,
        winningAnswer,
        answerAText: answerA,
        answerBText: answerB,
        totalXpAnswer0,
        totalXpAnswer1,
        myBets: { answer0: myBetAnswer0, answer1: myBetAnswer1 },
        myClaimed,
        myRefundable,
        myWinnings,
        canClaim,
        finalizedAt: agg?.finalized_at ?? null,
      };
    });

    resolved.sort((a, b) => {
      const aTime = a.finalizedAt ?? a.closesAt ?? "";
      const bTime = b.finalizedAt ?? b.closesAt ?? "";
      return bTime.localeCompare(aTime);
    });

    return NextResponse.json({ resolved });
  } catch (err) {
    console.error("bet/resolved error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
