import type { FeedbackRating } from "@/types/database";

export const POSITIVE_FEEDBACK_REASON_TAGS = [
  "风格适合",
  "颜色喜欢",
  "场景合适",
  "显高显瘦",
  "舒适实穿",
  "搭配新鲜",
] as const;

export const NEGATIVE_FEEDBACK_REASON_TAGS = [
  "风格不喜欢",
  "颜色不喜欢",
  "太正式",
  "太休闲",
  "不适合天气",
  "不显身材",
  "单品不喜欢",
  "不适合场景",
] as const;

export type PositiveFeedbackReasonTag =
  (typeof POSITIVE_FEEDBACK_REASON_TAGS)[number];

export type NegativeFeedbackReasonTag =
  (typeof NEGATIVE_FEEDBACK_REASON_TAGS)[number];

export type FeedbackReasonTag =
  | PositiveFeedbackReasonTag
  | NegativeFeedbackReasonTag;

const POSITIVE_TAG_SET = new Set<string>(POSITIVE_FEEDBACK_REASON_TAGS);
const NEGATIVE_TAG_SET = new Set<string>(NEGATIVE_FEEDBACK_REASON_TAGS);

const MAX_REASON_TAGS = 3;
const MAX_DISPLAY_TAGS = 6;

export function getFeedbackReasonTags(rating: FeedbackRating): string[] {
  if (rating === "dislike") {
    return [...NEGATIVE_FEEDBACK_REASON_TAGS].slice(0, MAX_DISPLAY_TAGS);
  }

  return [...POSITIVE_FEEDBACK_REASON_TAGS].slice(0, MAX_DISPLAY_TAGS);
}

export function normalizeFeedbackReasonTags(
  rating: FeedbackRating,
  tags?: string[] | null
): string[] {
  if (!tags?.length) {
    return [];
  }

  const allowed =
    rating === "dislike" ? NEGATIVE_TAG_SET : POSITIVE_TAG_SET;

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const tag of tags) {
    const trimmed = tag.trim();
    if (!trimmed || !allowed.has(trimmed) || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);

    if (normalized.length >= MAX_REASON_TAGS) {
      break;
    }
  }

  return normalized;
}
