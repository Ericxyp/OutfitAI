"use client";

import { useEffect, useState } from "react";
import {
  confirmRecommendationWorn,
  getWearConfirmation,
} from "@/lib/actions/recommendation-effects";

export function WearConfirmationButton({
  recommendationId,
}: {
  recommendationId: string;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getWearConfirmation(recommendationId).then((value) => {
      setConfirmed(value);
      setLoaded(true);
    });
  }, [recommendationId]);

  const handleConfirm = async () => {
    if (confirmed || pending) return;

    setPending(true);
    setError(null);

    const result = await confirmRecommendationWorn(recommendationId);
    setPending(false);

    if (result.success) {
      setConfirmed(true);
      return;
    }

    setError(result.error);
  };

  if (!loaded) {
    return (
      <div className="border-t border-border/50 p-3">
        <div className="h-10 animate-pulse rounded-xl bg-accent" />
      </div>
    );
  }

  return (
    <div className="border-t border-border/50 p-3">
      <button
        type="button"
        aria-label={confirmed ? "已确认穿着这套搭配" : "确认今天穿了这套搭配"}
        disabled={confirmed || pending}
        onClick={handleConfirm}
        className={`w-full rounded-xl py-2.5 text-sm transition-all disabled:opacity-70 ${
          confirmed
            ? "bg-foreground/10 font-medium text-foreground ring-1 ring-foreground/15"
            : "bg-accent text-foreground hover:opacity-80"
        }`}
      >
        {pending ? "确认中…" : confirmed ? "已确认穿着" : "今天穿了这套"}
      </button>
      {error && (
        <p className="mt-2 text-center text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
