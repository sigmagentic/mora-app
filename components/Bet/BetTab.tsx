"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { ActiveBetMarket } from "@/components/Bet/ActiveBetMarket";
import { ResolvedBets } from "@/components/Bet/ResolvedBets";

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

export function BetTab({ onRefreshUser }: { onRefreshUser?: () => void }) {
  const [market, setMarket] = useState<MarketData | null>(null);
  const [resolved, setResolved] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [marketRes, resolvedRes] = await Promise.all([
        fetch("/api/private-data-game/bet/market"),
        fetch("/api/private-data-game/bet/resolved"),
      ]);

      if (!marketRes.ok)
        throw new Error(marketRes.statusText || "Failed to load market");
      if (!resolvedRes.ok)
        throw new Error(resolvedRes.statusText || "Failed to load resolved");

      const marketJson = await marketRes.json();
      const resolvedJson = await resolvedRes.json();

      if (marketJson.error) throw new Error(marketJson.error);
      if (resolvedJson.error) throw new Error(resolvedJson.error);

      setMarket(marketJson.market ?? null);
      setResolved(resolvedJson.resolved ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePlaceSuccess = useCallback(() => {
    fetchData();
    onRefreshUser?.();
  }, [fetchData, onRefreshUser]);

  const handleClaimSuccess = useCallback(() => {
    fetchData();
    onRefreshUser?.();
  }, [fetchData, onRefreshUser]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-500 border-t-transparent" />
        <p className="mt-3 text-sm text-gray-500">loading bets</p>
      </div>
    );
  }

  if (error) {
    return <p className="py-6 text-center text-sm text-red-600">{error}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={fetchData}
          className="shrink-0"
        >
          <RefreshCw className="h-4 w-4 mr-1" />
          Update data
        </Button>
      </div>

      {market ? (
        <ActiveBetMarket market={market} onPlaceSuccess={handlePlaceSuccess} />
      ) : (
        <div className="py-8 text-center text-sm text-gray-500 rounded-lg border border-dashed border-gray-200 bg-gray-50/50">
          No active bet right now. Check back when the daily Arcium question is
          live.
        </div>
      )}

      <ResolvedBets resolved={resolved} onClaimSuccess={handleClaimSuccess} />
    </div>
  );
}
