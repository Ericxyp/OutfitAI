import { createClient } from "@/lib/supabase/server";
import type { FeedbackRating } from "@/types/database";

const MAX_TAG_COUNT = 12;
const MAX_ITEM_ID_COUNT = 50;

function mergeUniqueStrings(
  existing: string[],
  incoming: string[],
  max: number
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of [...incoming, ...existing]) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
    if (result.length >= max) break;
  }

  return result;
}

function mergeUniqueIds(
  existing: string[],
  incoming: string[],
  max: number
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const id of [...incoming, ...existing]) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    if (result.length >= max) break;
  }

  return result;
}

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
}): Promise<void> {
  const { userId, recommendationId, rating } = input;

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

    const mergedStyles = mergeUniqueStrings(
      [],
      [...(recommendation.style_tags ?? []), ...itemStyles],
      MAX_TAG_COUNT
    );
    const mergedColors = mergeUniqueStrings([], itemColors, MAX_TAG_COUNT);
    const mergedOccasions = mergeUniqueStrings(
      [],
      [
        ...collectNonEmptyStrings([recommendation.occasion]),
        ...itemOccasions,
      ],
      MAX_TAG_COUNT
    );

    const { data: existing } = await supabase
      .from("user_style_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    const isPositive = rating === "like" || rating === "save";

    const nextProfile = {
      user_id: userId,
      preferred_styles: isPositive
        ? mergeUniqueStrings(
            existing?.preferred_styles ?? [],
            mergedStyles,
            MAX_TAG_COUNT
          )
        : (existing?.preferred_styles ?? []),
      preferred_colors: isPositive
        ? mergeUniqueStrings(
            existing?.preferred_colors ?? [],
            mergedColors,
            MAX_TAG_COUNT
          )
        : (existing?.preferred_colors ?? []),
      preferred_occasions: isPositive
        ? mergeUniqueStrings(
            existing?.preferred_occasions ?? [],
            mergedOccasions,
            MAX_TAG_COUNT
          )
        : (existing?.preferred_occasions ?? []),
      avoid_styles: !isPositive
        ? mergeUniqueStrings(
            existing?.avoid_styles ?? [],
            mergedStyles,
            MAX_TAG_COUNT
          )
        : (existing?.avoid_styles ?? []),
      avoid_colors: !isPositive
        ? mergeUniqueStrings(
            existing?.avoid_colors ?? [],
            mergedColors,
            MAX_TAG_COUNT
          )
        : (existing?.avoid_colors ?? []),
      favorite_item_ids: isPositive
        ? mergeUniqueIds(
            existing?.favorite_item_ids ?? [],
            selectedItemIds,
            MAX_ITEM_ID_COUNT
          )
        : (existing?.favorite_item_ids ?? []),
      disliked_item_ids: !isPositive
        ? mergeUniqueIds(
            existing?.disliked_item_ids ?? [],
            selectedItemIds,
            MAX_ITEM_ID_COUNT
          )
        : (existing?.disliked_item_ids ?? []),
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
      feedbackCount: nextProfile.feedback_count,
    });
  } catch (error) {
    console.error("[styleProfile] updateStyleProfileFromFeedback failed:", error);
  }
}
