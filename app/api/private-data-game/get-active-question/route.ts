import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { GameQuestion, GameQuestionAnswer } from "@/types/types";
import { getServerSession } from "@/lib/auth-utils";
import {
  getEpochId,
  getEpochIdForDay,
  getOpensAt,
  getClosesAt,
  getOpensAtDay,
  getClosesAtDay,
  toTimestampStr,
} from "@/lib/game-epoch";
import { addNewQuestionAnswerSet } from "@/app/manage/dash/actions";
import {
  createNewOnChainArciumPoll,
  getNextArciumPollId,
} from "@/app/api/private-data-game/arcium-mxe-logic/arcium-mxe-logic";

// Using Node.js runtime instead of edge because:
// - @arcium-hq/client requires Node.js crypto module
// - @coral-xyz/anchor and Solana libraries need Node.js APIs
// Edge runtime doesn't support Node.js built-in modules
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const giveSampleQuestion = url.searchParams.get("give_sample_question");

    type DailyRow = {
      id: number;
      title: string | null;
      img: string | null;
      text: string;
      opens_at: string | null;
      closes_at: string | null;
      game_status: string;
      epoch_id: string | null;
      arcium_poll_id?: number;
    };
    let bypassAllLoggedInLogic = false;
    let activeQuestionData: GameQuestion | null = null;
    let dailyQuestionData: DailyRow | null = null;

    // We need a sample, finalized quesion as a demo for the homepage
    if (giveSampleQuestion && giveSampleQuestion === "1") {
      /* lets check for aoptional query string param called "give_sample_question"
      ... if this exists then just query the questions_repo and get the item with game_status FINALIZED
      ... and closes_at is the most recent one (i.e. the most recently closed question)
      ... once we get this, just bypass all the logic below and return it with the answers as well
      ... this is for testing purposes only and should not be used in production */
      const { data: sampleQuestionData, error: sampleQuestionError } =
        await supabase
          .from("questions_repo")
          .select("*")
          .in("game_status", ["AGGREGATING", "ACTIVE", "FINALIZED"])
          .order("closes_at", { ascending: false })
          .limit(1);

      if (sampleQuestionError) {
        console.error("Error fetching sample question:", sampleQuestionError);
        return NextResponse.json(
          { error: "Error fetching sample question" },
          { status: 500 }
        );
      }

      bypassAllLoggedInLogic = true;
      activeQuestionData = sampleQuestionData[0];
    }

    if (!bypassAllLoggedInLogic) {
      const session = await getServerSession();

      if (!session) {
        return NextResponse.json({ user: null });
      }

      const now = new Date();
      const _isActiveHHDDMMYY = getEpochId(now); // HHDDMMYY, hour 1–24, month 1–12
      const _dayEpoch = getEpochIdForDay(now); // 00DDMMYY for daily Arcium

      // Close expired ACTIVE_ARCIUM (wrong day or closes_at passed)
      const nowStr = toTimestampStr(now);
      const { data: expiredArcium } = await supabase
        .from("questions_repo")
        .select("id")
        .eq("game_status", "ACTIVE_ARCIUM");

      if (expiredArcium?.length) {
        for (const row of expiredArcium) {
          const { data: q } = await supabase
            .from("questions_repo")
            .select("epoch_id, closes_at")
            .eq("id", row.id)
            .single();
          if (
            q &&
            (q.epoch_id !== _dayEpoch ||
              (q.closes_at && String(q.closes_at) < nowStr))
          ) {
            await supabase
              .from("questions_repo")
              .update({ game_status: "AGGREGATING_ARCIUM" })
              .eq("id", row.id);
          }
        }
      }

      /*
      Ultimate goal: ONLY EVER one ACTIVE question at a time with epoch_id === _isActiveHHDDMMYY.

      Rules:
      1. _isActiveHHDDMMYY = current LIVE epoch_id
      2. At most TWO ACTIVE total (or zero on first play). Abort if >2 (corrupted).
      3. UPCOMING: we need at least 1 UPCOMING only when we must promote (no ACTIVE with matching epoch). If none, error.
      4. If one ACTIVE with epoch_id === _isActiveHHDDMMYY: use it, get answers, return. Close other ACTIVE (different epoch).
      5. If none: get a UPCOMING, set game_status=ACTIVE, epoch_id, opens_at, closes_at (UTC hour). Close other ACTIVE (different epoch). Return.
      6. If multiple ACTIVE with same epoch_id: corrupted; return 500.
      */

      // Rule 2: at most 2 ACTIVE total (current + previous epoch) or 0. Abort if >2.
      const { data: activeQuestionsData, error: activeQuestionsError } =
        await supabase
          .from("questions_repo")
          .select("*")
          .eq("game_status", "ACTIVE")
          .limit(3);

      if (
        !activeQuestionsError &&
        activeQuestionsData &&
        activeQuestionsData.length > 2
      ) {
        return NextResponse.json(
          {
            error:
              "Corrupted gameplay state as there are more than two active questions which should NOT happen",
          },
          { status: 500 }
        );
      }

      // Find ACTIVE question(s) with epoch_id === _isActiveHHDDMMYY. Use limit(2) to detect corruption (multiple with same epoch).
      const { data: activeQuestionList, error: selectError } = await supabase
        .from("questions_repo")
        .select("*")
        .eq("game_status", "ACTIVE")
        .eq("epoch_id", _isActiveHHDDMMYY)
        .limit(2);

      if (selectError) {
        console.error("Error checking active question:", selectError);
        return NextResponse.json(
          { error: "Error checking active question" },
          { status: 500 }
        );
      }

      // Corrupted: more than one ACTIVE with same epoch_id.
      if (activeQuestionList && activeQuestionList.length > 1) {
        return NextResponse.json(
          {
            error:
              "Corrupted gameplay state: multiple ACTIVE questions with same epoch_id",
          },
          { status: 500 }
        );
      }

      let _activeQuestionData: (typeof activeQuestionList)[0] | null =
        activeQuestionList && activeQuestionList.length === 1
          ? activeQuestionList[0]
          : null;

      if (_activeQuestionData) {
        activeQuestionData = _activeQuestionData;
      }

      // Helper: close other ACTIVE questions (different epoch_id). Best-effort; log on error.
      const closeOtherActive = async () => {
        const { error: closeErr } = await supabase
          .from("questions_repo")
          .update({ game_status: "AGGREGATING" })
          .neq("epoch_id", _isActiveHHDDMMYY)
          .eq("game_status", "ACTIVE");
        if (closeErr) {
          console.error("Error closing other active questions:", closeErr);
        }
      };

      if (activeQuestionData) {
        // Have matching ACTIVE for this epoch. Close any ACTIVE from other epochs, then serve.
        await closeOtherActive();
      } else {
        // No ACTIVE for this epoch: promote a UPCOMING. Require at least one UPCOMING (rule 3). Get the most recently added one using the created_at TIMESTAMP field in the DB
        const { data: dormantQuestionData, error: dormantError } =
          await supabase
            .from("questions_repo")
            .select("*")
            .eq("game_status", "UPCOMING")
            .order("created_at", { ascending: false }) // Get most recently added UPCOMING
            .limit(1)
            .single();

        /*
        if there are no UPCOMING questions, then let's create a cyclic gameplay
        ... let's get a random FINALIZED or AGGREGATING question 
        ... make a copy of that and also get it's answers and make a copy of that
        ... from the copies, remove the id, epoch_id, opens_at, closes_at and created_at from the question and set game_status to UPCOMING
        ... and from the answers, remove the id and question_id
        and in the end we should have something like this:
        {
            "title": "The Accidental Samaritan",
            "img": "https://example.com/image.jpg",
            "text": "Your question text here...",
            "answers": [
              { "text": "First answer" },
              { "text": "Second answer" }
            ]
          }

          lets just console.log the result of this for now so we can verify it's working
        */

        // if there are no UPCOMING questions, then let's create a cyclic gameplay as above...
        if (dormantError || !dormantQuestionData) {
          console.log(
            "NO UPCOMING QUESTIONS FOUND, CREATING A CYCLIC GAMEPLAY"
          );

          // Supabase .order() only accepts column names, not RANDOM(). Fetch FINALIZED/AGGREGATING and pick one in JS.
          const {
            data: finalizedQuestions,
            error: randomPrevFinalizedQuestionError,
          } = await supabase
            .from("questions_repo")
            .select("*")
            .in("game_status", ["FINALIZED", "AGGREGATING"]);

          const randomPrevFinalizedQuestionData =
            finalizedQuestions && finalizedQuestions.length > 0
              ? [
                  finalizedQuestions[
                    Math.floor(Math.random() * finalizedQuestions.length)
                  ],
                ]
              : [];

          if (randomPrevFinalizedQuestionError) {
            console.error(
              "Error random prev finalized question:",
              randomPrevFinalizedQuestionError
            );

            return NextResponse.json(
              { error: "E1 : No questions available" },
              { status: 500 }
            );
          }

          if (
            randomPrevFinalizedQuestionData &&
            randomPrevFinalizedQuestionData.length > 0
          ) {
            console.log(
              "randomPrevFinalizedQuestionData >>>>",
              randomPrevFinalizedQuestionData[0]
            );
          }

          const { data: answersData, error: answersError } = await supabase
            .from("question_answers")
            .select("*")
            .eq("question_id", randomPrevFinalizedQuestionData[0]?.id)
            .order("id");

          if (answersError) {
            console.error("Error fetching answers:", answersError);
          }

          if (answersData && answersData.length > 0) {
            console.log("answersData >>>>", answersData);
          } else {
            console.error(
              "No answers found for the random previous finalized question"
            );

            return NextResponse.json(
              { error: "E2 : No questions available" },
              { status: 500 }
            );
          }

          // clone and shuffle the answers for some randomness...
          let clonedAndShuffledAnswers: any[] = answersData.map(
            (answer: any) => ({
              text: answer.text,
            })
          );

          // Unbiased shuffle for 2 answers: 50/50 swap or keep
          if (clonedAndShuffledAnswers.length === 2 && Math.random() < 0.5) {
            clonedAndShuffledAnswers.reverse();
          }

          const newQuestion = {
            title: randomPrevFinalizedQuestionData[0]?.title,
            img: randomPrevFinalizedQuestionData[0]?.img,
            text: randomPrevFinalizedQuestionData[0]?.text,
            answers: clonedAndShuffledAnswers,
          };

          // (New Hourly Poll) Here is where we add the new Quesion that will be soon updated to ACTIVE
          const result = await addNewQuestionAnswerSet(
            JSON.stringify(newQuestion)
          );

          if ("error" in result && result.error) {
            console.error(
              "Error adding new question and answers:",
              result.error
            );

            return NextResponse.json(
              { error: "E4 : No questions available" },
              { status: 500 }
            );
          }

          if ("success" in result && result.success) {
            console.log(
              "New question and answers added successfully:",
              result.questionId
            );

            // OK, we can now fetch the new question that we just added...
            const { data: dormantQuestionData, error: dormantError } =
              await supabase
                .from("questions_repo")
                .select("*")
                .eq("game_status", "UPCOMING")
                .order("created_at", { ascending: false }) // Get most recently added UPCOMING
                .limit(1)
                .single();

            if (dormantError || !dormantQuestionData) {
              console.error("Error fetching UPCOMING question:", dormantError);

              return NextResponse.json(
                { error: "E5 : No questions available" },
                { status: 500 }
              );
            }

            // this is the new question that we just added... and it becomes the ACTIVE question!
            if (dormantQuestionData) {
              activeQuestionData = dormantQuestionData;
            }
          }
        } else {
          // if there are UPCOMING questions, then let's use the most recently added one...
          if (dormantQuestionData) {
            activeQuestionData = dormantQuestionData;
          }
        }

        if (!activeQuestionData) {
          return NextResponse.json(
            { error: "E6 : No questions available" },
            { status: 500 }
          );
        }

        // opens_at / closes_at: start and end of current UTC hour. DB type is timestamp (no TZ).
        // toTimestampStr yields "YYYY-MM-DD HH:mm:ss.sss" to store literal UTC.
        const opensAt = getOpensAt(now);
        const closesAt = getClosesAt(now);

        // we dont need arcium for hourly polls anymore as we moved this to the daily poll
        const updatePayload: Record<string, unknown> = {
          game_status: "ACTIVE",
          epoch_id: _isActiveHHDDMMYY,
          opens_at: toTimestampStr(opensAt),
          closes_at: toTimestampStr(closesAt),
        };

        const { error: updateError } = await supabase
          .from("questions_repo")
          .update(updatePayload)
          .eq("id", activeQuestionData?.id);

        if (updateError) {
          console.error("Error updating question metadata:", updateError);
          return NextResponse.json(
            { error: "Error updating question metadata" },
            { status: 500 }
          );
        }

        // Close other ACTIVE (previous epoch) so we keep only one ACTIVE per epoch (rule 5).
        await closeOtherActive();
      }

      // Resolve daily ACTIVE_ARCIUM (at most one per UTC day)
      const { data: existingDailyRow } = await supabase
        .from("questions_repo")
        .select("*")
        .eq("game_status", "ACTIVE_ARCIUM")
        .eq("epoch_id", _dayEpoch)
        .limit(1)
        .maybeSingle();

      if (existingDailyRow) {
        dailyQuestionData = existingDailyRow as DailyRow;
      } else if (activeQuestionData) {
        // Clone current hourly question into a new row and set as ACTIVE_ARCIUM
        const { data: hourlyAnswers } = await supabase
          .from("question_answers")
          .select("text")
          .eq("question_id", activeQuestionData.id)
          .order("id");

        let clonedAnswers: { text: string }[] = (hourlyAnswers ?? []).map(
          (a: { text: string }) => ({ text: a.text })
        );

        if (clonedAnswers.length === 2 && Math.random() < 0.5) {
          clonedAnswers = [...clonedAnswers].reverse();
        }

        const newQuestion = {
          title: activeQuestionData.title ?? null,
          img: activeQuestionData.img ?? null,
          text: activeQuestionData.text,
          answers: clonedAnswers,
        };

        // (New Daily Poll) Here is where we add the new Quesion that will be soon updated to ACTIVE_ARCIUM
        const result = await addNewQuestionAnswerSet(
          JSON.stringify(newQuestion)
        );

        if ("success" in result && result.success && result.questionId) {
          const nextDailyArciumPollId = await getNextArciumPollId();

          console.log(
            "ARCIUM:nextDailyArciumPollId >>>>",
            nextDailyArciumPollId
          );

          if (nextDailyArciumPollId === null) {
            console.error(
              "Failed to get next Arcium poll ID, skipping daily question creation"
            );
            // Continue without creating daily question - hourlyActive will still be returned
            dailyQuestionData = null;
          } else {
            // Create on-chain Arcium poll
            const pollQuestionText = activeQuestionData.text || "";

            // bypass for now...
            const polSig = "1234567890";
            const finalizedPolSig = "1234567890";
            const error = false;
            const errorMessage = "";

            // const { polSig, finalizedPolSig, error, errorMessage } =
            //   await createNewOnChainArciumPoll(
            //     nextDailyArciumPollId,
            //     pollQuestionText,
            //     result.questionId
            //   );

            if (error) {
              console.error(
                "Error creating new on chain arcium poll:",
                errorMessage
              );
              dailyQuestionData = null; // let's not update the database with the new question as ACTIVE_ARCIUM as it will be deleted from the database

              return NextResponse.json(
                { error: errorMessage },
                { status: 500 }
              );
            }

            if (!dailyQuestionData) {
              const opensAtDay = getOpensAtDay(now);
              const closesAtDay = getClosesAtDay(now);

              const { error: updateDailyErr } = await supabase
                .from("questions_repo")
                .update({
                  game_status: "ACTIVE_ARCIUM",
                  epoch_id: _dayEpoch,
                  opens_at: toTimestampStr(opensAtDay),
                  closes_at: toTimestampStr(closesAtDay),
                  arcium_poll_id: nextDailyArciumPollId,
                  arcium_pol_sig: polSig,
                  arcium_finalized_pol_sig: finalizedPolSig,
                })
                .eq("id", result.questionId);

              if (!updateDailyErr) {
                const { data: newDailyRow } = await supabase
                  .from("questions_repo")
                  .select("*")
                  .eq("id", result.questionId)
                  .single();

                if (newDailyRow) {
                  dailyQuestionData = newDailyRow as DailyRow;
                }
              }
            }
          }
        }
      }
    }

    if (!activeQuestionData) {
      return NextResponse.json(
        { error: "No active question found" },
        { status: 500 }
      );
    }

    // Get answers for the active question
    const { data: answersData, error: answersError } = await supabase
      .from("question_answers")
      .select("*")
      .eq("question_id", activeQuestionData?.id)
      .order("id");

    if (answersError) {
      console.error("Error fetching answers:", answersError);

      return NextResponse.json(
        { error: "Error fetching answers" },
        { status: 500 }
      );
    }

    // Map answers to GameQuestionAnswer format
    const answers: GameQuestionAnswer[] = (answersData ?? []).map(
      (ans: GameQuestionAnswer) => ({
        id: ans.id,
        text: ans.text,
      })
    );

    // Construct hourlyActive
    const hourlyActive: GameQuestion = {
      id: activeQuestionData.id,
      title: activeQuestionData.title,
      img: activeQuestionData.img,
      text: activeQuestionData.text,
      opens_at: activeQuestionData.opens_at,
      closes_at: activeQuestionData.closes_at,
      game_status: activeQuestionData.game_status,
      epoch_id: activeQuestionData.epoch_id,
      answers,
    };

    // Build dailyActive from ACTIVE_ARCIUM row if present
    let dailyActive: GameQuestion | null = null;

    if (dailyQuestionData) {
      const { data: dailyAnswersData, error: dailyAnswersError } =
        await supabase
          .from("question_answers")
          .select("*")
          .eq("question_id", dailyQuestionData.id)
          .order("id");

      if (!dailyAnswersError && dailyAnswersData?.length) {
        const dailyAnswers: GameQuestionAnswer[] = dailyAnswersData.map(
          (ans: GameQuestionAnswer) => ({ id: ans.id, text: ans.text })
        );

        const nextDailyArciumPollId = dailyQuestionData.arcium_poll_id;

        if (!nextDailyArciumPollId) {
          console.error(
            "Daily question missing arcium_poll_id:",
            dailyQuestionData
          );
          // Set dailyActive to null instead of erroring - hourlyActive will still be returned
          dailyActive = null;
        } else {
          dailyActive = {
            id: dailyQuestionData.id,
            title: dailyQuestionData.title ?? undefined,
            img: dailyQuestionData.img ?? undefined,
            text: dailyQuestionData.text ?? "",
            opens_at: dailyQuestionData.opens_at ?? "",
            closes_at: dailyQuestionData.closes_at ?? "",
            game_status: dailyQuestionData.game_status ?? "",
            epoch_id: dailyQuestionData.epoch_id ?? "",
            answers: dailyAnswers,
            arciumPollId: nextDailyArciumPollId,
          };
        }
      }
    }

    return NextResponse.json({ hourlyActive, dailyActive });
  } catch (err) {
    console.error("get-active-question error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
