import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { validateManageApiKey } from "@/lib/manage-api-auth";

export const runtime = "edge";

type AnswerPayload = { text: string };
type AddQuestionPayload = {
  title?: string | null;
  img?: string | null;
  text: string;
  answers: AnswerPayload[];
};

function parseBody(body: unknown): AddQuestionPayload | null {
  if (!body || typeof body !== "object" || !("text" in body) || !("answers" in body))
    return null;
  const o = body as Record<string, unknown>;
  const text = o.text;
  const answers = o.answers;
  if (typeof text !== "string" || !Array.isArray(answers) || answers.length === 0)
    return null;
  const list: AnswerPayload[] = [];
  for (const a of answers) {
    if (!a || typeof a !== "object" || typeof (a as Record<string, unknown>).text !== "string")
      return null;
    list.push({ text: (a as { text: string }).text });
  }
  return {
    title: (o.title as string | null | undefined) ?? null,
    img: (o.img as string | null | undefined) ?? null,
    text,
    answers: list,
  };
}

/**
 * POST /api/private-data-game/manage/add-new-question-answer-set
 * Body: { title?, img?, text, answers: [{ text }] }
 * Inserts into questions_repo and question_answers. IDs are auto-generated.
 * Requires x-api-key header matching MANAGE_API_KEY.
 */
export async function POST(request: NextRequest) {
  const auth = validateManageApiKey(request);
  if (auth) return auth;

  try {
    let raw: unknown;
    try {
      const text = await request.text();
      if (!text?.trim()) {
        return NextResponse.json(
          { error: "Request body is empty. Use Body > raw > JSON in Postman and send a JSON object." },
          { status: 400 }
        );
      }


      console.log("text ", text); 
      console.log("typeof text ", typeof text); 
      raw = JSON.parse(text);
      console.log("raw ", raw);
    } catch (e) {
      console.error("Body read/parse error:", e);
      const msg = e instanceof SyntaxError
        ? "Invalid JSON in request body"
        : "Failed to read request body";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const payload = parseBody(raw);
    if (!payload) {
      return NextResponse.json(
        { error: "Invalid payload: need { text: string, answers: [{ text: string }, ...] }" },
        { status: 400 }
      );
    }

    const { data: q, error: qErr } = await supabase
      .from("questions_repo")
      .insert({
        title: payload.title ?? null,
        img: payload.img ?? null,
        text: payload.text,
      })
      .select("id")
      .single();

    if (qErr) {
      console.error("add-new-question-answer-set insert question error:", qErr);
      return NextResponse.json(
        { error: "Failed to insert question" },
        { status: 500 }
      );
    }

    const questionId = q.id as number;
    const rows = payload.answers.map((a) => ({ question_id: questionId, text: a.text }));

    const { error: aErr } = await supabase.from("question_answers").insert(rows);

    if (aErr) {
      console.error("add-new-question-answer-set insert answers error:", aErr);
      // best-effort: delete the question to avoid orphan
      await supabase.from("questions_repo").delete().eq("id", questionId);
      return NextResponse.json(
        { error: "Failed to insert answers" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      questionId,
      answerCount: rows.length,
    });
  } catch (err) {
    console.error("add-new-question-answer-set error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
