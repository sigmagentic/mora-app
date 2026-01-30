import { NextRequest, NextResponse } from "next/server";

/**
 * Validates the x-api-key header for /manage/ admin routes.
 * Set MANAGE_API_KEY in the environment.
 * @returns NextResponse with 401/500 to return, or null if valid
 */
export function validateManageApiKey(
  request: NextRequest,
): NextResponse | null {
  const key = process.env.MANAGE_API_KEY;
  if (!key) {
    console.error("MANAGE_API_KEY is not configured");
    return NextResponse.json(
      { error: "Manage API not configured" },
      { status: 500 },
    );
  }
  const provided = request.headers.get("x-api-key");
  if (!provided || provided !== key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
