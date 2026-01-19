import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getServerSession } from "@/lib/auth-utils";

export const runtime = "edge";

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session) {
      return NextResponse.json({ user: null });
    }

    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get("id");
    const userId = session.userId;

    if (!fileId || !userId) {
      return NextResponse.json(
        { error: "Missing fileId or userId" },
        { status: 400 }
      );
    }

    // First, verify the file belongs to the user (security check)
    const { data: fileData, error: fetchError } = await supabase
      .from("user_storage")
      .select("id, user_id")
      .eq("id", fileId)
      .single();

    if (fetchError || !fileData) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    if (fileData.user_id !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Delete the file
    const { error: deleteError } = await supabase
      .from("user_storage")
      .delete()
      .eq("id", fileId);

    if (deleteError) {
      console.error("Supabase delete error:", deleteError);
      return NextResponse.json({ error: deleteError }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("delete-storage error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
