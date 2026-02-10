"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Trophy, RotateCcw } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type ResolvedItem = {
  questionId: number;
  epochId: string;
  title: string | null;
  img: string | null;
  text: string;
  resolutionType: "FINALIZED" | "DEACTIVATE";
  winningAnswer: number | null;
  answerAText: string;
  answerBText: string;
  totalXpAnswer0: number;
  totalXpAnswer1: number;
  myBets: { answer0: number; answer1: number };
  myClaimed: number | null;
  myRefundable: number;
  myWinnings: number | null;
  canClaim: boolean;
};

const PREVIEW_CHARS = 120;

function ResolvedRow({
  item,
  onClaimSuccess,
}: {
  item: ResolvedItem;
  onClaimSuccess: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const hasMore = item.text.length > PREVIEW_CHARS;
  const preview = hasMore
    ? item.text.slice(0, PREVIEW_CHARS).trim() + "…"
    : item.text;

  const handleClaim = async () => {
    if (!item.canClaim) return;
    setClaiming(true);
    try {
      const res = await fetch("/api/private-data-game/bet/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: item.questionId,
          epochId: item.epochId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          title: "Error",
          description: data.error || "Failed to claim",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Claimed!",
        description: `${data.xpClaimed} XP added to your balance.`,
      });
      onClaimSuccess();
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to claim",
        variant: "destructive",
      });
    } finally {
      setClaiming(false);
    }
  };

  const participated = item.myBets.answer0 > 0 || item.myBets.answer1 > 0;
  const isRefund = item.resolutionType === "DEACTIVATE";

  const a0 = item.myBets.answer0;
  const a1 = item.myBets.answer1;
  const betParts: string[] = [];
  if (a0 > 0) betParts.push(`${a0} XP on "answer 1" }`);
  if (a1 > 0) betParts.push(`${a1} XP on "answer 2"}`);
  const betSummary =
    betParts.length > 0 ? `You bet ${betParts.join(" and ")}.` : "";

  const totalStaked = a0 + a1;
  const winningStake =
    item.winningAnswer === 0 ? a0 : item.winningAnswer === 1 ? a1 : 0;
  const outcomeSummary = (() => {
    if (isRefund) {
      return totalStaked > 0
        ? `The market was cancelled. You get a refund of ${item.myRefundable} XP.`
        : "";
    }
    if (item.myClaimed != null) {
      return `You won the bet and received your stake plus winnings (${item.myClaimed} XP claimed).`;
    }
    if (item.canClaim && item.myWinnings != null) {
      const winnings = item.myWinnings - winningStake;
      return `You won the bet so you get back your stake of ${winningStake} XP plus ${winnings} XP (your share of winnings).`;
    }
    if (totalStaked > 0 && item.winningAnswer != null) {
      return `You lost the bet so you lose all your XP (${totalStaked} XP in total).`;
    }
    return "";
  })();

  return (
    <Card className="overflow-hidden border-gray-200/80 bg-white/95">
      <div className="flex flex-col sm:flex-row gap-4 p-4 sm:p-5">
        <div className="shrink-0">
          {item.img ? (
            <img
              src={item.img}
              alt=""
              className="h-20 w-full sm:h-24 sm:w-28 rounded-lg object-cover border border-gray-100 grayscale"
            />
          ) : (
            <div className="h-20 w-full sm:h-24 sm:w-28 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-xs">
              No image
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <h3 className="font-semibold text-gray-900 text-sm">
            {item.title ?? "Resolved question"}
          </h3>
          <div className="text-gray-600 text-xs leading-relaxed">
            {expanded ? (
              <p className="whitespace-pre-wrap">{item.text}</p>
            ) : (
              <p className="whitespace-pre-wrap">{preview}</p>
            )}
            {hasMore && (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="mt-1 inline-flex items-center gap-0.5 text-gray-600 hover:text-gray-700 font-medium"
              >
                {expanded ? (
                  <>
                    View less <ChevronUp className="h-3 w-3" />
                  </>
                ) : (
                  <>
                    View more <ChevronDown className="h-3 w-3" />
                  </>
                )}
              </button>
            )}
          </div>

          <div className="text-[9px] text-gray-700 bg-gray-100 p-2 rounded-md">
            {participated ? (
              betSummary ? (
                <p>
                  ℹ️{` `}
                  {betSummary}
                  {outcomeSummary && ` ${outcomeSummary}`}
                </p>
              ) : null
            ) : (
              <p>ℹ️ You did not bet on this</p>
            )}
          </div>

          {isRefund ? (
            <Badge
              variant="secondary"
              className="bg-amber-100 text-amber-800 border-amber-200"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Market cancelled – refund available
            </Badge>
          ) : (
            <div className="flex flex-wrap gap-2">
              <div
                className={`flex items-center gap-1 rounded border px-2 py-0.5 text-xs ${
                  item.winningAnswer === 0
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-gray-100 bg-gray-50"
                }`}
              >
                <span className="text-gray-500 shrink-0">Answer 1:</span>
                <span className="text-gray-700 truncate max-w-[140px]">
                  {item.answerAText}
                </span>
                <span className="font-medium">{item.totalXpAnswer0} XP</span>
                {item.winningAnswer === 0 && (
                  <Trophy className="h-3 w-3 text-amber-600" />
                )}
              </div>
              <div
                className={`flex items-center gap-1 rounded border px-2 py-0.5 text-xs ${
                  item.winningAnswer === 1
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-gray-100 bg-gray-50"
                }`}
              >
                <span className="text-gray-500 shrink-0">Answer 2:</span>
                <span className="text-gray-700 truncate max-w-[140px]">
                  {item.answerBText}
                </span>
                <span className="font-medium">{item.totalXpAnswer1} XP</span>
                {item.winningAnswer === 1 && (
                  <Trophy className="h-3 w-3 text-amber-600" />
                )}
              </div>
            </div>
          )}

          {participated && (
            <div className="pt-1 flex flex-wrap items-center gap-2">
              {item.myClaimed != null ? (
                <span className="text-sm text-gray-600">
                  Claimed {item.myClaimed} XP
                </span>
              ) : item.canClaim ? (
                <>
                  {isRefund ? (
                    <span className="text-sm text-gray-600">
                      Refund: {item.myRefundable} XP
                    </span>
                  ) : (
                    <span className="text-sm text-gray-600">
                      You won {item.myWinnings ?? 0} XP
                    </span>
                  )}
                  <Button size="sm" onClick={handleClaim} disabled={claiming}>
                    {claiming ? "Claiming…" : "Claim"}
                  </Button>
                </>
              ) : (
                !isRefund && (
                  <span className="text-sm text-gray-500">
                    You lost this bet
                  </span>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export function ResolvedBets({
  resolved,
  onClaimSuccess,
}: {
  resolved: unknown[];
  onClaimSuccess: () => void;
}) {
  const items = resolved as ResolvedItem[];
  if (items.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-900 text-sm">Resolved Bets</h3>
      <div className="space-y-3">
        {items.map((item) => (
          <ResolvedRow
            key={`${item.questionId}-${item.epochId}`}
            item={item}
            onClaimSuccess={onClaimSuccess}
          />
        ))}
      </div>
    </div>
  );
}
