import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { validateManageApiKey } from "@/lib/manage-api-auth";

export const runtime = "edge";

/**
 * POST /api/private-data-game/manage/reset-all-question-game-meta
 * Resets epoch_id, opens_at, closes_at, game_status to null/DORMANT for all rows in questions_repo.
 * Requires x-api-key header matching MANAGE_API_KEY.
 */
export async function POST(request: NextRequest) {
  const auth = validateManageApiKey(request);
  if (auth) return auth;

  try {
    const { data, error } = await supabase
      .from("questions_repo")
      .update({
        epoch_id: null,
        opens_at: null,
        closes_at: null,
        game_status: "UPCOMING",
      })
      .gte("id", 1)
      .select("id");

    if (error) {
      console.error("reset-all-question-game-meta error:", error);
      return NextResponse.json(
        { error: "Failed to reset question game metadata" },
        { status: 500 },
      );
    }

    const count = data?.length ?? 0;
    return NextResponse.json({
      success: true,
      resetCount: count,
    });
  } catch (err) {
    console.error("reset-all-question-game-meta error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
