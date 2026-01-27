import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export const runtime = "nodejs";

export async function GET() {
  try {
    // Read package.json from the project root
    const packageJsonPath = join(process.cwd(), "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    
    return NextResponse.json({ version: packageJson.version });
  } catch (error) {
    console.error("Error reading version:", error);
    return NextResponse.json({ version: "unknown" }, { status: 500 });
  }
}
