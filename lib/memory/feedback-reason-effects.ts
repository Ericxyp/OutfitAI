import type { FeedbackRating } from "@/types/database";

export const PROFILE_ARRAY_LIMIT = 12;
export const PROFILE_ITEM_ID_LIMIT = 50;

export type RecommendationSignals = {
  styles: string[];
  colors: string[];
  occasions: string[];
  selectedItemIds: string[];
};

export type StyleProfileArrays = {
  preferredStyles: string[];
  preferredColors: string[];
  preferredOccasions: string[];
  avoidStyles: string[];
  avoidColors: string[];
  favoriteItemIds: string[];
  dislikedItemIds: string[];
};

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

function applyBlanketPositive(
  existing: StyleProfileArrays,
  signals: RecommendationSignals
): StyleProfileArrays {
  return {
    preferredStyles: mergeUniqueStrings(
      existing.preferredStyles,
      signals.styles,
      PROFILE_ARRAY_LIMIT
    ),
    preferredColors: mergeUniqueStrings(
      existing.preferredColors,
      signals.colors,
      PROFILE_ARRAY_LIMIT
    ),
    preferredOccasions: mergeUniqueStrings(
      existing.preferredOccasions,
      signals.occasions,
      PROFILE_ARRAY_LIMIT
    ),
    avoidStyles: existing.avoidStyles,
    avoidColors: existing.avoidColors,
    favoriteItemIds: mergeUniqueIds(
      existing.favoriteItemIds,
      signals.selectedItemIds,
      PROFILE_ITEM_ID_LIMIT
    ),
    dislikedItemIds: existing.dislikedItemIds,
  };
}

function applyBlanketNegative(
  existing: StyleProfileArrays,
  signals: RecommendationSignals
): StyleProfileArrays {
  return {
    preferredStyles: existing.preferredStyles,
    preferredColors: existing.preferredColors,
    preferredOccasions: existing.preferredOccasions,
    avoidStyles: mergeUniqueStrings(
      existing.avoidStyles,
      signals.styles,
      PROFILE_ARRAY_LIMIT
    ),
    avoidColors: mergeUniqueStrings(
      existing.avoidColors,
      signals.colors,
      PROFILE_ARRAY_LIMIT
    ),
    favoriteItemIds: existing.favoriteItemIds,
    dislikedItemIds: mergeUniqueIds(
      existing.dislikedItemIds,
      signals.selectedItemIds,
      PROFILE_ITEM_ID_LIMIT
    ),
  };
}

function applyTargetedPositive(
  existing: StyleProfileArrays,
  reasonTags: string[],
  signals: RecommendationSignals
): StyleProfileArrays {
  let next = {
    ...existing,
    favoriteItemIds: mergeUniqueIds(
      existing.favoriteItemIds,
      signals.selectedItemIds,
      PROFILE_ITEM_ID_LIMIT
    ),
  };

  for (const tag of reasonTags) {
    switch (tag) {
      case "风格适合":
        next = {
          ...next,
          preferredStyles: mergeUniqueStrings(
            next.preferredStyles,
            signals.styles,
            PROFILE_ARRAY_LIMIT
          ),
        };
        break;
      case "颜色喜欢":
        next = {
          ...next,
          preferredColors: mergeUniqueStrings(
            next.preferredColors,
            signals.colors,
            PROFILE_ARRAY_LIMIT
          ),
        };
        break;
      case "场景合适":
        next = {
          ...next,
          preferredOccasions: mergeUniqueStrings(
            next.preferredOccasions,
            signals.occasions,
            PROFILE_ARRAY_LIMIT
          ),
        };
        break;
      case "显高显瘦":
        next = {
          ...next,
          preferredStyles: mergeUniqueStrings(
            next.preferredStyles,
            ["显高显瘦"],
            PROFILE_ARRAY_LIMIT
          ),
        };
        break;
      case "舒适实穿":
        next = {
          ...next,
          preferredStyles: mergeUniqueStrings(
            next.preferredStyles,
            ["舒适", "日常"],
            PROFILE_ARRAY_LIMIT
          ),
        };
        break;
      case "搭配新鲜":
        next = {
          ...next,
          preferredStyles: mergeUniqueStrings(
            next.preferredStyles,
            ["新鲜感"],
            PROFILE_ARRAY_LIMIT
          ),
        };
        break;
      default:
        break;
    }
  }

  return next;
}

function applyTargetedNegative(
  existing: StyleProfileArrays,
  reasonTags: string[],
  signals: RecommendationSignals
): StyleProfileArrays {
  let next = { ...existing };

  for (const tag of reasonTags) {
    switch (tag) {
      case "风格不喜欢":
        next = {
          ...next,
          avoidStyles: mergeUniqueStrings(
            next.avoidStyles,
            signals.styles,
            PROFILE_ARRAY_LIMIT
          ),
        };
        break;
      case "颜色不喜欢":
        next = {
          ...next,
          avoidColors: mergeUniqueStrings(
            next.avoidColors,
            signals.colors,
            PROFILE_ARRAY_LIMIT
          ),
        };
        break;
      case "太正式":
        next = {
          ...next,
          avoidStyles: mergeUniqueStrings(
            next.avoidStyles,
            ["正式"],
            PROFILE_ARRAY_LIMIT
          ),
        };
        break;
      case "太休闲":
        next = {
          ...next,
          avoidStyles: mergeUniqueStrings(
            next.avoidStyles,
            ["休闲"],
            PROFILE_ARRAY_LIMIT
          ),
        };
        break;
      case "不适合天气":
        break;
      case "不显身材":
        next = {
          ...next,
          avoidStyles: mergeUniqueStrings(
            next.avoidStyles,
            ["不显身材"],
            PROFILE_ARRAY_LIMIT
          ),
        };
        break;
      case "单品不喜欢":
        next = {
          ...next,
          dislikedItemIds: mergeUniqueIds(
            next.dislikedItemIds,
            signals.selectedItemIds,
            PROFILE_ITEM_ID_LIMIT
          ),
        };
        break;
      case "不适合场景":
        next = {
          ...next,
          avoidStyles: mergeUniqueStrings(
            next.avoidStyles,
            signals.occasions.slice(0, 2),
            PROFILE_ARRAY_LIMIT
          ),
        };
        break;
      default:
        break;
    }
  }

  return next;
}

export function applyFeedbackReasonEffects(input: {
  rating: FeedbackRating;
  reasonTags: string[];
  signals: RecommendationSignals;
  existing: StyleProfileArrays;
}): StyleProfileArrays {
  const isPositive = input.rating === "like" || input.rating === "save";

  if (input.reasonTags.length === 0) {
    return isPositive
      ? applyBlanketPositive(input.existing, input.signals)
      : applyBlanketNegative(input.existing, input.signals);
  }

  return isPositive
    ? applyTargetedPositive(input.existing, input.reasonTags, input.signals)
    : applyTargetedNegative(input.existing, input.reasonTags, input.signals);
}
