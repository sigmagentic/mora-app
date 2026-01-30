import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateManageApiKey } from "@/lib/manage-api-auth";

export const runtime = "edge";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I,O,0,1 to avoid confusion
const CODE_LENGTH = 8;
const GENERATE_COUNT = 25;

function randomCode(): string {
  let s = "";
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  for (let i = 0; i < CODE_LENGTH; i++) {
    s += CHARS[bytes[i]! % CHARS.length];
  }
  return s;
}

/**
 * POST /api/private-data-game/manage/generate-invite-codes
 * Generates 25 random invite codes and bulk inserts. Requires x-api-key (MANAGE_API_KEY).
 */
export async function POST(request: NextRequest) {
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

  try {
    const existing = new Set<string>();
    const { data: existingRows } = await supabase
      .from("invite_codes")
      .select("code");
    if (existingRows) {
      existingRows.forEach((r: { code: string }) => existing.add(r.code));
    }

    const toInsert: { code: string; used: number }[] = [];
    let attempts = 0;
    const maxAttempts = GENERATE_COUNT * 20;

    while (toInsert.length < GENERATE_COUNT && attempts < maxAttempts) {
      attempts++;
      const code = randomCode();
      if (existing.has(code)) continue;
      existing.add(code);
      toInsert.push({ code, used: 0 });
    }

    if (toInsert.length === 0) {
      return NextResponse.json(
        { error: "Could not generate unique codes; try again" },
        { status: 500 }
      );
    }

    const { error } = await supabase.from("invite_codes").insert(toInsert);

    if (error) {
      console.error("generate-invite-codes insert error:", error);
      return NextResponse.json(
        { error: "Failed to insert invite codes", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      count: toInsert.length,
      codes: toInsert.map((r) => r.code),
    });
  } catch (err) {
    console.error("generate-invite-codes error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
