import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateManageApiKey } from "@/lib/manage-api-auth";

export const runtime = "edge";

/**
 * POST /api/private-data-game/manage/aggregate-commitments
 * Body: { epoch_id: string }
 * Aggregates tmp_answer_bit from matching response_commitments, inserts into
 * question_aggregates, and sets questions_repo.game_status = 'FINALIZED'.
 * Requires x-api-key header (MANAGE_API_KEY).
 */
export async function POST(request: NextRequest) {
  const auth = validateManageApiKey(request);
  if (auth) return auth;

  let body: { epoch_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }
  const epochId = body?.epoch_id?.trim();
  if (!epochId) {
    return NextResponse.json(
      { error: "epoch_id is required" },
      { status: 400 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 500 }
    );
  }
  const supabase = createClient(url, key);

  try {
    const { data: commitments, error: fetchErr } = await supabase
      .from("response_commitments")
      .select("question_id, tmp_answer_bit")
      .eq("epoch_id", epochId);

    if (fetchErr) {
      console.error("aggregate-commitments fetch error:", fetchErr);
      return NextResponse.json(
        { error: fetchErr.message },
        { status: 500 }
      );
    }

    if (!commitments?.length) {
      return NextResponse.json(
        { error: "No commitments found for this epoch_id" },
        { status: 400 }
      );
    }

    const questionId = commitments[0].question_id as number;
    let answerACount = 0;
    let answerBCount = 0;
    for (const c of commitments) {
      const bit = c.tmp_answer_bit;
      if (bit === 0 || bit === "0") answerACount++;
      else if (bit === 1 || bit === "1") answerBCount++;
    }
    const totalResponses = commitments.length;
    const winningAnswer = answerACount >= answerBCount ? 0 : 1;
    const aggregationCommitment = `${epochId}_${totalResponses}_${winningAnswer}`;

    const { error: insertErr } = await supabase.from("question_aggregates").insert({
      question_id: questionId,
      epoch_id: epochId,
      total_responses: totalResponses,
      answer_a_count: answerACount,
      answer_b_count: answerBCount,
      winning_answer: winningAnswer,
      aggregation_commitment: aggregationCommitment,
      aggregation_source: "DB",
    });

    if (insertErr) {
      console.error("aggregate-commitments insert error:", insertErr);
      return NextResponse.json(
        { error: insertErr.message },
        { status: 500 }
      );
    }

    const { error: updateErr } = await supabase
      .from("questions_repo")
      .update({ game_status: "FINALIZED" })
      .eq("epoch_id", epochId);

    if (updateErr) {
      console.error("aggregate-commitments update questions_repo error:", updateErr);
      return NextResponse.json(
        { error: updateErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("aggregate-commitments error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
