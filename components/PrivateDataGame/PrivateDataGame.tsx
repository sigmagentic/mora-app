"use client";

import { useState, useEffect } from "react";
import { AppUser, GameQuestion, GameQuestionAnswer } from "@/types/types";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { Textarea } from "../ui/textarea";

let BYPASS_GAME_DEV_MODE = true;

interface PrivateDataGameProps {
  currentGameSecureNoteStorage: string;
  onAnswerSelection: (
    question: GameQuestion,
    answer: GameQuestionAnswer,
    answerReasoning?: string
  ) => Promise<boolean>;
}

export function PrivateDataGame({
  currentGameSecureNoteStorage,
  onAnswerSelection,
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
      const utcHour = now.getUTCHours();
      const hourNum = utcHour + 1; // 1-24
      setCurrentHour(hourNum);

      // Calculate countdown to next hour
      const nextHour = new Date(now);
      nextHour.setUTCHours(utcHour + 1, 0, 0, 0);
      const diff = nextHour.getTime() - now.getTime();
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setCountdown(`${minutes}m ${seconds}s`);

      // Check and update date
      const dd = String(now.getUTCDate()).padStart(2, "0");
      const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
      const yy = String(now.getUTCFullYear()).slice(-2);
      const currentDate = `${dd}-${mm}-${yy}`;

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
    if (randomQuestion) {
      const element = document.querySelector(".question-view-container");
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
      }
    } else {
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
        return;
      }

      return body.activeQuestion;

      // const randomIndex = Math.floor(Math.random() * gameQuestionDataSet.length);
      // return gameQuestionDataSet[randomIndex];
    } catch (err) {
      console.error("Error fetching active question:", err);
      alert("error!");
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
      alert("Unable to commit");
      return;
    }

    // lets check if the user already commited this question.id recently (i.e. last 30 mins)
    // ... this is a simple check based on the secure note session raw data
    // ... it only protects in the event somethign on the UI fails and the user is able to commit
    // ... and answer for the same quesion multiple times in a hour
    // ideally we check local storage first, and THEN we check currentGameSecureNoteStorage
    debugger;
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
      alert(
        "E1: You've already responded to this question during this game round/hour"
      );
      return;
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

  // const handleNewQuestion = async () => {
  //   const _activeQuestion = await getRandomQuestion();

  //   setRandomQuestion(_activeQuestion);
  //   setSelectedAnswer(null);
  // };

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

          return (
            <div
              key={hour}
              className={`p-4 border rounded text-center ${
                isActive
                  ? "bg-green-200 border-green-500 animate-pulse"
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
                  className={`text-xs ${
                    isPlayed ? "text-green-500" : "text-red-500"
                  }`}
                >
                  {isPlayed ? "Played!" : "Missed"}
                </div>
              )}
              {isActive && (
                <div className="text-xs text-black">
                  {isPlayed ? "Live & Played!" : "Live Now!"}
                </div>
              )}
              {isNext && (
                <div className="text-xs text-green-500">{countdown}</div>
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

      {selectedHour === currentHour && randomQuestion && (
        <div className="question-view-container">
          <Card className="w-full">
            <CardHeader>
              <CardTitle>Question</CardTitle>
            </CardHeader>
            <CardContent
              className={`space-y-4 ${
                isCommittingAnswer ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              <img src={randomQuestion.img} alt="Question" />
              <p className="text-sm">{randomQuestion.text}</p>
              <RadioGroup
                value={selectedAnswer?.id.toString() || ""}
                onValueChange={(value) =>
                  setSelectedAnswer(
                    randomQuestion.answers.find(
                      (a) => a.id.toString() === value
                    ) || null
                  )
                }
              >
                {randomQuestion.answers.map((answer) => (
                  <div
                    key={answer.id}
                    className="flex items-center space-x-2 mt-2"
                  >
                    <RadioGroupItem
                      value={answer.id.toString()}
                      id={answer.id.toString()}
                    />
                    <label
                      htmlFor={answer.id.toString()}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      {answer.text}
                    </label>
                  </div>
                ))}
              </RadioGroup>

              <div className="p-2 sm:p-3 bg-gray-50 rounded-lg">
                <p className="text-xs py-2">
                  A short &quot;reasoning&quot; for your answer is optional but
                  highly desirable! What is your honest reasoning for this
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
              {/* <Button
                onClick={handleNewQuestion}
                variant="outline"
                className="w-full"
              >
                Give me another random question
              </Button> */}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
