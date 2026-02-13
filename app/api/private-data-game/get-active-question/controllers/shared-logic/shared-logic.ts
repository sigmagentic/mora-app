import { supabase } from "@/lib/supabase";
import { addNewQuestionAnswerSet } from "@/app/manage/dash/actions";
import { GameQuestion, GameQuestionAnswer } from "@/types/types";
import {
  getEpochId,
  getOpensAt,
  getClosesAt,
  toTimestampStr,
  getClosesAtDay,
  getOpensAtDay,
} from "@/lib/game-epoch";
import {
  createNewOnChainArciumPoll,
  getNextArciumPollId,
} from "../../../arcium-mxe-logic/arcium-mxe-logic";

export const closeOtherActive = async (
  epochIdString: string,
  targetGameStatus: string, // AGGREGATING or AGGREGATING_ARCIUM
  currentGameStatus: string, // ACTIVE or ACTIVE_ARCIUM
) => {
  const { error: closeErr } = await supabase
    .from("questions_repo")
    .update({ game_status: targetGameStatus })
    .neq("epoch_id", epochIdString)
    .eq("game_status", currentGameStatus);
  if (closeErr) {
    console.error("Error closing other active questions:", closeErr);
  }
};

export async function promoteOrCreateAndCommitNewActiveQuestion(
  now: Date,
  epochIdString: string,
  targetGameStatus: string, // AGGREGATING or AGGREGATING_ARCIUM
  currentGameStatus: string, // ACTIVE or ACTIVE_ARCIUM
  specificNotices: string[], // work on the this reference directly
): Promise<{
  error: boolean;
  errorObject: Error | null;
  activeQuestionData: GameQuestion | null;
  newArciumMetaData: {
    arciumPollId: number | null;
    arciumPolSig: string | null;
    arciumFinalizedPolSig: string | null;
  } | null;
}> {
  try {
    let activeQuestionData: GameQuestion | null = null;
    const isDaily = currentGameStatus === "ACTIVE_ARCIUM";
    let arciumPollId: number | null = null;
    let arciumPolSig: string | null = null;
    let arciumFinalizedPolSig: string | null = null;

    // first, we try and promote a UPCOMING. Get the most recently added one using the created_at TIMESTAMP field in the DB
    const { data: newUpcomingQuestionData, error: newUpcomingQuestionError } =
      await supabase
        .from("questions_repo")
        .select("*")
        .eq("game_status", "UPCOMING")
        .order("created_at", { ascending: false }) // Get most recently added UPCOMING
        .limit(1)
        .single();

    /* rule 4.1
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
    */

    // if there are no UPCOMING questions, then let's create a cyclic gameplay as above...
    if (newUpcomingQuestionError || !newUpcomingQuestionData) {
      console.log("NO UPCOMING QUESTIONS FOUND, CREATING A CYCLIC GAMEPLAY");

      // Best effort to get the next one, just find the oldest (using created_at) regardless of state)
      const { data: oldestQuestion, error: oldestQuestionError } =
        await supabase
          .from("questions_repo")
          .select("*")
          .order("created_at", { ascending: true })
          .limit(1)
          .single();

      // ABORT: we can't proceed, so just return an HTTP Error
      // ... AT THIS STAGE: there is NO (ACTIVE or ACTIVE_ARCIUM) question created/flagged in the DB
      if (oldestQuestionError || !oldestQuestion) {
        console.error(
          "ERR-DAQ-H-5: Error getting oldest question:",
          oldestQuestionError,
        );

        throw new Error("ERR-DAQ-H-5: No questions available");
      }

      const candidateQuestionToRepurpose = oldestQuestion;

      // we have a oldest question we can now repurpose for a cyclic gameplay, so get's it's answers
      const { data: answersData, error: answersError } = await supabase
        .from("question_answers")
        .select("*")
        .eq("question_id", candidateQuestionToRepurpose.id)
        .order("id");

      // ABORT: we can't proceed, so just return an HTTP Error
      // ... AT THIS STAGE: there is NO (ACTIVE or ACTIVE_ARCIUM) question created/flagged in the DB
      if (answersError || !answersData || answersData.length === 0) {
        console.error(
          "ERR-DAQ-H-6: No answers found for the random question we are repurposing for a cyclic gameplay",
        );

        throw new Error(
          "ERR-DAQ-H-6: No answers found for the random question we are repurposing for a cyclic gameplay)",
        );
      }

      // clone and shuffle the answers for some randomness...
      let clonedAndShuffledAnswers: any[] = answersData.map((answer: any) => ({
        text: answer.text,
      }));

      // Unbiased shuffle for 2 answers: 50/50 swap or keep
      if (clonedAndShuffledAnswers.length === 2 && Math.random() < 0.5) {
        clonedAndShuffledAnswers.reverse();
      }

      // THIS is our new "random", repurposed question that we are going to add to the DB for a cyclic gameplay
      const newQuestion = {
        title: candidateQuestionToRepurpose.title,
        img: candidateQuestionToRepurpose.img,
        text: candidateQuestionToRepurpose.text,
        answers: clonedAndShuffledAnswers,
      };

      // We are going to re-use the Next API action logic to add the new question and answers to the DB
      const result = await addNewQuestionAnswerSet(JSON.stringify(newQuestion));

      // ABORT: we can't proceed, so just return an HTTP Error
      // ... AT THIS STAGE: there is NO (ACTIVE or ACTIVE_ARCIUM) question created/flagged in the DB
      if ("error" in result && result.error) {
        console.error(
          "ERR-DAQ-H-7: Error adding new question and answers:",
          result.error,
        );

        throw new Error(
          `ERR-DAQ-H-7: Error adding new question and answers: ${result.error}`,
        );
      }

      if ("success" in result && result.success) {
        console.log(
          "New question and answers added successfully:",
          result.questionId,
        );

        // HERE WE NEED TO HAVE A SPECIAL BRANCH OFF LOGIC FOR DAILY/ARCIUM AS WE HAVE TO CREAT THE OO-CHAIN POLL
        if (isDaily) {
          const nextDailyArciumPollId = await getNextArciumPollId();

          console.log(
            "ARCIUM:nextDailyArciumPollId >>>>",
            nextDailyArciumPollId,
          );

          if (nextDailyArciumPollId === null) {
            console.error("ERR-DAQ-H-12: Failed to get next Arcium poll ID");

            throw new Error("ERR-DAQ-H-12: Failed to get next Arcium poll ID");
          }

          // Create on-chain Arcium poll
          const pollQuestionText = candidateQuestionToRepurpose.title;

          // // bypass for now...
          // const polSig = "1234567890";
          // const finalizedPolSig = "1234567890";
          // const error = false;
          // const errorMessage = "";

          const {
            polSig,
            finalizedPolSig,
            error: createNewOnChainArciumPollError,
            errorMessage: createNewOnChainArciumPollErrorMessage,
          } = await createNewOnChainArciumPoll(
            nextDailyArciumPollId,
            pollQuestionText,
            candidateQuestionToRepurpose.id,
          );

          arciumPollId = nextDailyArciumPollId;

          // we save the below two fields regardless on if arcium poll creation failed or not
          if (polSig && String(polSig).trim() !== "") {
            arciumPolSig = polSig;
          }

          if (finalizedPolSig && String(finalizedPolSig).trim() !== "") {
            arciumFinalizedPolSig = finalizedPolSig;
          }

          if (createNewOnChainArciumPollError) {
            // even if it's an error, let's just resume with the daily quesion procress anyway
            // ... mainly, cause the arcium poll creation patially faileded and we need to commit to the nextDailyArciumPollId anyway to avoid future issues when creating arcium polls
            console.error(
              "Error creating new on chain arcium poll:",
              createNewOnChainArciumPollErrorMessage,
            );

            specificNotices.push(
              "Arcium error: Failed to create an onchain poll, so reverted to a regular poll." +
                createNewOnChainArciumPollErrorMessage || "",
            );
          }
        }

        // OK, we can now fetch the new question that we just added...
        const {
          data: newUpcomingJustCreatedQuestionData,
          error: newUpcomingJustCreatedQuestionError,
        } = await supabase
          .from("questions_repo")
          .select("*")
          .eq("game_status", "UPCOMING")
          .order("created_at", { ascending: false }) // Get most recently added UPCOMING
          .limit(1)
          .single();

        // ABORT: we can't proceed, so just return an HTTP Error
        // ... AT THIS STAGE: there is NO (ACTIVE or ACTIVE_ARCIUM) question created/flagged in the DB, But there is a UPCOMING one we just created
        if (
          newUpcomingJustCreatedQuestionError ||
          !newUpcomingJustCreatedQuestionData
        ) {
          console.error(
            "ERR-DAQ-H-8: Error fetching UPCOMING question:",
            newUpcomingJustCreatedQuestionError,
          );

          throw new Error("ERR-DAQ-H-8: Error fetching UPCOMING question:");
        }

        // this is the new question that we just added... and it becomes the (ACTIVE or ACTIVE_ARCIUM) question!
        if (newUpcomingJustCreatedQuestionData) {
          activeQuestionData = newUpcomingJustCreatedQuestionData;
        }
      }
    } else {
      // HAPPY PATH: there was an UPCOMING questions, then let's use the most recently added one...
      if (newUpcomingQuestionData) {
        activeQuestionData = newUpcomingQuestionData;
      }
    }

    // S: Updating it's timestamp medatadata in the DB so it functions as a Daily active question --------------------------

    let updatePayload: Record<string, unknown> = {};

    if (!isDaily) {
      // opens_at / closes_at: start and end of current UTC hour. DB type is timestamp (no TZ).
      // toTimestampStr yields "YYYY-MM-DD HH:mm:ss.sss" to store literal UTC.
      const opensAt = getOpensAt(now);
      const closesAt = getClosesAt(now);

      updatePayload = {
        game_status: "ACTIVE",
        epoch_id: epochIdString,
        opens_at: toTimestampStr(opensAt),
        closes_at: toTimestampStr(closesAt),
      };
    } else {
      const opensAtDay = getOpensAtDay(now);
      const closesAtDay = getClosesAtDay(now);

      updatePayload = {
        game_status: "ACTIVE_ARCIUM",
        epoch_id: epochIdString,
        opens_at: toTimestampStr(opensAtDay),
        closes_at: toTimestampStr(closesAtDay),
      };

      if (arciumPollId && String(arciumPollId).trim() !== "") {
        updatePayload.arcium_poll_id = arciumPollId;
      }

      if (arciumPolSig && String(arciumPolSig).trim() !== "") {
        updatePayload.arcium_pol_sig = arciumPolSig;
      }

      if (
        arciumFinalizedPolSig &&
        String(arciumFinalizedPolSig).trim() !== ""
      ) {
        updatePayload.arcium_finalized_pol_sig = arciumFinalizedPolSig;
      }
    }

    const { error: updateError } = await supabase
      .from("questions_repo")
      .update(updatePayload)
      .eq("id", activeQuestionData?.id);

    // ABORT: we can't proceed, so just return an HTTP Error
    // ... AT THIS STAGE: there is NO (ACTIVE or ACTIVE_ARCIUM) question created/flagged in the DB, But there is a UPCOMING one we just created
    if (updateError) {
      console.error(
        "ERR-DAQ-H-9: Error updating question metadata:",
        updateError,
      );

      throw new Error(
        `ERR-DAQ-H-9: Error updating question metadata: ${updateError}`,
      );
    }

    // Close other (ACTIVE or ACTIVE_ARCIUM) (previous epoch) so we keep only one (ACTIVE or ACTIVE_ARCIUM) per epoch (rule 5).
    await closeOtherActive(epochIdString, targetGameStatus, currentGameStatus);

    // E: Updating it's timestamp medatadata in the DB so it functions as a Daily active question --------------------------

    return {
      error: false,
      errorObject: null,
      activeQuestionData: activeQuestionData,
      newArciumMetaData: {
        arciumPollId: arciumPollId,
        arciumPolSig: arciumPolSig,
        arciumFinalizedPolSig: arciumFinalizedPolSig,
      },
    };
  } catch (error) {
    return {
      error: true,
      errorObject: error as Error | null,
      activeQuestionData: null,
      newArciumMetaData: null,
    };
  }
}

export async function getAnswersFromDBForQuestion(questionId: number): Promise<{
  error: boolean;
  errorObject: Error | null;
  answers: GameQuestionAnswer[] | null;
}> {
  try {
    // Get answers for the active question
    const { data: answersData, error: answersError } = await supabase
      .from("question_answers")
      .select("*")
      .eq("question_id", questionId)
      .order("id");

    // ABORT: we can't proceed, so just return an HTTP Error
    // ... AT THIS STAGE: there is a (most likely) an ACTIVE question created/flagged in the DB
    if (answersError) {
      console.error("ERR-DAQ-H-11: Error fetching answers:", answersError);
    }

    // Map answers to GameQuestionAnswer format
    const answers: GameQuestionAnswer[] = (answersData ?? []).map(
      (ans: GameQuestionAnswer) => ({
        id: ans.id,
        text: ans.text,
      }),
    );

    return {
      error: false,
      errorObject: null,
      answers: answers,
    };
  } catch (error) {
    return {
      error: true,
      errorObject: error as Error,
      answers: null,
    };
  }
}
