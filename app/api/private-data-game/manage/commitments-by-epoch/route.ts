import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateManageApiKey } from "@/lib/manage-api-auth";

export const runtime = "edge";

/**
 * GET /api/private-data-game/manage/commitments-by-epoch?epoch_id=...
 * Returns rows from response_commitments where epoch_id matches.
 * Requires x-api-key header (MANAGE_API_KEY).
 */
export async function GET(request: NextRequest) {
  const auth = validateManageApiKey(request);
  if (auth) return auth;

  const { searchParams } = new URL(request.url);
  const epochId = searchParams.get("epoch_id");
  if (!epochId?.trim()) {
    return NextResponse.json(
      { error: "epoch_id query param is required" },
      { status: 400 },
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 500 },
    );
  }
  const supabase = createClient(url, key);

  try {
    const { data, error } = await supabase
      .from("response_commitments")
      .select("*")
      .eq("epoch_id", epochId.trim());

    if (error) {
      console.error("commitments-by-epoch error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const commitments = data ?? [];
    return NextResponse.json({
      commitments,
      count: commitments.length,
    });
  } catch (err) {
    console.error("commitments-by-epoch error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
