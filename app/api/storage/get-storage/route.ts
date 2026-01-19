import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { metadata } from "@/app/layout";
import { getServerSession } from "@/lib/auth-utils";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session) {
      return NextResponse.json({ user: null });
    }

    const url = new URL(request.url);
    const userId = session.userId;

    if (!userId) {
      return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("user_storage")
      .select(
        "id, size, created_at, storage_type, metadata, encrypted_file, file_iv, encrypted_dek, dek_iv"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase select error:", error);
      return NextResponse.json({ error }, { status: 500 });
    }

    return NextResponse.json({ files: data });
  } catch (err) {
    console.error("get-storage error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
