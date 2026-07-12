import { normalizeFeedbackReasonTags } from "@/lib/feedback/reason-tags";
import {
  applyFeedbackReasonEffects,
  type RecommendationSignals,
  type StyleProfileArrays,
} from "@/lib/memory/feedback-reason-effects";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const emptyProfile: StyleProfileArrays = {
  preferredStyles: [],
  preferredColors: [],
  preferredOccasions: [],
  avoidStyles: [],
  avoidColors: [],
  favoriteItemIds: [],
  dislikedItemIds: [],
};

const signals: RecommendationSignals = {
  styles: ["简约", "通勤"],
  colors: ["白色", "藏青"],
  occasions: ["通勤"],
  selectedItemIds: ["item-1", "item-2"],
};

function testNormalizeFeedbackReasonTags() {
  const normalized = normalizeFeedbackReasonTags("dislike", [
    "太正式",
    "非法标签",
    "颜色不喜欢",
    "太正式",
  ]);

  assert(
    normalized.join("、") === "太正式、颜色不喜欢",
    `expected deduped valid tags, got: ${normalized.join("、")}`
  );

  console.log("[PASS] normalizeFeedbackReasonTags filters invalid tags");
}

function testDislikeColorAvoidance() {
  const result = applyFeedbackReasonEffects({
    rating: "dislike",
    reasonTags: ["颜色不喜欢"],
    signals,
    existing: emptyProfile,
  });

  assert(
    result.avoidColors.includes("白色") && result.avoidColors.includes("藏青"),
    `expected avoid_colors from recommendation, got: ${result.avoidColors.join("、")}`
  );
  assert(
    result.avoidStyles.length === 0,
    `expected no avoid_styles for color-only reason, got: ${result.avoidStyles.join("、")}`
  );

  console.log("[PASS] dislike + 颜色不喜欢 updates avoid_colors only");
}

function testLikeColorPreference() {
  const result = applyFeedbackReasonEffects({
    rating: "like",
    reasonTags: ["颜色喜欢"],
    signals,
    existing: emptyProfile,
  });

  assert(
    result.preferredColors.includes("白色") &&
      result.preferredColors.includes("藏青"),
    `expected preferred_colors, got: ${result.preferredColors.join("、")}`
  );
  assert(
    result.preferredStyles.length === 0,
    `expected no preferred_styles for color-only reason, got: ${result.preferredStyles.join("、")}`
  );

  console.log("[PASS] like + 颜色喜欢 updates preferred_colors only");
}

function testBlanketLogicWithoutReasonTags() {
  const result = applyFeedbackReasonEffects({
    rating: "like",
    reasonTags: [],
    signals,
    existing: emptyProfile,
  });

  assert(
    result.preferredStyles.includes("简约"),
    "expected blanket logic to keep preferred_styles"
  );
  assert(
    result.favoriteItemIds.includes("item-1"),
    "expected blanket logic to keep favorite_item_ids"
  );

  console.log("[PASS] empty reason_tags keeps legacy blanket updates");
}

function main() {
  testNormalizeFeedbackReasonTags();
  testDislikeColorAvoidance();
  testLikeColorPreference();
  testBlanketLogicWithoutReasonTags();
  console.log("\nAll feedback reason tag tests passed.");
}

main();
