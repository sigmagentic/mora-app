"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, ShieldCheck, Trophy } from "lucide-react";

type PastResultItem = {
  question_id: number;
  epoch_id: string;
  img: string | null;
  title: string | null;
  text: string;
  total_responses: number;
  answer_a_text: string;
  answer_b_text: string;
  answer_a_count: number;
  answer_b_count: number;
  winning_answer: number;
  finalized_at: string;
  arcium_poll_id: number | null;
};

const PREVIEW_LINES = 2;

function ResultRow({ item }: { item: PastResultItem }) {
  const [expanded, setExpanded] = useState(false);
  const lines = item.text.split(/\n/).filter(Boolean);
  const preview = lines.slice(0, PREVIEW_LINES).join("\n");
  const hasMore = lines.length > PREVIEW_LINES;

  const isArcium = item.arcium_poll_id != null;

  return (
    <Card
      className={`overflow-hidden shadow-sm transition hover:shadow-md ${
        isArcium
          ? "border-violet-200/90 bg-gradient-to-br from-violet-50/80 to-white dark:from-violet-950/30 dark:to-gray-900"
          : "border border-gray-200/80 bg-white/95"
      }`}
    >
      <div className="flex flex-col sm:flex-row gap-4 p-4 sm:p-5">
        {/* Thumbnail */}
        <div className="shrink-0">
          {item.img ? (
            <img
              src={item.img}
              alt=""
              className="h-24 w-full sm:h-28 sm:w-36 rounded-lg object-cover border border-gray-100 grayscale"
            />
          ) : (
            <div className="h-24 w-full sm:h-28 sm:w-36 rounded-lg bg-gray-100 border border-gray-100 flex items-center justify-center text-gray-400 text-xs">
              No image
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          {/* Title */}
          <h3 className="font-semibold text-gray-900 text-sm sm:text-base leading-tight flex items-center gap-2 flex-wrap">
            {item.title ?? "Untitled question"}
            {isArcium && (
              <Badge
                variant="secondary"
                className="bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800 text-[10px] font-semibold"
              >
                ✨ Arcium
              </Badge>
            )}
          </h3>

          {/* Question text preview / full */}
          <div className="text-gray-600 text-xs sm:text-sm leading-relaxed">
            {expanded ? (
              <p className="whitespace-pre-wrap">{item.text}</p>
            ) : (
              <p className="whitespace-pre-wrap line-clamp-2 sm:line-clamp-none">
                {preview}
                {hasMore && lines.length > PREVIEW_LINES && "…"}
              </p>
            )}
            {hasMore && (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="mt-1 inline-flex items-center gap-0.5 text-gray-600 hover:text-gray-700 font-medium text-xs"
              >
                {expanded ? (
                  <>
                    View less <ChevronUp className="h-3.5 w-3.5" />
                  </>
                ) : (
                  <>
                    View more <ChevronDown className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            )}
          </div>

          {/* Total responses */}
          <p className="text-xs text-gray-500">
            <span className="font-medium text-gray-700">
              {item.total_responses}
            </span>{" "}
            total responses
          </p>

          {/* Answer options with counts and winner */}
          <div className="flex flex-col gap-2 pt-1">
            <div
              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs sm:text-sm ${
                item.winning_answer === 0
                  ? "border-emerald-200 bg-emerald-50/80"
                  : "border-gray-100 bg-gray-50/80"
              }`}
            >
              <span className="text-gray-700 flex-1 min-w-0 truncate">
                {item.answer_a_text}
              </span>
              <span className="shrink-0 font-medium text-gray-900">
                {item.answer_a_count}
              </span>
              {item.winning_answer === 0 && (
                <Badge
                  variant="secondary"
                  className="shrink-0 ml-1 bg-amber-100 text-amber-800 border-amber-200 text-[10px] font-semibold"
                >
                  <Trophy className="h-3 w-3 mr-0.5 inline" />
                  Winner
                </Badge>
              )}
            </div>
            <div
              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs sm:text-sm ${
                item.winning_answer === 1
                  ? "border-emerald-200 bg-emerald-50/80"
                  : "border-gray-100 bg-gray-50/80"
              }`}
            >
              <span className="text-gray-700 flex-1 min-w-0 truncate">
                {item.answer_b_text}
              </span>
              <span className="shrink-0 font-medium text-gray-900">
                {item.answer_b_count}
              </span>
              {item.winning_answer === 1 && (
                <Badge
                  variant="secondary"
                  className="shrink-0 ml-1 bg-amber-100 text-amber-800 border-amber-200 text-[10px] font-semibold"
                >
                  <Trophy className="h-3 w-3 mr-0.5 inline" />
                  Winner
                </Badge>
              )}
            </div>
          </div>

          {isArcium && (
            <div className="inline-flex items-center gap-1.5 text-xs bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 p-1.5 rounded-md font-semibold px-2.5 border border-violet-200/80 dark:border-violet-800/60">
              <ShieldCheck className="h-3.5 w-3.5" />
              Verify Result with Arcium{" "}
              <span className="text-violet-500 dark:text-violet-400 font-normal">
                (offline)
              </span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export function PastResults() {
  const [items, setItems] = useState<PastResultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/private-data-game/past-results/get-past-results")
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-500 border-t-transparent" />
        <p className="mt-3 text-sm text-gray-500">loading results</p>
      </div>
    );
  }

  if (error) {
    return <p className="py-6 text-center text-sm text-red-600">{error}</p>;
  }

  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-500">no results yet.</p>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <ResultRow key={`${item.question_id}-${item.epoch_id}`} item={item} />
      ))}
    </div>
  );
}
