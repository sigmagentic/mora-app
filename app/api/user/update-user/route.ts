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

    const userId = session.userId;

    // Password KEK related updates
    const encrypted_vmk = form.get("encrypted_vmk")?.toString();
    const vmk_iv = form.get("vmk_iv")?.toString();
    const kek_salt = form.get("kek_salt")?.toString();

    // PRF KEK related updates
    const prf_encrypted_vmk = form.get("prf_encrypted_vmk")?.toString();
    const prf_vmk_iv = form.get("prf_vmk_iv")?.toString();

    if (!userId) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    if (encrypted_vmk && (!vmk_iv || !kek_salt)) {
      return NextResponse.json(
        { error: "Missing VMK IV or KEK salt" },
        { status: 400 }
      );
    }

    if (prf_encrypted_vmk && !prf_vmk_iv) {
      return NextResponse.json(
        { error: "Missing PRF VMK IV" },
        { status: 400 }
      );
    }

    const updateData: any = {};

    if (encrypted_vmk && vmk_iv && kek_salt) {
      updateData.encrypted_vmk = encrypted_vmk;
      updateData.vmk_iv = vmk_iv;
      updateData.kek_salt = kek_salt;
    }

    if (prf_encrypted_vmk && prf_vmk_iv) {
      updateData.prf_encrypted_vmk = prf_encrypted_vmk;
      updateData.prf_vmk_iv = prf_vmk_iv;
    }

    const { data, error } = await supabase
      .from("users")
      .update(updateData)
      .eq("id", userId)
      .select()
      .single();

    if (error) {
      console.error("Supabase update error:", error);
      return NextResponse.json({ error }, { status: 500 });
    }
    return NextResponse.json({ success: true, file: data });
  } catch (err) {
    console.error("update-user error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
