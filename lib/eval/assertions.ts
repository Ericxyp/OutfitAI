import type { OutfitAIResponse } from "@/lib/ai/generate-outfit";
import type { StyleProfileContext } from "@/lib/memory/style-profile";
import { containsVisibleId } from "@/lib/text/sanitize-visible-ai-text";
import type { ClosetItem } from "@/types/database";
import type { WeatherContext } from "@/types/weather";
import type {
  AssertionRunResult,
  EvalAssertionContext,
  EvalCase,
} from "@/lib/eval/types";

const HOT_TEMP_THRESHOLD_C = 28;
const COLD_TEMP_THRESHOLD_C = 10;

const HEAVY_ITEM_KEYWORDS = ["羽绒", "毛呢", "羊毛", "厚针织", "羊绒", "棉服"];
const RAINY_AVOID_KEYWORDS = ["麂皮", "拖地", "浅色皮鞋"];
const WORK_HINTS = ["通勤", "简约", "正式", "上班", "会议"];
const DATE_HINTS = ["温柔", "优雅", "简约", "浪漫"];
const LEISURE_HINTS = ["休闲", "舒适", "街头", "出游", "轻松"];

function getVisibleTexts(result: OutfitAIResponse): string[] {
  return [
    result.title,
    result.summary,
    result.reasoning,
    result.occasion,
    ...result.style_tags,
    ...result.alternatives,
  ];
}

function getClosetMap(closetItems: ClosetItem[]): Map<string, ClosetItem> {
  return new Map(closetItems.map((item) => [item.id, item]));
}

function getSelectedItems(
  result: OutfitAIResponse,
  closetMap: Map<string, ClosetItem>
): ClosetItem[] {
  return result.selected_item_ids
    .map((id) => closetMap.get(id))
    .filter((item): item is ClosetItem => Boolean(item));
}

function collectTagTexts(
  result: OutfitAIResponse,
  selectedItems: ClosetItem[]
): string {
  const parts = [
    result.occasion,
    ...result.style_tags,
    ...selectedItems.flatMap((item) => [
      item.name ?? "",
      item.category ?? "",
      ...(item.style_tags ?? []),
      ...(item.occasion_tags ?? []),
      item.notes ?? "",
    ]),
  ];

  return parts.join(" ");
}

function matchesAnyHint(text: string, hints: string[]): boolean {
  return hints.some((hint) => text.includes(hint));
}

function isHeavyItem(item: ClosetItem): boolean {
  const blob = [
    item.name ?? "",
    item.material ?? "",
    item.notes ?? "",
    item.category ?? "",
    ...(item.season_tags ?? []),
  ].join(" ");

  if (HEAVY_ITEM_KEYWORDS.some((keyword) => blob.includes(keyword))) {
    return true;
  }

  return item.category === "外套" && (item.season_tags ?? []).includes("冬");
}

function isRainyAvoidItem(item: ClosetItem): boolean {
  const blob = [item.name ?? "", item.material ?? "", item.notes ?? ""].join(" ");
  return RAINY_AVOID_KEYWORDS.some((keyword) => blob.includes(keyword));
}

function isOuterwearOrWarmItem(item: ClosetItem): boolean {
  if (item.category === "外套") {
    return true;
  }

  const blob = [item.name ?? "", item.material ?? "", item.notes ?? ""].join(" ");
  return HEAVY_ITEM_KEYWORDS.some((keyword) => blob.includes(keyword));
}

function inferScenarioType(requestText: string): "work" | "date" | "leisure" | null {
  if (/上班|通勤|会议|正式/.test(requestText)) {
    return "work";
  }

  if (/约会/.test(requestText)) {
    return "date";
  }

  if (/出游|周末|旅行|轻便/.test(requestText)) {
    return "leisure";
  }

  return null;
}

export function assertNoVisibleIds(result: OutfitAIResponse): string[] {
  const failures: string[] = [];

  for (const text of getVisibleTexts(result)) {
    if (containsVisibleId(text)) {
      failures.push("visible text contains UUID / id label / item_id");
      break;
    }
  }

  return failures;
}

export function assertSelectedIdsExist(
  result: OutfitAIResponse,
  closetItems: ClosetItem[]
): string[] {
  const validIds = new Set(closetItems.map((item) => item.id));
  const missing = result.selected_item_ids.filter((id) => !validIds.has(id));

  if (missing.length === 0) {
    return [];
  }

  return missing.map((id) => `selected_item_ids contains unknown id: ${id}`);
}

export function assertNoDislikedItems(
  result: OutfitAIResponse,
  styleProfile: StyleProfileContext | null
): string[] {
  if (!styleProfile || styleProfile.dislikedItemIds.length === 0) {
    return [];
  }

  const failures: string[] = [];

  for (const id of result.selected_item_ids) {
    if (styleProfile.dislikedItemIds.includes(id)) {
      failures.push(`selected_item_ids contains disliked item: ${id}`);
      break;
    }
  }

  return failures;
}

export function assertHasEnoughItems(result: OutfitAIResponse): string[] {
  if (result.selected_item_ids.length >= 2) {
    return [];
  }

  return [
    `selected_item_ids has only ${result.selected_item_ids.length} item(s), expected at least 2`,
  ];
}

export function assertWeatherReasonable(
  result: OutfitAIResponse,
  closetItems: ClosetItem[],
  weatherContext?: WeatherContext | null
): { failures: string[]; warnings: string[] } {
  if (!weatherContext) {
    return { failures: [], warnings: [] };
  }

  const failures: string[] = [];
  const warnings: string[] = [];
  const closetMap = getClosetMap(closetItems);
  const selectedItems = getSelectedItems(result, closetMap);

  if (weatherContext.temperatureC >= HOT_TEMP_THRESHOLD_C) {
    const heavyItems = selectedItems.filter(isHeavyItem);
    if (heavyItems.length > 0) {
      failures.push(
        `hot weather selected heavy items: ${heavyItems.map((item) => item.name ?? item.id).join("、")}`
      );
    }
  }

  if (weatherContext.temperatureC <= COLD_TEMP_THRESHOLD_C) {
    const hasWarmLayer = selectedItems.some(isOuterwearOrWarmItem);
    if (!hasWarmLayer) {
      warnings.push("cold weather outfit does not clearly include outerwear or warm items");
    }
  }

  if (/雨/.test(weatherContext.condition)) {
    const riskyItems = selectedItems.filter(isRainyAvoidItem);
    if (riskyItems.length > 0) {
      failures.push(
        `rainy weather selected risky items: ${riskyItems.map((item) => item.name ?? item.id).join("、")}`
      );
    }
  }

  return { failures, warnings };
}

export function assertScenarioReasonable(
  result: OutfitAIResponse,
  closetItems: ClosetItem[],
  evalCase: EvalCase
): string[] {
  const warnings: string[] = [];
  const closetMap = getClosetMap(closetItems);
  const selectedItems = getSelectedItems(result, closetMap);
  const tagText = collectTagTexts(result, selectedItems);
  const { expected } = evalCase;

  if (expected.requiredOccasionHints?.length) {
    if (!matchesAnyHint(tagText, expected.requiredOccasionHints)) {
      warnings.push(
        `did not clearly match occasion hints: ${expected.requiredOccasionHints.join("、")}`
      );
    }
  }

  if (expected.requiredStyleHints?.length) {
    if (!matchesAnyHint(tagText, expected.requiredStyleHints)) {
      warnings.push(
        `did not clearly match style hints: ${expected.requiredStyleHints.join("、")}`
      );
    }
  }

  const scenarioType = inferScenarioType(evalCase.requestText);
  if (scenarioType === "work" && !matchesAnyHint(tagText, WORK_HINTS)) {
    warnings.push("work scenario did not clearly match commute/formal/simple cues");
  }

  if (scenarioType === "date" && !matchesAnyHint(tagText, DATE_HINTS)) {
    warnings.push("date scenario did not clearly match soft/elegant/simple cues");
  }

  if (scenarioType === "leisure" && !matchesAnyHint(tagText, LEISURE_HINTS)) {
    warnings.push("leisure scenario did not clearly match casual/comfort cues");
  }

  return warnings;
}

export function runAssertions(context: EvalAssertionContext): AssertionRunResult {
  const {
    result,
    closetItems,
    styleProfile,
    weatherContext,
    evalCase,
  } = context;

  const failures = [
    ...assertNoVisibleIds(result),
    ...assertSelectedIdsExist(result, closetItems),
    ...assertNoDislikedItems(result, styleProfile),
    ...assertHasEnoughItems(result),
  ];

  for (const pattern of evalCase.expected.forbiddenVisiblePatterns ?? []) {
    const matched = getVisibleTexts(result).some((text) => text.includes(pattern));
    if (matched) {
      failures.push(`visible text contains forbidden pattern: ${pattern}`);
    }
  }

  for (const forbiddenId of evalCase.expected.forbiddenItemIds ?? []) {
    if (result.selected_item_ids.includes(forbiddenId)) {
      failures.push(`selected_item_ids contains forbidden item: ${forbiddenId}`);
    }
  }

  const weatherResult = assertWeatherReasonable(
    result,
    closetItems,
    weatherContext
  );
  failures.push(...weatherResult.failures);

  if (evalCase.expected.shouldAvoidHeavyItemsWhenHot && weatherContext) {
    if (weatherContext.temperatureC >= HOT_TEMP_THRESHOLD_C) {
      const closetMap = getClosetMap(closetItems);
      const heavyItems = getSelectedItems(result, closetMap).filter(isHeavyItem);
      if (heavyItems.length > 0) {
        failures.push(
          `hot scenario selected heavy items: ${heavyItems.map((item) => item.name ?? item.id).join("、")}`
        );
      }
    }
  }

  const warnings = [
    ...weatherResult.warnings,
    ...assertScenarioReasonable(result, closetItems, evalCase),
  ];

  if (
    evalCase.expected.shouldPreferOuterwearWhenCold &&
    weatherContext &&
    weatherContext.temperatureC <= COLD_TEMP_THRESHOLD_C
  ) {
    const closetMap = getClosetMap(closetItems);
    const hasWarmLayer = getSelectedItems(result, closetMap).some(
      isOuterwearOrWarmItem
    );
    if (!hasWarmLayer) {
      warnings.push("cold scenario expected outerwear or warm items but none were selected");
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    warnings,
  };
}
