"use client";

import { useEffect, useState } from "react";
import {
  getRecommendationScore,
  submitRecommendationScore,
} from "@/lib/actions/recommendation-effects";

const SCORE_OPTIONS = [1, 2, 3, 4, 5] as const;

export function RecommendationRating({
  recommendationId,
}: {
  recommendationId: string;
}) {
  const [currentRating, setCurrentRating] = useState<number | null>(null);
  const [pendingRating, setPendingRating] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    getRecommendationScore(recommendationId).then((rating) => {
      setCurrentRating(rating);
      setLoaded(true);
    });
  }, [recommendationId]);

  const handleSelect = async (rating: number) => {
    if (pendingRating !== null) return;

    setPendingRating(rating);
    setError(null);
    setSavedMessage(null);

    const result = await submitRecommendationScore(recommendationId, rating);
    setPendingRating(null);

    if (result.success) {
      setCurrentRating(result.rating);
      setSavedMessage(result.updated ? "评分已更新" : "感谢评分");
      return;
    }

    setError(result.error);
  };

  if (!loaded) {
    return (
      <div className="border-t border-border/50 px-4 py-3">
        <div className="h-8 animate-pulse rounded-xl bg-accent" />
      </div>
    );
  }

  return (
    <div className="border-t border-border/50 px-4 py-3">
      <p className="text-xs text-muted">这套搭配适合你的需求吗？</p>
      <div className="mt-2 flex gap-2">
        {SCORE_OPTIONS.map((score) => {
          const isActive = currentRating === score;
          const isPending = pendingRating === score;

          return (
            <button
              key={score}
              type="button"
              aria-label={`评分 ${score} 分`}
              disabled={pendingRating !== null}
              onClick={() => handleSelect(score)}
              className={`flex-1 rounded-xl py-2 text-sm transition-all disabled:opacity-60 ${
                isActive
                  ? "bg-foreground font-medium text-background"
                  : "bg-accent text-foreground hover:opacity-80"
              }`}
            >
              {isPending ? "…" : score}
            </button>
          );
        })}
      </div>
      {savedMessage && (
        <p className="mt-2 text-center text-xs text-muted">{savedMessage}</p>
      )}
      {error && (
        <p className="mt-2 text-center text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
