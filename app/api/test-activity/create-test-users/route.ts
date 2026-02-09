import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "edge";

/**
 * POST /api/test-activity/create-test-users
 * Creates test users for automated activity simulation
 * Protected by API key (MANAGE_API_KEY or TEST_ACTIVITY_API_KEY)
 */
export async function POST(request: NextRequest) {
  try {
    // Check API key protection
    const apiKey =
      process.env.TEST_ACTIVITY_API_KEY || process.env.MANAGE_API_KEY;
    if (apiKey) {
      const providedKey = request.headers.get("x-api-key");
      if (!providedKey || providedKey !== apiKey) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const body = await request.json().catch(() => ({}));
    const count =
      body.count || parseInt(process.env.TEST_USER_COUNT || "20", 10);

    if (count < 1 || count > 1000) {
      return NextResponse.json(
        { error: "Count must be between 1 and 1000" },
        { status: 400 }
      );
    }

    const existingUsers = await supabase
      .from("users")
      .select("username")
      .eq("email", "tester@tester.com");

    const existingUsernames = new Set(
      (existingUsers.data || []).map((u) => u.username)
    );

    const usersToCreate: Array<{
      username: string;
      email: string;
      display_name: string;
    }> = [];

    for (let i = 1; i <= count; i++) {
      const username = `test_user_${i}`;
      if (!existingUsernames.has(username)) {
        usersToCreate.push({
          username,
          email: "tester@tester.com",
          display_name: `Test User ${i}`,
        });
      }
    }

    if (usersToCreate.length === 0) {
      return NextResponse.json({
        success: true,
        message: "All test users already exist",
        created: 0,
        skipped: count,
      });
    }

    const { data: createdUsers, error } = await supabase
      .from("users")
      .insert(usersToCreate)
      .select("id, username");

    if (error) {
      console.error("Error creating test users:", error);
      return NextResponse.json(
        { error: "Failed to create test users", details: error.message },
        { status: 500 }
      );
    }

    const createdCount = createdUsers?.length || 0;
    const skippedCount = count - createdCount;

    console.log(
      `Test users created: ${createdCount}, skipped: ${skippedCount}`
    );

    return NextResponse.json({
      success: true,
      created: createdCount,
      skipped: skippedCount,
      users: createdUsers?.map((u) => ({
        id: u.id,
        username: u.username,
      })),
    });
  } catch (err) {
    console.error("create-test-users error:", err);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
