"use client";

import { useState, useEffect } from "react";
import { GameQuestion, GameQuestionAnswer } from "@/types/types";
import {
  getGameHourSlot,
  getCurrentDateDDMMYY,
  getEpochIdForDay,
  getNextDayStartsAt,
} from "@/lib/game-epoch";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { Textarea } from "../ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { AnswerBit } from "@/lib/answer-commitments";
import { getEpochId } from "@/lib/game-epoch";
import { QuestionDisplay } from "./QuestionDisplay";
import { toast } from "@/hooks/use-toast";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@radix-ui/react-popover";

let BYPASS_GAME_DEV_MODE = true;

interface PrivateDataGameProps {
  currentGameSecureNoteStorage: string;
  onAnswerSelection: (
    question: GameQuestion,
    answer: GameQuestionAnswer,
    answerReasoning?: string
  ) => Promise<boolean>;
  onAnswerCommitment: (
    questionId: number,
    epochId: string,
    answerBit: AnswerBit
  ) => Promise<boolean>;
}

export function PrivateDataGame({
  currentGameSecureNoteStorage,
  onAnswerSelection,
  onAnswerCommitment,
}: PrivateDataGameProps) {
  const [randomQuestion, setRandomQuestion] = useState<GameQuestion | null>(
    null
  );
  const [selectedAnswer, setSelectedAnswer] =
    useState<GameQuestionAnswer | null>(null);

  const [isCommittingAnswer, setIsCommittingAnswer] = useState<boolean>(false);
  const [currentHour, setCurrentHour] = useState<number>(1);
  const [countdown, setCountdown] = useState<string>("");
  const [dailyCountdown, setDailyCountdown] = useState<string>("");
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  /** 'hourly' = opened from hour tile, 'daily' = opened from daily Arcium tile */
  const [selectedSource, setSelectedSource] = useState<
    "hourly" | "daily" | null
  >(null);
  const [playedHours, setPlayedHours] = useState<number[]>(() => {
    const storedLog = localStorage.getItem("x-gameplay-played-hr-log") || "";
    return storedLog ? storedLog.split(",").map(Number) : [];
  });
  const [lastPlayedDate, setLastPlayedDate] = useState<string>(
    () => localStorage.getItem("x-gameplay-played-last-ddmmyy") || ""
  );
  const [dailyPlayed, setDailyPlayed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem("x-gameplay-played-daily-ddmmyy") || "";
    const today = getCurrentDateDDMMYY(new Date());
    return stored === today;
  });
  const [fetchingActiveQuestion, setFetchingActiveQuestion] =
    useState<boolean>(false);
  const [reasoning, setReasoning] = useState("");
  const [dailyActiveOffline, setDailyActiveOffline] = useState<boolean>(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentHour(getGameHourSlot(now));

      // Countdown to next UTC hour (use raw 0–23 for setUTCHours; +1 is “next hour”)
      const nextHour = new Date(now);
      nextHour.setUTCHours(now.getUTCHours() + 1, 0, 0, 0);
      const diff = nextHour.getTime() - now.getTime();
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setCountdown(`${minutes}m ${seconds}s`);

      // Countdown to next UTC day (when the next daily question appears)
      const nextDayStart = getNextDayStartsAt(now);
      const dailyDiff = Math.max(0, nextDayStart.getTime() - now.getTime());
      const dailyHours = Math.floor(dailyDiff / 3600000);
      const dailyMins = Math.floor((dailyDiff % 3600000) / 60000);
      const dailySecs = Math.floor((dailyDiff % 60000) / 1000);
      setDailyCountdown(
        dailyHours > 0
          ? `${dailyHours}h ${dailyMins}m ${dailySecs}s`
          : `${dailyMins}m ${dailySecs}s`
      );

      const currentDate = getCurrentDateDDMMYY(now);
      if (currentDate !== lastPlayedDate) {
        localStorage.setItem("x-gameplay-played-last-ddmmyy", currentDate);
        localStorage.setItem("x-gameplay-played-hr-log", "");
        setLastPlayedDate(currentDate);
        setPlayedHours([]);
        setRandomQuestion(null);
        setSelectedSource(null);
        setSelectedHour(null);
      }
      const storedDaily =
        localStorage.getItem("x-gameplay-played-daily-ddmmyy") || "";
      setDailyPlayed(storedDaily === currentDate);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [lastPlayedDate]);

  useEffect(() => {
    if (!randomQuestion) {
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: "smooth",
      });
    }
  }, [randomQuestion]);

  const getRandomQuestion = async () => {
    try {
      setFetchingActiveQuestion(true);

      const res = await fetch(`/api/private-data-game/get-active-question`);

      const body = await res.json();

      if (!res.ok) {
        console.error("Failed to fetch stored files:", body);

        if (body.error) {
          toast.error("Error", "ERROR: " + body.error);
          return;
        }

        return;
      }

      const dailyActive = body.dailyActive ?? null;
      setDailyActiveOffline(dailyActive === null);

      const notices: string[] = Array.isArray(body.specificNotices)
        ? body.specificNotices
        : [];
      notices
        .filter((s) => typeof s === "string" && s.trim().length > 0)
        .forEach((text) => toast.message("Notice", text));

      return {
        hourlyActive: body.hourlyActive ?? null,
        dailyActive,
      };
    } catch (err) {
      console.error("Error fetching active question:", err);
      toast.error("Error", "Error fetching active question");
    } finally {
      setFetchingActiveQuestion(false);
    }
  };

  const handleHourClick = async (hour: number) => {
    if (hour === currentHour) {
      setSelectedHour(hour);
      setSelectedSource("hourly");

      const data = await getRandomQuestion();

      if (data?.hourlyActive) {
        setRandomQuestion(data.hourlyActive);
      }

      // Update offline state for daily if needed
      if (data?.dailyActive === null) {
        setDailyActiveOffline(true);
      }

      setSelectedAnswer(null);
    }
  };

  const handleDailyClick = async () => {
    setSelectedSource("daily");
    setSelectedHour(null);

    const data = await getRandomQuestion();

    if (data?.dailyActive) {
      setRandomQuestion(data.dailyActive);
      setDailyActiveOffline(false);
    } else {
      setSelectedSource(null);

      toast.error(
        "Error",
        "Daily Arcium-Enabled Morality Question is currently offline."
      );

      setDailyActiveOffline(true);
    }

    setSelectedAnswer(null);
  };

  const handleCommitAnswer = async () => {
    if (!randomQuestion || !selectedAnswer) {
      toast.error("Error", "Unable to commit");
      return;
    }

    const isDaily = selectedSource === "daily";
    if (isDaily) {
      if (dailyPlayed && !BYPASS_GAME_DEV_MODE) {
        toast.error(
          "Error",
          "You've already responded to today's daily Arcium question."
        );
        return;
      }
    } else {
      const localStoragePlayedLog =
        localStorage.getItem("x-gameplay-played-hr-log") || "";
      if (
        localStoragePlayedLog.split(",").indexOf(currentHour.toString()) !==
          -1 &&
        !BYPASS_GAME_DEV_MODE
      ) {
        toast.error(
          "Error",
          "E1: You've already responded to this question during this game round/hour"
        );
        return;
      }
    }

    // simple check, just get the first saved quesion Id  from currentGameSecureNoteStorage and check if questionId: X is '`questionId: ${question.id}'
    // ... it's not the best check, as all we are doing is seeing if the last saved quesion id is the same
    // ... it may cause problems IF for some reason the quesion has repeated 2 hours in a row (which should NOT happen)
    var subStringOfLastSavedQuestionId = currentGameSecureNoteStorage
      .substr(
        currentGameSecureNoteStorage.indexOf("questionId:"),
        currentGameSecureNoteStorage.indexOf("question:")
      )
      .trim();

    if (subStringOfLastSavedQuestionId === `questionId: ${randomQuestion.id}`) {
      alert(
        "E2: You've already responded to this question during this game round/hour"
      );
      return;
    }

    setIsCommittingAnswer(true);

    const now = new Date();
    const epochId = isDaily ? getEpochIdForDay(now) : getEpochId(now);

    if (
      typeof selectedAnswer.index !== "number" ||
      selectedAnswer.index > 1 ||
      selectedAnswer.index < 0
    ) {
      toast.error(
        "Error",
        "Unable to commit as no answer index was given, we received: " +
          JSON.stringify(selectedAnswer)
      );
      setIsCommittingAnswer(false);
      return;
    }

    await onAnswerCommitment(
      randomQuestion!.id,
      epochId,
      selectedAnswer.index as AnswerBit
    );

    await onAnswerSelection(randomQuestion!, selectedAnswer!, reasoning);

    if (isDaily) {
      const today = getCurrentDateDDMMYY(now);
      setDailyPlayed(true);
      localStorage.setItem("x-gameplay-played-daily-ddmmyy", today);
    } else {
      const newPlayed = [...playedHours, currentHour];
      setPlayedHours(newPlayed);
      localStorage.setItem("x-gameplay-played-hr-log", newPlayed.join(","));
    }

    setTimeout(() => {
      setIsCommittingAnswer(false);
      setSelectedSource(null);
      setSelectedHour(null);
      setRandomQuestion(null);
    }, 2000);
  };

  const hours = Array.from({ length: 24 }, (_, i) => i + 1);

  const isDailyDisabled =
    (dailyPlayed && !BYPASS_GAME_DEV_MODE) || fetchingActiveQuestion;
  const modalOpen =
    randomQuestion != null &&
    ((selectedSource === "hourly" && selectedHour === currentHour) ||
      selectedSource === "daily");

  return (
    <div className="w-full">
      {/* Daily Arcium Question Section */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        <div
          className={`col-span-4 p-2 border rounded text-center ${
            dailyActiveOffline
              ? "bg-gray-200 dark:bg-gray-800 border-gray-400"
              : dailyPlayed
              ? "bg-green-200/80 dark:bg-green-900/40 border-green-600"
              : "bg-green-200 border-green-500"
          } ${
            isDailyDisabled || dailyActiveOffline
              ? "cursor-not-allowed"
              : "cursor-pointer hover:bg-green-300/80"
          }`}
          onClick={() =>
            !isDailyDisabled && !dailyActiveOffline && handleDailyClick()
          }
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (
              !isDailyDisabled &&
              !dailyActiveOffline &&
              (e.key === "Enter" || e.key === " ")
            ) {
              e.preventDefault();
              handleDailyClick();
            }
          }}
        >
          <div className="text-xs md:text-md">
            <span className="font-bold">
              ✨ Daily Arcium-Enabled Morality Question{" "}
            </span>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  className="!text-md hover:underline decoration-dotted cursor-help md:mt-2"
                >
                  <span className="!text-[9px] mb-2 md:mb-0">👁️ What?</span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="max-w-sm text-xs text-gray-700 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-md p-2">
                Every day, a special morality question is unlocked. The results
                of this question are aggregated privately and verifiably using
                the{" "}
                <a
                  href="https://www.arcium.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-600"
                >
                  Arcium Network
                </a>{" "}
                . <br />
                <br />
                No user identity is ever-recorded and yet the integrity of the
                final result is verifiable on the blockchain! This allows us to
                build monetization strategies like private prediction markets
                that let the world bet on collective human morality signals
                whilst compensating you for your time in the game.
                <br />
                <br />
                Note that unlike the hourly question, to play this Daily
                Arcium-Enabled Morality Question you will need your Solana
                wallet connected (see app menu bar for this option) and sign a
                transacion that send your encrypted answer to the Arcium
                network.
              </PopoverContent>
            </Popover>
          </div>
          {dailyActiveOffline ? (
            <div className="text-[9px] md:text-xs text-red-600 dark:text-red-400 font-semibold">
              Daily Arcium-Enabled Morality Question is currently offline.
            </div>
          ) : (
            <>
              <div className="text-[9px] md:text-xs text-black">
                {dailyPlayed ? " ✅ Live & Played!" : "🟢 Live Now!"}
              </div>
              <div className="text-[9px] md:text-xs text-green-700 dark:text-green-400 mt-0.5">
                Next question in: {dailyCountdown}
              </div>
            </>
          )}
          {fetchingActiveQuestion && selectedSource === "daily" && (
            <div className="flex flex-row justify-center mt-2">
              <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* Hourly Questions Section */}
      <>
        <div className="text-sm font-bold mb-4 text-left">
          Hourly Morality Questions
        </div>
        <div className="grid grid-cols-4 gap-4 mb-8">
          {hours.map((hour) => {
            const isPast = hour < currentHour;
            const isActive = hour === currentHour;
            const isNext =
              hour === currentHour + 1 || (currentHour === 24 && hour === 1);
            const isFuture = hour > currentHour;
            const isPlayed = playedHours.includes(hour);
            const isArciumActive =
              isActive &&
              selectedSource === "hourly" &&
              randomQuestion?.arciumPollId != null &&
              randomQuestion?.arciumPolSig != null &&
              randomQuestion?.arciumPolSig.trim() !== "" &&
              randomQuestion?.arciumFinalizedPolSig != null &&
              randomQuestion?.arciumFinalizedPolSig.trim() !== "";

            return (
              <div
                key={hour}
                className={`p-2 border rounded text-center ${
                  isActive
                    ? isArciumActive
                      ? "bg-gradient-to-br from-green-200 to-violet-200 dark:from-green-900/50 dark:to-violet-900/50 border-violet-500 ring-2 ring-violet-300 dark:ring-violet-700 animate-pulse"
                      : "bg-green-200 border-green-500 animate-pulse"
                    : isPast
                    ? "bg-gray-300 opacity-50"
                    : "bg-gray-100"
                } ${
                  isFuture ||
                  isPast ||
                  (isActive && isPlayed && !BYPASS_GAME_DEV_MODE)
                    ? "cursor-not-allowed"
                    : "cursor-pointer hover:bg-gray-200"
                }
              ${fetchingActiveQuestion ? "cursor-not-allowed" : ""}
              `}
                onClick={() =>
                  (!isPlayed || BYPASS_GAME_DEV_MODE) && handleHourClick(hour)
                }
              >
                <div className="text-lg font-bold">{hour}</div>
                {isPast && (
                  <div
                    className={`text-[9px] md:text-xs ${
                      isPlayed ? "text-green-800" : "text-red-500"
                    }`}
                  >
                    {isPlayed ? "Played!" : "Missed"}
                  </div>
                )}
                {isActive && (
                  <div className="text-[9px] md:text-xs text-black space-y-0.5">
                    <div>
                      {isPlayed ? " ✅ Live & Played!" : "🟢 Live Now!"}
                    </div>
                    {isArciumActive && (
                      <div className="font-semibold text-violet-700 text-[9px]">
                        ✨ Arcium Verifiable
                      </div>
                    )}
                  </div>
                )}
                {isNext && (
                  <div className="text-[9px] md:text-xs text-green-500">
                    {countdown}
                  </div>
                )}
                {fetchingActiveQuestion && isActive && (
                  <div className="flex flex-row justify-center mt-2">
                    <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 md:mr-2 animate-spin" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </>

      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          if (!open && !isCommittingAnswer) {
            setRandomQuestion(null);
            setSelectedHour(null);
            setSelectedSource(null);
          }
        }}
      >
        <DialogContent className="max-w-xl gap-4 scroll-smooth max-h-[90vh] overflow-y-auto">
          {randomQuestion && (
            <>
              <DialogHeader>
                <div className="flex flex-col gap-2">
                  <DialogTitle className="flex items-center gap-2 flex-wrap">
                    Question
                    {randomQuestion?.arciumPollId &&
                      randomQuestion?.arciumPolSig &&
                      randomQuestion?.arciumPolSig.trim() !== "" &&
                      randomQuestion?.arciumFinalizedPolSig &&
                      randomQuestion?.arciumFinalizedPolSig.trim() !== "" && (
                        <Badge
                          variant="secondary"
                          className="bg-gradient-to-br from-green-500 to-violet-200 dark:from-green-900/50 dark:to-violet-900/50 border-violet-500 ring-2 ring-violet-300 dark:ring-violet-700 font-semibold text-[10px] px-2 py-1"
                        >
                          ✨ Arcium Verifiable
                        </Badge>
                      )}
                  </DialogTitle>
                  {randomQuestion?.arciumPollId &&
                    randomQuestion?.arciumPolSig &&
                    randomQuestion?.arciumPolSig.trim() !== "" &&
                    randomQuestion?.arciumFinalizedPolSig &&
                    randomQuestion?.arciumFinalizedPolSig.trim() !== "" && (
                      <p className="text-[10px] text-green-600 dark:text-green-400">
                        This question&apos;s results will be verifiable on the
                        Arcium network and soon be part of prediction markets.
                      </p>
                    )}
                </div>
              </DialogHeader>
              <div
                className={`space-y-4 ${
                  isCommittingAnswer ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                <QuestionDisplay
                  question={randomQuestion}
                  selectedAnswer={selectedAnswer}
                  onAnswerChange={(answer) => setSelectedAnswer(answer)}
                  disabled={isCommittingAnswer}
                />

                <div className="p-2 sm:p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs py-2">
                    A short &quot;reasoning&quot; for your answer is optional
                    but highly desirable! What is your honest reasoning for this
                    answer? why did you pick it? (250 characters max).
                  </p>
                  <Textarea
                    value={reasoning}
                    onChange={(e) => setReasoning(e.target.value)}
                    required
                    maxLength={250}
                    disabled={isCommittingAnswer}
                    placeholder="Write it in 'first-person'. e.g. I picked this because I felt the person deserved what happened to them as they seemed bad."
                    className="h-10 sm:h-11 text-xs"
                  />
                </div>

                <div className="text-[8px] text-gray-500 whitespace-pre-wrap overflow-x-auto">
                  debug: q_id: {randomQuestion?.id}, a_ids:{" "}
                  {randomQuestion?.answers.map((a) => a.id).join(", ")},
                  a_PollId: {randomQuestion?.arciumPollId ?? "na"}, a_PolSig:{" "}
                  {randomQuestion?.arciumPolSig &&
                  randomQuestion?.arciumPolSig.trim() !== ""
                    ? randomQuestion?.arciumPolSig
                    : "na"}
                  , a_FinalizedPolSig:{" "}
                  {randomQuestion?.arciumFinalizedPolSig &&
                  randomQuestion?.arciumFinalizedPolSig.trim() !== ""
                    ? randomQuestion?.arciumFinalizedPolSig
                    : "na"}
                  ,
                </div>

                <Button
                  onClick={() => selectedAnswer && handleCommitAnswer()}
                  disabled={!selectedAnswer}
                  className="w-full"
                >
                  {isCommittingAnswer
                    ? `Committing to your private vault...`
                    : `Submit Answer`}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
