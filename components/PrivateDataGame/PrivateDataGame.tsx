"use client";

import { useState, useEffect } from "react";
import { GameQuestion, GameQuestionAnswer } from "@/types/types";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { getGameHourSlot, getCurrentDateDDMMYY } from "@/lib/game-epoch";
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
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [playedHours, setPlayedHours] = useState<number[]>(() => {
    const storedLog = localStorage.getItem("x-gameplay-played-hr-log") || "";
    return storedLog ? storedLog.split(",").map(Number) : [];
  });
  const [lastPlayedDate, setLastPlayedDate] = useState<string>(
    () => localStorage.getItem("x-gameplay-played-last-ddmmyy") || ""
  );
  const [fetchingActiveQuestion, setFetchingActiveQuestion] =
    useState<boolean>(false);
  const [reasoning, setReasoning] = useState("");

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

      const currentDate = getCurrentDateDDMMYY(now);
      if (currentDate !== lastPlayedDate) {
        localStorage.setItem("x-gameplay-played-last-ddmmyy", currentDate);
        localStorage.setItem("x-gameplay-played-hr-log", "");
        setLastPlayedDate(currentDate);
        setPlayedHours([]);
      }
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

      return body.activeQuestion;

      // const randomIndex = Math.floor(Math.random() * gameQuestionDataSet.length);
      // return gameQuestionDataSet[randomIndex];
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

      const _activeQuestion = await getRandomQuestion();

      setRandomQuestion(_activeQuestion);
      setSelectedAnswer(null);
    }
  };

  const handleCommitAnswer = async () => {
    if (!randomQuestion || !selectedAnswer) {
      toast.error("Error", "Unable to commit");
      return;
    }

    // lets check if the user already commited this question.id recently (i.e. last 30 mins)
    // ... this is a simple check based on the secure note session raw data
    // ... it only protects in the event somethign on the UI fails and the user is able to commit
    // ... and answer for the same quesion multiple times in a hour
    // ideally we check local storage first, and THEN we check currentGameSecureNoteStorage
    console.log(
      "localstorage - ",
      localStorage.getItem("x-gameplay-played-hr-log")
    );
    console.log(
      "currentGameSecureNoteStorage - ",
      currentGameSecureNoteStorage
    );

    const localStoragePlayedLog =
      localStorage.getItem("x-gameplay-played-hr-log") || "";

    if (
      localStoragePlayedLog.split(",").indexOf(currentHour.toString()) !== -1
    ) {
      toast.error(
        "Error",
        "E1: You've already responded to this question during this game round/hour"
      );
      return;
    }

    // simple check, just get the first saved quesion Id  from currentGameSecureNoteStorage and check if questionId: X is '`questionId: ${question.id}'
    // ... it's not the best check, as all we are doing is seeing if the last saved quesion id is the same
    // ... it may cause problems IF for some reason the quesion has repeated 2 hours in a row (which should NOT happen)
    // var subStringOfLastSavedQuestionId = currentGameSecureNoteStorage
    //   .substr(
    //     currentGameSecureNoteStorage.indexOf("questionId:"),
    //     currentGameSecureNoteStorage.indexOf("question:")
    //   )
    //   .trim();

    // if (subStringOfLastSavedQuestionId === `questionId: ${randomQuestion.id}`) {
    //   alert(
    //     "E2: You've already responded to this question during this game round/hour"
    //   );
    //   return;
    // }

    setIsCommittingAnswer(true);

    const now = new Date();
    const _isActiveHHDDMMYY = getEpochId(now); // HHDDMMYY, hour 1–24, month 1–12

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
      _isActiveHHDDMMYY,
      selectedAnswer.index as AnswerBit
    );

    await onAnswerSelection(randomQuestion!, selectedAnswer!, reasoning);

    // Update played hours
    const newPlayed = [...playedHours, currentHour];
    setPlayedHours(newPlayed);
    localStorage.setItem("x-gameplay-played-hr-log", newPlayed.join(","));

    setTimeout(() => {
      setIsCommittingAnswer(false);
      setSelectedHour(null);
      setRandomQuestion(null);
    }, 2000);
  };

  const hours = Array.from({ length: 24 }, (_, i) => i + 1);

  return (
    <div className="w-full">
      <div className="grid grid-cols-4 gap-4 mb-8">
        {hours.map((hour) => {
          const isPast = hour < currentHour;
          const isActive = hour === currentHour;
          const isNext =
            hour === currentHour + 1 || (currentHour === 24 && hour === 1);
          const isFuture = hour > currentHour;
          const isPlayed = playedHours.includes(hour);
          const isArciumActive = isActive && randomQuestion?.arciumPollId;

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
                  <div>{isPlayed ? "Live & Played!" : "Live Now!"}</div>
                  {isArciumActive && (
                    <div className="font-semibold text-violet-700 text-[9px]">
                      Arcium Verifiable
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
                  <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-2 animate-spin" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Dialog
        open={selectedHour === currentHour && randomQuestion != null}
        onOpenChange={(open) => {
          if (!open && !isCommittingAnswer) {
            setRandomQuestion(null);
            setSelectedHour(null);
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
                    {randomQuestion?.arciumPollId && (
                      <Badge
                        variant="secondary"
                        className="bg-gradient-to-br from-green-200 to-violet-200 dark:from-green-900/50 dark:to-violet-900/50 border-violet-500 ring-2 ring-violet-300 dark:ring-violet-700 font-semibold text-[10px] px-2 py-1"
                      >
                        ✨ Arcium Verifiable
                      </Badge>
                    )}
                  </DialogTitle>
                  {randomQuestion?.arciumPollId && (
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
