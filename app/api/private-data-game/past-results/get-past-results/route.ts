import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "edge";

type AggregateRow = {
  id: number;
  question_id: number;
  epoch_id: string;
  total_responses: number;
  answer_a_count: number;
  answer_b_count: number;
  winning_answer: number;
  finalized_at: string;
};
type QuestionRow = { id: number; img: string | null; title: string | null; text: string };
type AnswerRow = { question_id: number; id: number; text: string };

export type PastResultItem = {
  question_id: number;
  epoch_id: string;
  img: string | null;
  title: string | null;
  text: string;
  total_responses: number;
  answer_a_text: string;
  answer_b_text: string;
  answer_a_count: number;
  answer_b_count: number;
  winning_answer: number;
  finalized_at: string;
};

/**
 * GET /api/private-data-game/past-results/get-past-results
 * Returns question_aggregates joined with questions_repo and question_answers,
 * ordered by finalized_at desc (most recent first). Public API.
 */
export async function GET() {
  try {
    const { data: aggregates, error: aggErr } = await supabase
      .from("question_aggregates")
      .select("id, question_id, epoch_id, total_responses, answer_a_count, answer_b_count, winning_answer, finalized_at")
      .order("finalized_at", { ascending: false });

    if (aggErr) {
      console.error("get-past-results aggregates error:", aggErr);
      return NextResponse.json({ error: aggErr.message }, { status: 500 });
    }

    const rows = (aggregates ?? []) as AggregateRow[];
    if (rows.length === 0) {
      return NextResponse.json([]);
    }

    const questionIds = Array.from(new Set(rows.map((r) => r.question_id)));

    const { data: questions, error: qErr } = await supabase
      .from("questions_repo")
      .select("id, img, title, text")
      .in("id", questionIds);

    if (qErr) {
      console.error("get-past-results questions error:", qErr);
      return NextResponse.json({ error: qErr.message }, { status: 500 });
    }

    const { data: answers, error: aErr } = await supabase
      .from("question_answers")
      .select("question_id, id, text")
      .in("question_id", questionIds);

    if (aErr) {
      console.error("get-past-results answers error:", aErr);
      return NextResponse.json({ error: aErr.message }, { status: 500 });
    }

    const questionMap = new Map<number, QuestionRow>();
    for (const q of (questions ?? []) as QuestionRow[]) {
      questionMap.set(q.id, q);
    }

    const rawAnswers = (answers ?? []) as AnswerRow[];
    rawAnswers.sort((a, b) =>
      a.question_id !== b.question_id
        ? a.question_id - b.question_id
        : a.id - b.id
    );
    const answersByQuestion = new Map<number, AnswerRow[]>();
    for (const a of rawAnswers) {
      const list = answersByQuestion.get(a.question_id) ?? [];
      list.push(a);
      answersByQuestion.set(a.question_id, list);
    }

    const result: PastResultItem[] = rows.map((agg) => {
      const q = questionMap.get(agg.question_id);
      const ansList = answersByQuestion.get(agg.question_id) ?? [];
      const answerA = ansList[0]?.text ?? "";
      const answerB = ansList[1]?.text ?? "";
      return {
        question_id: agg.question_id,
        epoch_id: agg.epoch_id,
        img: q?.img ?? null,
        title: q?.title ?? null,
        text: q?.text ?? "",
        total_responses: agg.total_responses,
        answer_a_text: answerA,
        answer_b_text: answerB,
        answer_a_count: agg.answer_a_count,
        answer_b_count: agg.answer_b_count,
        winning_answer: agg.winning_answer,
        finalized_at: agg.finalized_at,
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("get-past-results error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
