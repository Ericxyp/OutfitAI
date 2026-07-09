"use client";

import { useEffect, useState } from "react";
import { PAGE_COPY } from "@/lib/constants";
import {
  getFeedbackRating,
  submitFeedback,
} from "@/lib/actions/feedback";
import type { FeedbackRating } from "@/types/database";

const BUTTONS: {
  rating: FeedbackRating;
  label: string;
  activeLabel: string;
}[] = [
  { rating: "like", label: PAGE_COPY.feedback.like, activeLabel: PAGE_COPY.feedback.liked },
  { rating: "dislike", label: PAGE_COPY.feedback.dislike, activeLabel: PAGE_COPY.feedback.disliked },
  { rating: "save", label: PAGE_COPY.feedback.save, activeLabel: PAGE_COPY.feedback.saved },
];

export function FeedbackButtons({
  recommendationId,
}: {
  recommendationId: string;
}) {
  const [currentRating, setCurrentRating] = useState<FeedbackRating | null>(
    null
  );
  const [pendingRating, setPendingRating] = useState<FeedbackRating | null>(
    null
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getFeedbackRating(recommendationId).then((rating) => {
      setCurrentRating(rating);
      setLoaded(true);
    });
  }, [recommendationId]);

  const handleClick = async (rating: FeedbackRating) => {
    setPendingRating(rating);
    const result = await submitFeedback(recommendationId, rating);
    setPendingRating(null);

    if (result.success) {
      setCurrentRating(result.rating);
    }
  };

  if (!loaded) {
    return (
      <div className="grid grid-cols-3 gap-2 border-t border-border/50 p-3">
        {BUTTONS.map((btn) => (
          <div
            key={btn.rating}
            className="h-10 animate-pulse rounded-xl bg-accent"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2 border-t border-border/50 p-3">
      {BUTTONS.map((btn) => {
        const isActive = currentRating === btn.rating;
        const isPending = pendingRating === btn.rating;

        return (
          <button
            key={btn.rating}
            type="button"
            disabled={!!pendingRating}
            onClick={() => handleClick(btn.rating)}
            className={`rounded-xl py-2.5 text-xs sm:text-sm transition-all disabled:opacity-60 ${
              isActive
                ? btn.rating === "save"
                  ? "bg-foreground font-medium text-background"
                  : btn.rating === "like"
                    ? "bg-foreground/10 font-medium text-foreground ring-1 ring-foreground/15"
                    : "bg-red-50 font-medium text-red-600 ring-1 ring-red-100"
                : "bg-accent text-foreground hover:opacity-80"
            }`}
          >
            {isPending ? "…" : isActive ? btn.activeLabel : btn.label}
          </button>
        );
      })}
    </div>
  );
}
