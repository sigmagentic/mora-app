// Logging Module ID: DAQ-R
import { NextRequest, NextResponse } from "next/server";
import { dailyController } from "./controllers/daily";
import { hourlyController } from "./controllers/hourly";

// Using Node.js runtime instead of edge because:
// - @arcium-hq/client requires Node.js crypto module
// - @coral-xyz/anchor and Solana libraries need Node.js APIs
// Edge runtime doesn't support Node.js built-in modules
export const runtime = "nodejs";

// Opt out of static generation: this route uses request.url and must run at request time
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const getQuestionType = url.searchParams.get("type"); // "hourly" or "daily"
    // const giveSampleQuestion = url.searchParams.get("give_sample_question");

    // const debugThis = true;

    // if (debugThis) {
    //   return NextResponse.json(
    //     { error: "This is a sample response" },
    //     { status: 200 }
    //   );
    // }

    if (!getQuestionType || !["hourly", "daily"].includes(getQuestionType)) {
      return NextResponse.json(
        { error: "ERR-DAQ-R-2: Invalid question type" },
        { status: 400 }
      );
    }

    // hand it over to the appropriate controller based on the type of question requested
    if (getQuestionType === "hourly") {
      return await hourlyController(request);
    } else if (getQuestionType === "daily") {
      return await dailyController(request);
    } else {
      return NextResponse.json(
        { error: "ERR-DAQ-R-3: Invalid question type" },
        { status: 400 }
      );
    }
  } catch (err) {
    console.error("ERR-DAQ-R-1: get-active-question error:", err);

    return NextResponse.json(
      { error: "ERR-DAQ-R-1: Internal server error" },
      { status: 500 }
    );
  }
}
