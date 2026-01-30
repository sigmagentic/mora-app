"use client";

import { useState, useEffect } from "react";
import { GameQuestion } from "@/types/types";
import { QuestionDisplay } from "./QuestionDisplay";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function QuestionPreview() {
  const [question, setQuestion] = useState<GameQuestion | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSampleQuestion = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const res = await fetch(
          "/api/private-data-game/get-active-question?give_sample_question=1",
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
      } catch (err: any) {
        console.error("Error fetching sample question:", err);
        setError(err.message || "Failed to load question");
      } finally {
        setIsLoading(false);
      }
    };

    fetchSampleQuestion();
  }, []);

  if (isLoading) {
    return (
      <Card className="border-0 shadow-2xl bg-white/95 backdrop-blur-sm h-full">
        <CardContent className="flex flex-col items-center justify-center py-12 px-6">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600 mb-4" />
          <p className="text-sm text-gray-600 text-center">
            Loading sample question...
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
          <Loader2 className="w-6 h-6 animate-spin text-blue-600 mb-4" />
          <p className="text-sm text-gray-600 text-center">
            New morality questions are being loaded into the game, this make
            some time. But you can still login/register to play
          </p>
        </CardContent>
      </Card>
    );
  }

  if (error || !question) {
    // Silently fail - don't show error to user, just don't render the preview
    return null;
  }

  return (
    <Card className="border-0 shadow-2xl bg-white/95 backdrop-blur-sm h-full">
      <CardHeader className="text-center pb-2 px-4 sm:px-6"></CardHeader>
      <CardContent className="px-4 sm:px-6 pb-6">
        <QuestionDisplay question={question} disabled={true} showTitle={true} />
        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-center text-sm font-medium text-gray-700">
            What would you do? login/register and privately share your moral
            judgement...
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
