import { createClient } from "@/lib/supabase/server";
import { trackEvent } from "@/lib/analytics/track-event";
import {
  applyFeedbackReasonEffects,
  type RecommendationSignals,
  type StyleProfileArrays,
} from "@/lib/memory/feedback-reason-effects";
import type { FeedbackRating } from "@/types/database";

function collectNonEmptyStrings(values: (string | null | undefined)[]): string[] {
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function updateStyleProfileFromFeedback(input: {
  userId: string;
  recommendationId: string;
  rating: FeedbackRating;
  reasonTags?: string[];
}): Promise<void> {
  const { userId, recommendationId, rating } = input;
  const reasonTags = input.reasonTags ?? [];

  try {
    const supabase = await createClient();

    const { data: recommendation, error: recommendationError } = await supabase
      .from("outfit_recommendations")
      .select("id, selected_item_ids, style_tags, occasion")
      .eq("id", recommendationId)
      .eq("user_id", userId)
      .single();

    if (recommendationError || !recommendation) {
      console.error("[styleProfile] recommendation not found for feedback update");
      return;
    }

    const selectedItemIds = recommendation.selected_item_ids ?? [];

    let closetItems: {
      id: string;
      color: string | null;
      style_tags: string[];
      occasion_tags: string[];
    }[] = [];

    if (selectedItemIds.length > 0) {
      const { data } = await supabase
        .from("closet_items")
        .select("id, color, style_tags, occasion_tags")
        .eq("user_id", userId)
        .in("id", selectedItemIds);

      closetItems = data ?? [];
    }

    const itemStyles = closetItems.flatMap((item) => item.style_tags);
    const itemColors = collectNonEmptyStrings(
      closetItems.map((item) => item.color)
    );
    const itemOccasions = closetItems.flatMap((item) => item.occasion_tags);

    const signals: RecommendationSignals = {
      styles: [
        ...new Set([
          ...(recommendation.style_tags ?? []),
          ...itemStyles,
        ]),
      ],
      colors: [...new Set(itemColors)],
      occasions: [
        ...new Set([
          ...collectNonEmptyStrings([recommendation.occasion]),
          ...itemOccasions,
        ]),
      ],
      selectedItemIds,
    };

    const { data: existing } = await supabase
      .from("user_style_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    const existingArrays: StyleProfileArrays = {
      preferredStyles: existing?.preferred_styles ?? [],
      preferredColors: existing?.preferred_colors ?? [],
      preferredOccasions: existing?.preferred_occasions ?? [],
      avoidStyles: existing?.avoid_styles ?? [],
      avoidColors: existing?.avoid_colors ?? [],
      favoriteItemIds: existing?.favorite_item_ids ?? [],
      dislikedItemIds: existing?.disliked_item_ids ?? [],
    };

    const adjusted = applyFeedbackReasonEffects({
      rating,
      reasonTags,
      signals,
      existing: existingArrays,
    });

    const nextProfile = {
      user_id: userId,
      preferred_styles: adjusted.preferredStyles,
      preferred_colors: adjusted.preferredColors,
      preferred_occasions: adjusted.preferredOccasions,
      avoid_styles: adjusted.avoidStyles,
      avoid_colors: adjusted.avoidColors,
      favorite_item_ids: adjusted.favoriteItemIds,
      disliked_item_ids: adjusted.dislikedItemIds,
      style_summary: existing?.style_summary ?? null,
      feedback_count: (existing?.feedback_count ?? 0) + 1,
    };

    const { error: upsertError } = await supabase
      .from("user_style_profiles")
      .upsert(nextProfile, { onConflict: "user_id" });

    if (upsertError) {
      console.error("[styleProfile] upsert failed:", upsertError);
      return;
    }

    console.log("[styleProfile] updated from feedback", {
      userId,
      rating,
      reasonTags,
      feedbackCount: nextProfile.feedback_count,
    });

    await trackEvent({
      userId,
      eventName: "style_profile_updated",
      metadata: {
        source: "feedback",
        feedbackType: rating,
        reasonTags,
        feedbackCount: nextProfile.feedback_count,
      },
    });
  } catch (error) {
    console.error("[styleProfile] updateStyleProfileFromFeedback failed:", error);
  }
}
