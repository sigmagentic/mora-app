"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type MarketAnswer = { id: number; text: string; answerBit: 0 | 1 };

type MarketData = {
  id: number;
  title: string | null;
  img: string | null;
  text: string;
  epochId: string;
  closesAt: string | null;
  bettingEndsAt: string | null;
  answers: MarketAnswer[];
  totalXpAnswer0: number;
  totalXpAnswer1: number;
  myBets: { answer0: number; answer1: number };
  userTotalXp: number;
};

const PREVIEW_CHARS = 180;

function Countdown({ endsAt }: { endsAt: string | null }) {
  const [remaining, setRemaining] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!endsAt) {
      setRemaining(null);
      return;
    }
    const s = String(endsAt).trim();
    const normalized = s.includes("T") ? s : s.replace(" ", "T");
    const end = new Date(
      normalized.endsWith("Z") ? normalized : normalized + "Z"
    ).getTime();
    const update = () => {
      const now = Date.now();
      if (now >= end) {
        setExpired(true);
        setRemaining("Betting closed");
        return;
      }
      const diff = end - now;
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${m}m ${s}s`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  if (!remaining) return null;
  return (
    <span
      className={`text-sm font-medium ${
        expired ? "text-amber-600" : "text-gray-700"
      }`}
    >
      {remaining}
    </span>
  );
}

export function ActiveBetMarket({
  market,
  onPlaceSuccess,
}: {
  market: MarketData;
  onPlaceSuccess: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [betAmount0, setBetAmount0] = useState("");
  const [betAmount1, setBetAmount1] = useState("");
  const [loading, setLoading] = useState(false);
  const [localMarket, setLocalMarket] = useState(market);

  useEffect(() => {
    setLocalMarket(market);
  }, [market]);

  const hasMore = market.text.length > PREVIEW_CHARS;
  const preview = hasMore
    ? market.text.slice(0, PREVIEW_CHARS).trim() + "…"
    : market.text;

  const totalPool = localMarket.totalXpAnswer0 + localMarket.totalXpAnswer1;
  const pct0 =
    totalPool > 0
      ? Math.round((localMarket.totalXpAnswer0 / totalPool) * 100)
      : 50;
  const pct1 =
    totalPool > 0
      ? Math.round((localMarket.totalXpAnswer1 / totalPool) * 100)
      : 50;

  const bettingEndsAtStr = market.bettingEndsAt
    ? market.bettingEndsAt.includes("T")
      ? market.bettingEndsAt
      : market.bettingEndsAt.replace(" ", "T")
    : "";
  const bettingEnded =
    bettingEndsAtStr &&
    Date.now() >=
      new Date(
        bettingEndsAtStr.endsWith("Z")
          ? bettingEndsAtStr
          : bettingEndsAtStr + "Z"
      ).getTime();
  const availableXp =
    localMarket.userTotalXp -
    localMarket.myBets.answer0 -
    localMarket.myBets.answer1;

  const placeBet = async (answerBit: 0 | 1, xpAmount: number) => {
    if (xpAmount <= 0 || bettingEnded) return;
    if (xpAmount > availableXp) {
      toast({
        title: "Insufficient XP",
        description: `You have ${availableXp} XP available to bet.`,
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/private-data-game/bet/place", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: market.id,
          epochId: market.epochId,
          answerBit,
          xpAmount,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          title: "Error",
          description: data.error || "Failed to place bet",
          variant: "destructive",
        });
        return;
      }
      if (data.market) {
        setLocalMarket({
          ...localMarket,
          ...data.market,
        });
      }
      setBetAmount0("");
      setBetAmount1("");
      toast({
        title: "Bet placed",
        description: `${xpAmount} XP on answer ${answerBit + 1}`,
      });
      onPlaceSuccess();
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to place bet",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const removeBet = async (answerBit: 0 | 1, xpAmount: number) => {
    if (xpAmount <= 0 || bettingEnded) return;
    const current =
      answerBit === 0 ? localMarket.myBets.answer0 : localMarket.myBets.answer1;
    const toRemove = Math.min(xpAmount, current);
    if (toRemove <= 0) return;
    setLoading(true);
    try {
      const res = await fetch("/api/private-data-game/bet/place", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: market.id,
          epochId: market.epochId,
          answerBit,
          xpAmount: -toRemove,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          title: "Error",
          description: data.error || "Failed to remove bet",
          variant: "destructive",
        });
        return;
      }
      if (data.market) {
        setLocalMarket({
          ...localMarket,
          ...data.market,
        });
      }
      setBetAmount0("");
      setBetAmount1("");
      toast({ title: "Bet removed", description: `${toRemove} XP withdrawn` });
      onPlaceSuccess();
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to remove bet",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const disabled = bettingEnded || loading || localMarket.userTotalXp <= 0;

  return (
    <Card className="overflow-hidden border-violet-200/90 bg-gradient-to-br from-violet-50/80 to-white dark:from-violet-950/30 dark:to-gray-900">
      <div className="flex flex-col sm:flex-row gap-4 p-4 sm:p-5">
        <div className="shrink-0">
          {market.img ? (
            <img
              src={market.img}
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
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 text-sm sm:text-base">
              {market.title ?? "Daily Arcium Question"}
            </h3>
            <Badge className="bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 border-violet-200">
              ✨ Arcium
            </Badge>
          </div>

          <div className="text-gray-600 text-xs sm:text-sm leading-relaxed">
            {expanded ? (
              <p className="whitespace-pre-wrap">{market.text}</p>
            ) : (
              <p className="whitespace-pre-wrap">{preview}</p>
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

          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Your XP: {localMarket.userTotalXp}</span>
            <span>Available to bet: {availableXp}</span>
            <Countdown endsAt={market.bettingEndsAt} />
          </div>

          {totalPool > 0 && (
            <p className="text-xs text-gray-600">
              Implied odds: Answer 1{" "}
              <span className="font-medium">{pct0}%</span> | Answer 2{" "}
              <span className="font-medium">{pct1}%</span>
            </p>
          )}

          {market.answers.map((ans, idx) => {
            const total =
              idx === 0
                ? localMarket.totalXpAnswer0
                : localMarket.totalXpAnswer1;
            const myBet =
              idx === 0
                ? localMarket.myBets.answer0
                : localMarket.myBets.answer1;
            const answerBit = idx as 0 | 1;
            const betAmount = idx === 0 ? betAmount0 : betAmount1;
            const setBetAmount = idx === 0 ? setBetAmount0 : setBetAmount1;
            const amt = parseInt(betAmount, 10) || 0;
            return (
              <div
                key={ans.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-gray-700">{ans.text}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Total: {total} XP {myBet > 0 && `• Your bet: ${myBet} XP`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Input
                    type="number"
                    min={1}
                    max={availableXp}
                    placeholder="XP"
                    value={betAmount}
                    onChange={(e) =>
                      setBetAmount(e.target.value.replace(/\D/g, ""))
                    }
                    disabled={disabled}
                    className="w-20 h-8 text-sm"
                  />
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => placeBet(answerBit, amt)}
                    disabled={disabled || amt <= 0}
                  >
                    Bet
                  </Button>
                  {myBet > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        removeBet(
                          answerBit,
                          amt > 0 ? Math.min(amt, myBet) : myBet
                        )
                      }
                      disabled={disabled || loading}
                    >
                      Remove {amt > 0 ? Math.min(amt, myBet) : myBet}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {localMarket.userTotalXp <= 0 && (
            <p className="text-xs text-amber-600">
              Earn XP by answering questions to bet.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
