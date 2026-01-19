import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getServerSession } from "@/lib/auth-utils";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session) {
      return NextResponse.json({ user: null });
    }

    const form = await request.formData();

    const encryptedFile = form.get("encrypted_file")?.toString();
    const fileIV = form.get("file_iv")?.toString();
    const encryptedDEK = form.get("encrypted_dek")?.toString();
    const dekIV = form.get("dek_iv")?.toString();
    const metadataRaw = form.get("metadata")?.toString();
    const storageFileId = form.get("storageFileId")?.toString();

    if (
      !encryptedFile ||
      !fileIV ||
      !encryptedDEK ||
      !dekIV ||
      !metadataRaw ||
      !storageFileId
    ) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const metadata = JSON.parse(metadataRaw);

    const { data, error } = await supabase
      .from("user_storage")
      .update({
        encrypted_file: encryptedFile,
        file_iv: fileIV,
        encrypted_dek: encryptedDEK,
        dek_iv: dekIV,
        metadata,
        size: metadata.size,
      })
      .eq("id", storageFileId)
      .select()
      .single();

    if (error) {
      console.error("Supabase update error:", error);
      return NextResponse.json({ error }, { status: 500 });
    }
    return NextResponse.json({ success: true, file: data });
  } catch (err) {
    console.error("edit-storage error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
