import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "edge";
import { getServerSession } from "@/lib/auth-utils";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const session = await getServerSession();

    if (!session) {
      return NextResponse.json({ user: null });
    }

    const { data: user } = await supabase
      .from("users")
      .select(
        "id, username, email, display_name, kek_salt, vmk_iv, encrypted_vmk, prf_vmk_iv, prf_encrypted_vmk",
      )
      .eq("id", session.userId)
      .single();

    if (!user) {
      return NextResponse.json({ user: null });
    }
    // Get total XP via RPC (SUM in DB; scales to any number of rows)
    const { data: xpResult } = await supabase.rpc("get_user_total_xp", {
      p_user_id: user.id,
    });

    const totalXp =
      Array.isArray(xpResult) && xpResult[0]?.total_xp != null
        ? Number(xpResult[0].total_xp)
        : 0;

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.display_name,
        kekSalt: user.kek_salt,
        vmkIv: user.vmk_iv,
        encryptedVmk: user.encrypted_vmk,
        prfVmkIv: user.prf_vmk_iv,
        prfEncryptedVmk: user.prf_encrypted_vmk,
        totalXp,
      },
    });
  } catch (error) {
    console.error("Get user error:", error);
    return NextResponse.json({ user: null });
  }
}
