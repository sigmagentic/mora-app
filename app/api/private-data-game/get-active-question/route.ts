import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { GameQuestion, GameQuestionAnswer } from "@/types/types";
import { getServerSession } from "@/lib/auth-utils";
import { getEpochId, getOpensAt, getClosesAt, toTimestampStr } from "@/lib/game-epoch";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();

    console.log("session ", session);

    if (!session) {
      return NextResponse.json({ user: null });
    }

    const now = new Date();
    const _isActiveHHDDMMYY = getEpochId(now); // HHDDMMYY, hour 1–24, month 1–12

    /*
    Ultimate goal: ONLY EVER one ACTIVE question at a time with epoch_id === _isActiveHHDDMMYY.

    Rules:
    1. _isActiveHHDDMMYY = current LIVE epoch_id
    2. At most TWO ACTIVE total (or zero on first play). Abort if >2 (corrupted).
    3. DORMANT: we need at least 1 DORMANT only when we must promote (no ACTIVE with matching epoch). If none, error.
    4. If one ACTIVE with epoch_id === _isActiveHHDDMMYY: use it, get answers, return. Close other ACTIVE (different epoch).
    5. If none: get a DORMANT, set game_status=ACTIVE, epoch_id, opens_at, closes_at (UTC hour). Close other ACTIVE (different epoch). Return.
    6. If multiple ACTIVE with same epoch_id: corrupted; return 500.
    */


    // Rule 2: at most 2 ACTIVE total (current + previous epoch) or 0. Abort if >2.
    const { data: activeQuestionsData, error: activeQuestionsError } = await supabase
      .from("questions_repo")
      .select("*")
      .eq("game_status", "ACTIVE")
      .limit(3);

    if (!activeQuestionsError && activeQuestionsData && activeQuestionsData.length > 2) {
      return NextResponse.json(
        { error: "Corrupted gameplay state as there are more than two active questions which should NOT happen" },
        { status: 500 }
      );
    }

    // Find ACTIVE question(s) with epoch_id === _isActiveHHDDMMYY. Use limit(2) to detect corruption (multiple with same epoch).
    const { data: activeQuestionList, error: selectError } = await supabase
      .from("questions_repo")
      .select("*")
      .eq("game_status", "ACTIVE")
      .eq("epoch_id", _isActiveHHDDMMYY)
      .limit(2);

    if (selectError) {
      console.error("Error checking active question:", selectError);
      return NextResponse.json(
        { error: "Error checking active question" },
        { status: 500 }
      );
    }

    // Corrupted: more than one ACTIVE with same epoch_id.
    if (activeQuestionList && activeQuestionList.length > 1) {
      return NextResponse.json(
        { error: "Corrupted gameplay state: multiple ACTIVE questions with same epoch_id" },
        { status: 500 }
      );
    }

    let activeQuestionData: (typeof activeQuestionList)[0] | null =
      activeQuestionList && activeQuestionList.length === 1 ? activeQuestionList[0] : null;

    // Helper: close other ACTIVE questions (different epoch_id). Best-effort; log on error.
    const closeOtherActive = async () => {
      const { error: closeErr } = await supabase
        .from("questions_repo")
        .update({ game_status: "CLOSED" })
        .neq("epoch_id", _isActiveHHDDMMYY)
        .eq("game_status", "ACTIVE");
      if (closeErr) {
        console.error("Error closing other active questions:", closeErr);
      }
    };

    if (activeQuestionData) {
      // Have matching ACTIVE for this epoch. Close any ACTIVE from other epochs, then serve.
      await closeOtherActive();
    } else {
      // No ACTIVE for this epoch: promote a DORMANT. Require at least one DORMANT (rule 3). Get the most recently added one using the created_at TIMESTAMP field in the DB
      const { data: dormantQuestionData, error: dormantError } = await supabase
        .from("questions_repo")
        .select("*")
        .eq("game_status", "DORMANT")
        .order("created_at", { ascending: false }) // Get most recently added DORMANT
        .limit(1)
        .single();

      if (dormantError || !dormantQuestionData) {
        return NextResponse.json(
          { error: "No questions available" },
          { status: 500 }
        );
      }

      activeQuestionData = dormantQuestionData;

      // opens_at / closes_at: start and end of current UTC hour. DB type is timestamp (no TZ).
      // toTimestampStr yields "YYYY-MM-DD HH:mm:ss.sss" to store literal UTC.
      const opensAt = getOpensAt(now);
      const closesAt = getClosesAt(now);

      const { error: updateError } = await supabase
        .from("questions_repo")
        .update({
          game_status: "ACTIVE",
          epoch_id: _isActiveHHDDMMYY,
          opens_at: toTimestampStr(opensAt),
          closes_at: toTimestampStr(closesAt),
        })
        .eq("id", activeQuestionData.id);

      if (updateError) {
        console.error("Error updating question metadata:", updateError);
        return NextResponse.json(
          { error: "Error updating question metadata" },
          { status: 500 }
        );
      }

      // Close other ACTIVE (previous epoch) so we keep only one ACTIVE per epoch (rule 5).
      await closeOtherActive();
    }

    // Get answers for the selected question
    const { data: answersData, error: answersError } = await supabase
      .from("question_answers")
      .select("*")
      .eq("question_id", activeQuestionData.id)
      .order("id"); // Assuming insertion order

    if (answersError) {
      console.error("Error fetching answers:", answersError);
      return NextResponse.json(
        { error: "Error fetching answers" },
        { status: 500 }
      );
    }

    // Map answers to GameQuestionAnswer format
    const answers: GameQuestionAnswer[] = (answersData ?? []).map(
      (ans: GameQuestionAnswer) => ({
        id: ans.id,
        text: ans.text,
      })
    );

    // Construct the GameQuestion object
    const activeQuestion: GameQuestion = {
      id: activeQuestionData.id,
      title: activeQuestionData.title,
      img: activeQuestionData.img,
      text: activeQuestionData.text,
      answers,
    };

    return NextResponse.json({ activeQuestion });
  } catch (err) {
    console.error("get-active-question error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
