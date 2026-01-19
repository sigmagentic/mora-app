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
    const userId = session.userId;
    const storageType = form.get("storage_type")?.toString(); // 1 = secure note , 2 = private file

    if (
      !encryptedFile ||
      !fileIV ||
      !encryptedDEK ||
      !dekIV ||
      !metadataRaw ||
      !userId ||
      !storageType
    ) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const metadata = JSON.parse(metadataRaw);

    const { data, error } = await supabase
      .from("user_storage")
      .insert({
        user_id: userId,
        encrypted_file: encryptedFile,
        file_iv: fileIV,
        encrypted_dek: encryptedDEK,
        dek_iv: dekIV,
        metadata,
        size: metadata.size,
        storage_type: parseInt(storageType, 10),
      })
      .select()
      .single();
    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json({ error }, { status: 500 });
    }
    return NextResponse.json({ success: true, file: data });
  } catch (err) {
    console.error("save-storage error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// import { NextRequest, NextResponse } from "next/server";
// import { supabase } from "@/lib/supabase";

// export const runtime = "edge";

// export async function POST(request: NextRequest) {
//   try {
//     const form = await request.formData();
//     const file = form.get("file") as File | null;
//     const userId = form.get("userId")?.toString() || null;
//     const fileName = form.get("fileName")?.toString() || null;
//     const contentType = form.get("contentType")?.toString() || null;

//     if (!file || !userId) {
//       return NextResponse.json(
//         { error: "Missing file or userId" },
//         { status: 400 }
//       );
//     }

//     const arrayBuffer = await file.arrayBuffer();
//     const buffer = Buffer.from(arrayBuffer);

//     const { data, error } = await supabase
//       .from("user_storage")
//       .insert({
//         user_id: userId,
//         file_name: fileName || file.name || "unknown",
//         content_type: contentType || (file as any).type || null,
//         size: buffer.length,
//         file_data: buffer,
//       })
//       .select()
//       .single();

//     if (error) {
//       console.error("Supabase insert error:", error);
//       return NextResponse.json({ error }, { status: 500 });
//     }

//     return NextResponse.json({ success: true, file: data });
//   } catch (err) {
//     console.error("save-storage error:", err);
//     return NextResponse.json(
//       { error: "Internal server error" },
//       { status: 500 }
//     );
//   }
// }
