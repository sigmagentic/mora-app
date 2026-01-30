"use client";

import { GameQuestion, GameQuestionAnswer } from "@/types/types";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface QuestionDisplayProps {
  question: GameQuestion;
  selectedAnswer?: GameQuestionAnswer | null;
  onAnswerChange?: (answer: GameQuestionAnswer) => void;
  disabled?: boolean;
  showTitle?: boolean;
}

export function QuestionDisplay({
  question,
  selectedAnswer,
  onAnswerChange,
  disabled = false,
  showTitle = false,
}: QuestionDisplayProps) {
  return (
    <div className="question-view-container space-y-4">
      {showTitle && question.title && (
        <h2 className="text-xl font-bold text-gray-900">{question.title}</h2>
      )}
      {question.img && (
        <img
          src={question.img}
          alt={question.title || "Question"}
          className="w-full rounded-lg grayscale"
        />
      )}
      <p className="text-sm text-gray-700 leading-relaxed">{question.text}</p>
      <RadioGroup
        value={selectedAnswer?.id.toString() || ""}
        onValueChange={(value) => {
          if (!disabled && onAnswerChange) {
            const answer = question.answers.find(
              (a) => a.id.toString() === value,
            );

            // the index of the answer becomes the answer bit (0 or 1)
            const answerIndex = question.answers.findIndex(
              (a) => a.id === answer?.id,
            );

            if (answer && answerIndex !== -1) {
              onAnswerChange({ ...answer, index: answerIndex });
            }
          }
        }}
        disabled={disabled}
      >
        {question.answers.map((answer) => (
          <div key={answer.id} className="flex items-center space-x-2 mt-2">
            <RadioGroupItem
              value={answer.id.toString()}
              id={answer.id.toString()}
              disabled={disabled}
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
    </div>
  );
}
