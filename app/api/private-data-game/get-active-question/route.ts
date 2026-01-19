import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { GameQuestion, GameQuestionAnswer } from "@/types/types";
import { getServerSession } from "@/lib/auth-utils";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();

    console.log("session ", session);

    if (!session) {
      return NextResponse.json({ user: null });
    }

    // Compute _isActiveHHDDMMYY in UTC
    const now = new Date();
    const dd = String(now.getUTCDate()).padStart(2, "0");
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const yy = String(now.getUTCFullYear()).slice(-2);
    const hh = String(now.getUTCHours() + 1).padStart(2, "0");

    const _isActiveHHDDMMYY = `${hh}${dd}${mm}${yy}`;

    // First, try to find a question with matching is_active_hhddmmyy
    let { data: activeQuestionData, error: selectError } = await supabase
      .from("questions_repo")
      .select("*")
      .eq("is_active_hhddmmyy", _isActiveHHDDMMYY)
      .single();

    // If no matching record, get the least recently selected question (smallest last_selected_as_active_epoch_ts)
    if (selectError || !activeQuestionData) {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from("questions_repo")
        .select("*")
        .order("last_selected_as_active_epoch_ts", { ascending: true })
        .limit(1)
        .single();

      if (fallbackError || !fallbackData) {
        console.error("No questions available:", fallbackError);
        return NextResponse.json(
          { error: "No questions available" },
          { status: 500 }
        );
      }

      activeQuestionData = fallbackData;

      // Update the selected question's metadata as it was just selected
      const { error: updateError } = await supabase
        .from("questions_repo")
        .update({
          last_selected_as_active_epoch_ts: Date.now(),
          is_active_hhddmmyy: _isActiveHHDDMMYY,
          asked_count_sum: activeQuestionData.asked_count_sum + 1,
        })
        .eq("id", activeQuestionData.id);

      if (updateError) {
        console.error("Error updating question metadata:", updateError);
        // Note: Not returning error here as the question was already fetched successfully
      }
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

    // Map answers to GameQuestionAnswer format with sequential ids starting from 1
    const answers: GameQuestionAnswer[] = answersData.map(
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
