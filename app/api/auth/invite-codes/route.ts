import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "edge";

const MAX_AVAILABLE = 50;

/**
 * GET /api/auth/invite-codes
 * Returns a list of available invite codes (used = 0). No auth required.
 * Used by the "get an invite code" modal on the registration form.
 */
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("invite_codes")
      .select("code")
      .eq("used", 0)
      .order("created_at", { ascending: true })
      .limit(MAX_AVAILABLE);

    if (error) {
      console.error("invite-codes fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch invite codes" },
        { status: 500 }
      );
    }

    const codes = (data ?? []).map((row: { code: string }) => row.code);
    return NextResponse.json({ codes });
  } catch (err) {
    console.error("invite-codes error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
