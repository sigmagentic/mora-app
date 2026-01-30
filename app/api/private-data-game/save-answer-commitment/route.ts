import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getServerSession } from "@/lib/auth-utils";

export const runtime = "edge";

type Payload = {
  question_id: number;
  epoch_id: string;
  nullifier: string;
  commitment: string;
  encrypted_answer: string;
  tmp_answer_bit: number;
  tmp_user_id: string;
};

function isPayload(v: unknown): v is Payload {
  return (
    typeof v === "object" &&
    v !== null &&
    "question_id" in v &&
    typeof (v as Payload).question_id === "number" &&
    "epoch_id" in v &&
    typeof (v as Payload).epoch_id === "string" &&
    "nullifier" in v &&
    typeof (v as Payload).nullifier === "string" &&
    "commitment" in v &&
    typeof (v as Payload).commitment === "string" &&
    "encrypted_answer" in v &&
    typeof (v as Payload).encrypted_answer === "string" &&
    "tmp_answer_bit" in v &&
    typeof (v as Payload).tmp_answer_bit === "number" &&
    "tmp_user_id" in v &&
    typeof (v as Payload).tmp_user_id === "string"
  );
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || !("payload" in body)) {
      return NextResponse.json(
        { error: "Request body must include payload" },
        { status: 400 },
      );
    }

    const payload = body.payload;
    if (!isPayload(payload)) {
      return NextResponse.json(
        {
          error:
            "Invalid payload: requires question_id, epoch_id, nullifier, commitment, encrypted_answer, tmp_answer_bit",
        },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("response_commitments")
      .insert({
        question_id: payload.question_id,
        epoch_id: payload.epoch_id,
        nullifier: payload.nullifier,
        commitment: payload.commitment,
        encrypted_answer: payload.encrypted_answer,
        tmp_answer_bit: payload.tmp_answer_bit,
      })
      .select("id, submitted_at")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Already submitted for this question and epoch" },
          { status: 409 },
        );
      }
      if (error.code === "23503") {
        return NextResponse.json(
          { error: "Invalid question_id" },
          { status: 400 },
        );
      }
      console.error("save-answer-commitment insert error:", error);
      return NextResponse.json(
        { error: "Failed to save answer commitment" },
        { status: 500 },
      );
    }

    // award 10 points to user with task_code 1 (answered a question)
    const XP_AWARDED = 10;
    await supabase.from("user_xp").insert({
      user_id: payload.tmp_user_id,
      points: XP_AWARDED,
      task_code: 1,
    });

    return NextResponse.json({
      ok: true,
      id: data.id,
      submitted_at: data.submitted_at,
      xp_awarded: XP_AWARDED,
    });
  } catch (err) {
    console.error("save-answer-commitment error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
