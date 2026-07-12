"use client";

import { useEffect, useState } from "react";
import { PAGE_COPY } from "@/lib/constants";
import {
  getFeedbackReasonTags,
} from "@/lib/feedback/reason-tags";
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

const MAX_SELECTED_REASON_TAGS = 3;

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
  const [reasonPanelOpen, setReasonPanelOpen] = useState(false);
  const [selectedReasonTags, setSelectedReasonTags] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getFeedbackRating(recommendationId).then((rating) => {
      setCurrentRating(rating);
      setLoaded(true);
    });
  }, [recommendationId]);

  const submitRating = async (
    rating: FeedbackRating,
    reasonTags: string[] = []
  ) => {
    setPendingRating(rating);
    const result = await submitFeedback(recommendationId, rating, {
      reasonTags,
    });
    setPendingRating(null);
    setReasonPanelOpen(false);
    setSelectedReasonTags([]);

    if (result.success) {
      setCurrentRating(result.rating);
    }
  };

  const handleClick = async (rating: FeedbackRating) => {
    if (rating === "dislike") {
      setReasonPanelOpen(true);
      setSelectedReasonTags([]);
      return;
    }

    await submitRating(rating);
  };

  const toggleReasonTag = (tag: string) => {
    setSelectedReasonTags((current) => {
      if (current.includes(tag)) {
        return current.filter((value) => value !== tag);
      }

      if (current.length >= MAX_SELECTED_REASON_TAGS) {
        return current;
      }

      return [...current, tag];
    });
  };

  const handleReasonSubmit = async () => {
    await submitRating("dislike", selectedReasonTags);
  };

  const handleReasonSkip = async () => {
    await submitRating("dislike");
  };

  if (!loaded) {
    return (
      <div className="border-t border-border/50 p-3">
        <div className="grid grid-cols-3 gap-2">
          {BUTTONS.map((btn) => (
            <div
              key={btn.rating}
              className="h-10 animate-pulse rounded-xl bg-accent"
            />
          ))}
        </div>
      </div>
    );
  }

  const reasonTags = getFeedbackReasonTags("dislike");

  return (
    <div className="border-t border-border/50 p-3">
      <div className="grid grid-cols-3 gap-2">
        {BUTTONS.map((btn) => {
          const isActive = currentRating === btn.rating;
          const isPending = pendingRating === btn.rating;
          const isReasonPending =
            btn.rating === "dislike" && reasonPanelOpen && !pendingRating;

          return (
            <button
              key={btn.rating}
              type="button"
              disabled={!!pendingRating}
              onClick={() => handleClick(btn.rating)}
              className={`rounded-xl py-2.5 text-xs sm:text-sm transition-all disabled:opacity-60 ${
                isActive || isReasonPending
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

      {reasonPanelOpen && (
        <div className="mt-2.5 rounded-xl bg-accent/60 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted">为什么？</p>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                disabled={!!pendingRating}
                onClick={handleReasonSkip}
                className="text-xs text-muted transition-opacity hover:opacity-80 disabled:opacity-60"
              >
                跳过
              </button>
              <button
                type="button"
                disabled={!!pendingRating}
                onClick={handleReasonSubmit}
                className="rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {pendingRating === "dislike" ? "…" : "提交"}
              </button>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {reasonTags.map((tag) => {
              const selected = selectedReasonTags.includes(tag);

              return (
                <button
                  key={tag}
                  type="button"
                  disabled={
                    !!pendingRating ||
                    (!selected &&
                      selectedReasonTags.length >= MAX_SELECTED_REASON_TAGS)
                  }
                  onClick={() => toggleReasonTag(tag)}
                  className={`rounded-full px-2.5 py-1 text-xs transition-all disabled:opacity-50 ${
                    selected
                      ? "bg-foreground text-background"
                      : "bg-background text-foreground ring-1 ring-border/60"
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
