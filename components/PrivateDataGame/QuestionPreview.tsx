"use client";

import { useState, useEffect } from "react";
import { GameQuestion } from "@/types/types";
import { QuestionDisplay } from "./QuestionDisplay";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function QuestionPreview() {
  const [question, setQuestion] = useState<GameQuestion | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSampleQuestion = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const hardcodedQuestion = {
          id: 1,
          title: "The First Day",
          img: "https://api.itheumcloud.com/app_nftunes/other/the-first-day.jpg",
          text: "On your first day at a new school, you notice a school shooter approaching the building. You can warn the class, but doing so risks trapping you inside due to the chaos that will follow. If you stay quiet, you can leave safely. What do you do?",
          answers: [
            {
              id: 1,
              text: "Warn everyone, even if it means risking your own safety.",
            },
            {
              id: 2,
              text: "Leave quietly by yourself in secret and ensure your own safety first.",
            },
          ],
        };

        const useHardcodedQuestion = Math.random() < 0.8;

        if (useHardcodedQuestion) {
          setQuestion(hardcodedQuestion as GameQuestion);
        } else {
          const res = await fetch(
            "/api/private-data-game/get-active-question?give_sample_question=1"
          );

          if (!res.ok) {
            const body = await res.json();
            const errorMessage = body.error || "Failed to fetch question";

            // Check if it's the "No active question found" error
            if (errorMessage === "No active question found") {
              setError("NO_QUESTIONS_AVAILABLE");
            } else {
              throw new Error(errorMessage);
            }
          } else {
            const data = await res.json();
            setQuestion(data.activeQuestion);
          }
        }
      } catch (err: any) {
        console.error("Error fetching sample question:", err);
        setError("NO_QUESTIONS_AVAILABLE");
      } finally {
        setTimeout(() => {
          setIsLoading(false);
        }, 1000);
      }
    };

    fetchSampleQuestion();
  }, []);

  if (isLoading) {
    return (
      <Card className="border-0 shadow-2xl bg-white/95 backdrop-blur-sm h-full flex flex-col items-center justify-center">
        <CardContent className="flex flex-col items-center justify-center py-12 px-6">
          <Loader2 className="w-6 h-6 animate-spin text-gray-600 mb-4" />
          <p className="text-sm text-gray-600 text-center">
            Loading moral dilemma
          </p>
        </CardContent>
      </Card>
    );
  }

  // Show loading state with message for "No active question found" error
  if (error === "NO_QUESTIONS_AVAILABLE") {
    return (
      <Card className="border-0 shadow-2xl bg-white/95 backdrop-blur-sm h-full">
        <CardContent className="flex flex-col items-center justify-center py-12 px-6">
          <Loader2 className="w-6 h-6 animate-spin text-gray-600 mb-4" />
          <p className="text-sm text-gray-600 text-center">
            New morality questions are being loaded into the game, this make
            some time. But you can still login/register to play
          </p>
        </CardContent>
      </Card>
    );
  }

  if (error || !question) {
    return null;
  }

  return (
    <div className="w-full max-w-md ml-auto px-4 sm:px-0">
      <Card className="border-0 shadow-2xl bg-white/95 backdrop-blur-sm">
        <CardContent className="pt-4 px-4 sm:px-6">
          <QuestionDisplay
            question={question}
            disabled={true}
            showTitle={true}
          />
          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-center text-sm font-medium text-gray-700">
              What would you do? login/register and privately share your moral
              judgement...
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
