// Logging Module ID: DAQ-D
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { GameQuestion } from "@/types/types";
import { getServerSession } from "@/lib/auth-utils";
import { getEpochIdForDay } from "@/lib/game-epoch";
import {
  promoteOrCreateAndCommitNewActiveQuestion,
  closeOtherActive,
  getAnswersFromDBForQuestion,
} from "./shared-logic/shared-logic";
import { sendMoraAppSlackAlert } from "@/lib/slack";

export async function dailyController(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    let activeQuestionData: GameQuestion | null = null;
    let arciumMetaData: {
      arciumPollId: number | null;
      arciumPolSig: string | null;
      arciumFinalizedPolSig: string | null;
    } | null = null;
    const specificNotices: string[] = [];

    const session = await getServerSession();

    if (!session) {
      return NextResponse.json({ user: null });
    }

    const now = new Date();
    const _targetEpochIdString = getEpochIdForDay(now); // 00DDMMYY for daily Arcium

    /*
      Ultimate goal of this route's logic: ONLY EVER one ACTIVE_ARCIUM question at a time with epoch_id === _targetEpochIdString should be in the DB and sent to the client.

      Rules:
      1. _targetEpochIdString = current LIVE epoch_id
      2. At most TWO ACTIVE_ARCIUM total (or zero on first play) can be seen at any time. Abort if >2 (corrupted). if this happens, we reboot the ACTIVE_ARCIUMs to DEACTIVE_ARCIUM      
      3. If one ACTIVE_ARCIUM with epoch_id === _targetEpochIdString: use it, get answers, return. Close other ACTIVE_ARCIUM (different epoch).
      4. If none: get a UPCOMING, set game_status=ACTIVE_ARCIUM, epoch_id, opens_at, closes_at (UTC hour). Close other ACTIVE_ARCIUM (different epoch).
      4.1 Note on UPCOMING selection: If no UPCOMING questions are found intially during querying, create a new one using our cyclic gameplay logic where we recycle/clone an existing FINALIZED or AGGREGATING_ARCIUM question and answers and resave it as a UPCOMING question.
      5. If multiple ACTIVE_ARCIUM with same epoch_id: corrupted; return 500.
      6. Finally, get the answers for the active question and return it to the client.
      */

    // Rule 2: at most 2 ACTIVE_ARCIUM total (current + previous epoch) or 0. Abort if >2.
    const { data: activeQuestionsData, error: activeQuestionsError } =
      await supabase
        .from("questions_repo")
        .select("*")
        .eq("game_status", "ACTIVE_ARCIUM")
        .limit(3);

    if (
      !activeQuestionsError &&
      activeQuestionsData &&
      activeQuestionsData.length > 2
    ) {
      // this seems like a valid race condition case as i saw it when 2 plp tried to play a new hour a close enough time
      // ... if this happens, we should just reset all the ACTIVE_ARCIUM questions to DEACTIVATE_ARCIUM
      // ... but let's fail the current user reuest that triggered this issue, he may try again and it should go into the scenario where start again
      console.error(
        "ERR-DAQ-D-2: Corrupted gameplay state as there are more than two active questions which should NOT happen",
        activeQuestionsError,
      );

      specificNotices.push(
        "ERR-DAQ-D-2: Corrupted gameplay state. Rebooting all active questions...",
      );

      // ... we should reset all the ACTIVE_ARCIUM questions to DEACTIVATE_ARCIUM
      const { error: rebootAllActiveQuestionsError } = await supabase
        .from("questions_repo")
        .update({ game_status: "DEACTIVATE_ARCIUM" })
        .eq("game_status", "ACTIVE_ARCIUM");

      if (rebootAllActiveQuestionsError) {
        console.error(
          "Error resetting active questions to DEACTIVATE_ARCIUM:",
          rebootAllActiveQuestionsError,
        );

        specificNotices.push(
          "ERR-DAQ-H-2: Corrupted gameplay state. We are investigating...",
        );

        await sendMoraAppSlackAlert(
          "ERR-DAQ-H-2: Corrupted gameplay state. We are investigating...",
        );
      }

      return NextResponse.json(
        {
          error:
            "ERR-DAQ-D-2: Corrupted gameplay state as there are more than two active questions which should NOT happen",
          specificNotices,
        },
        { status: 500 },
      );
    }

    // Find ACTIVE_ARCIUM question(s) with epoch_id === _targetEpochIdString. Use limit(2) to detect corruption (multiple with same epoch).
    const { data: activeQuestionList, error: selectError } = await supabase
      .from("questions_repo")
      .select("*")
      .eq("game_status", "ACTIVE_ARCIUM")
      .eq("epoch_id", _targetEpochIdString)
      .limit(2);

    if (selectError) {
      console.error(
        "ERR-DAQ-D-3: Error checking active question:",
        selectError,
      );

      return NextResponse.json(
        { error: "ERR-DAQ-D-3: Error checking active question" },
        { status: 500 },
      );
    }

    // Corrupted: more than one ACTIVE_ARCIUM with same epoch_id.
    if (activeQuestionList && activeQuestionList.length > 1) {
      console.error(
        "ERR-DAQ-D-4: Corrupted gameplay state: multiple ACTIVE_ARCIUM questions with same epoch_id",
        selectError,
      );

      specificNotices.push(
        "ERR-DAQ-D-4: Corrupted gameplay state: multiple questions with same epoch_id",
      );

      return NextResponse.json(
        {
          error:
            "ERR-DAQ-D-4: Corrupted gameplay state: multiple ACTIVE_ARCIUM questions with same epoch_id",
        },
        { status: 500 },
      );
    }

    // Load the ACTIVE_ARCIUM quesion if it exists
    let _activeQuestionData: (typeof activeQuestionList)[0] | null =
      activeQuestionList && activeQuestionList.length === 1
        ? activeQuestionList[0]
        : null;

    // ... an ACTIVE_ARCIUM question was found, so use it...
    if (_activeQuestionData) {
      activeQuestionData = _activeQuestionData;
    }

    if (activeQuestionData) {
      // Have matching ACTIVE_ARCIUM for this epoch. Close any ACTIVE_ARCIUM from other epochs, then serve.
      await closeOtherActive(
        _targetEpochIdString,
        "AGGREGATING_ARCIUM",
        "ACTIVE_ARCIUM",
      );
    } else {
      // ... no current ACTIVE_ARCIUM question was found, so we need to generate one and commit it to the DB
      const {
        error: promoteOrCreateNewActiveQuestionError,
        errorObject: promoteOrCreateNewActiveQuestionErrorObject,
        activeQuestionData: newActiveQuestionData,
        newArciumMetaData,
      } = await promoteOrCreateAndCommitNewActiveQuestion(
        now,
        _targetEpochIdString,
        "AGGREGATING_ARCIUM",
        "ACTIVE_ARCIUM",
        specificNotices,
      );

      if (promoteOrCreateNewActiveQuestionError) {
        console.error(
          "Error promoting or creating new active question:",
          promoteOrCreateNewActiveQuestionErrorObject,
        );
        return NextResponse.json(
          {
            error:
              (promoteOrCreateNewActiveQuestionErrorObject as Error)?.message ||
              "ERR-DAQ-D-13: Error promoting or creating new active question",
          },
          { status: 500 },
        );
      }

      if (newArciumMetaData) {
        arciumMetaData = newArciumMetaData;
      }

      activeQuestionData = newActiveQuestionData;
    }

    // We should never have an empty an empty activeQuestionData, but do one final check
    // ABORT: we can't proceed, so just return an HTTP Error
    // ... AT THIS STAGE: there MAYBE an ACTIVE_ARCIUM question created/flagged in the DB, we need to look at logs to figure out what happened above
    if (!activeQuestionData) {
      console.error("ERR-DAQ-D-10: No questions available");
      return NextResponse.json(
        { error: "ERR-DAQ-D-10: No questions available" },
        { status: 500 },
      );
    }

    const {
      error: getAnswersError,
      errorObject: getAnswersErrorObject,
      answers,
    } = await getAnswersFromDBForQuestion(activeQuestionData.id);

    if (getAnswersError || !answers) {
      console.error(
        "ERR-DAQ-D-11: Error fetching answers:",
        getAnswersErrorObject?.message || "Unknown error",
      );

      return NextResponse.json(
        {
          error:
            "ERR-DAQ-D-11: Error fetching answers: " +
            (getAnswersErrorObject?.message || "Unknown error"),
        },
        { status: 500 },
      );
    }

    // Construct dailyActive
    const dailyActive: GameQuestion = {
      id: activeQuestionData.id,
      title: activeQuestionData.title,
      img: activeQuestionData.img,
      text: activeQuestionData.text,
      opens_at: activeQuestionData.opens_at,
      closes_at: activeQuestionData.closes_at,
      game_status: activeQuestionData.game_status,
      epoch_id: activeQuestionData.epoch_id,
      answers,
      ...((arciumMetaData?.arciumPollId != null ||
        activeQuestionData?.arcium_poll_id != null) && {
        arcium_poll_id:
          arciumMetaData?.arciumPollId || activeQuestionData?.arcium_poll_id,
      }),
      ...((arciumMetaData?.arciumPolSig != null ||
        activeQuestionData?.arcium_pol_sig != null) && {
        arcium_pol_sig:
          arciumMetaData?.arciumPolSig || activeQuestionData?.arcium_pol_sig,
      }),
      ...((arciumMetaData?.arciumFinalizedPolSig != null ||
        activeQuestionData?.arcium_finalized_pol_sig != null) && {
        arcium_finalized_pol_sig:
          arciumMetaData?.arciumFinalizedPolSig ||
          activeQuestionData?.arcium_finalized_pol_sig,
      }),
    };

    return NextResponse.json({
      dailyActive,
      specificNotices,
    });
  } catch (error) {
    console.error("ERR-DAQ-D-12: Error fetching hourly question:", error);

    // ABORT: we can't proceed, so just return an HTTP Error
    // ... AT THIS STAGE: we are not sure the state of the DB
    return NextResponse.json(
      { error: "ERR-DAQ-D-12: Internal server error" },
      { status: 500 },
    );
  }
}
