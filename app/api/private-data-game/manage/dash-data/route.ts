import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateManageApiKey } from "@/lib/manage-api-auth";

export const runtime = "edge";

const LIMIT = 50;
const ALL_SECTIONS = ["questions_repo", "response_commitments", "users", "question_aggregates", "invite_codes"] as const;

/**
 * GET /api/private-data-game/manage/dash-data
 * Query param: sections (optional) — comma-separated: questions_repo, response_commitments, users, question_aggregates.
 * If omitted, returns all four. When questions_repo is requested, also returns question_answers for those questions.
 * Requires x-api-key header (MANAGE_API_KEY).
 */
export async function GET(request: NextRequest) {
  const auth = validateManageApiKey(request);
  if (auth) return auth;

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

  const { searchParams } = new URL(request.url);
  const sectionsParam = searchParams.get("sections");
  const requested: Set<string> =
    sectionsParam?.length
      ? new Set(
          sectionsParam.split(",").map((s) => s.trim()).filter(Boolean)
        )
      : new Set(ALL_SECTIONS);

  const data_sections: Record<string, unknown[]> = {};

  try {
    if (requested.has("questions_repo")) {
      const questionsRes = await supabase
        .from("questions_repo")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(LIMIT);

      if (questionsRes.error) {
        return NextResponse.json(
          { error: "Fetch failed", details: [`questions_repo: ${questionsRes.error.message}`] },
          { status: 500 }
        );
      }

      const questions = questionsRes.data ?? [];
      data_sections.questions_repo = questions;

      const questionIds = (questions as { id: number }[]).map((q) => q.id);
      if (questionIds.length > 0) {
        const answersRes = await supabase
          .from("question_answers")
          .select("*")
          .in("question_id", questionIds);

        if (!answersRes.error) {
          data_sections.question_answers = answersRes.data ?? [];
        }
      } else {
        data_sections.question_answers = [];
      }
    }

    if (requested.has("response_commitments")) {
      const commitmentsRes = await supabase
        .from("response_commitments")
        .select("*")
        .order("submitted_at", { ascending: false })
        .limit(LIMIT);

      if (commitmentsRes.error) {
        return NextResponse.json(
          { error: "Fetch failed", details: [`response_commitments: ${commitmentsRes.error.message}`] },
          { status: 500 }
        );
      }
      data_sections.response_commitments = commitmentsRes.data ?? [];
    }

    if (requested.has("users")) {
      const usersRes = await supabase
        .from("users")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(LIMIT);

      if (usersRes.error) {
        return NextResponse.json(
          { error: "Fetch failed", details: [`users: ${usersRes.error.message}`] },
          { status: 500 }
        );
      }
      data_sections.users = usersRes.data ?? [];
    }

    if (requested.has("question_aggregates")) {
      const aggregatesRes = await supabase
        .from("question_aggregates")
        .select("*")
        .order("finalized_at", { ascending: false })
        .limit(LIMIT);

      if (aggregatesRes.error) {
        return NextResponse.json(
          { error: "Fetch failed", details: [`question_aggregates: ${aggregatesRes.error.message}`] },
          { status: 500 }
        );
      }
      data_sections.question_aggregates = aggregatesRes.data ?? [];
    }

    if (requested.has("invite_codes")) {
      const inviteRes = await supabase
        .from("invite_codes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(LIMIT);

      if (inviteRes.error) {
        return NextResponse.json(
          { error: "Fetch failed", details: [`invite_codes: ${inviteRes.error.message}`] },
          { status: 500 }
        );
      }
      data_sections.invite_codes = inviteRes.data ?? [];
    }

    return NextResponse.json({ data_sections });
  } catch (err) {
    console.error("dash-data error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
