import type { ClosetItem } from "@/types/database";
import type { StyleProfileContext } from "@/lib/memory/style-profile";
import type {
  RecommendationContext,
  RecommendationRequirement,
  RetrievalResult,
} from "@/types/recommendation";
import type { WeatherContext } from "@/types/weather";
import {
  parseRecommendationRequirement,
  scoreClosetItem,
} from "@/lib/recommendation/rule-engine";
import {
  getCategoryCoverage,
  pickBalancedCandidates,
  rankClosetItems,
} from "@/lib/recommendation/ranking";

const FULL_CLOSET_THRESHOLD = 20;
const MIN_CANDIDATES = 8;
const MAX_CANDIDATES = 20;

export type RetrieveClosetCandidatesInput = {
  closetItems: ClosetItem[];
  requestText: string;
  weatherContext: WeatherContext | null;
  styleProfile: StyleProfileContext | null;
};

function buildRetrievalReason(
  requirement: RecommendationRequirement,
  candidateCount: number,
  totalCount: number,
  usedFullCloset: boolean
): string {
  const occasion = requirement.occasionHints.slice(0, 3).join("、");
  const style =
    requirement.styleHints.length > 0
      ? requirement.styleHints.slice(0, 3).join("、")
      : "未指定";

  if (usedFullCloset) {
    return `衣橱共 ${totalCount} 件，全量参与推荐；场合倾向：${occasion}；风格倾向：${style}`;
  }

  return `从 ${totalCount} 件中规则召回 ${candidateCount} 件候选；场合：${occasion}；风格：${style}`;
}

export function retrieveClosetCandidates(
  input: RetrieveClosetCandidatesInput
): RetrievalResult {
  const { closetItems, requestText, weatherContext, styleProfile } = input;

  console.log("[recommendation] retrieval start", {
    closetCount: closetItems.length,
    hasWeather: weatherContext !== null,
    hasStyleProfile: styleProfile !== null && styleProfile.feedbackCount > 0,
  });

  const requirement = parseRecommendationRequirement(requestText);

  const eligibleItems = closetItems.filter((item) => {
    if (!styleProfile || styleProfile.feedbackCount <= 0) {
      return true;
    }
    return !styleProfile.dislikedItemIds.includes(item.id);
  });

  const scoreContext = {
    requirement,
    weatherContext,
    styleProfile,
  };

  const scoredItems = rankClosetItems(
    eligibleItems.map((item) => scoreClosetItem(item, scoreContext))
  );

  console.log("[recommendation] scoring finished", {
    scoredCount: scoredItems.length,
    topScore: scoredItems[0]?.ruleScore ?? 0,
  });

  const useFullCloset = closetItems.length <= FULL_CLOSET_THRESHOLD;
  const picked = useFullCloset
    ? scoredItems
    : pickBalancedCandidates(scoredItems, {
        min: MIN_CANDIDATES,
        max: MAX_CANDIDATES,
      });

  const candidateItems = picked.map((scored) => scored.item);
  const categoryCoverage = getCategoryCoverage(picked);

  console.log("[recommendation] selected candidates", {
    candidateCount: candidateItems.length,
    usedFullCloset: useFullCloset,
  });

  console.log("[recommendation] category coverage", categoryCoverage);

  const debugScores = picked.map((scored) => ({
    itemId: scored.item.id.slice(0, 8),
    name: scored.item.name ?? "未命名",
    category: scored.item.category ?? "未知",
    total: scored.ruleScore,
  }));

  return {
    candidateItems,
    scoredItems: picked,
    retrievalReason: buildRetrievalReason(
      requirement,
      candidateItems.length,
      closetItems.length,
      useFullCloset
    ),
    debugScores,
    categoryCoverage,
    usedFallback: false,
  };
}

export function buildRecommendationContext(
  retrieval: RetrievalResult,
  requirement: RecommendationRequirement,
  totalClosetCount: number
): RecommendationContext {
  return {
    requirement,
    candidateCount: retrieval.candidateItems.length,
    totalClosetCount,
    categoryCoverage: retrieval.categoryCoverage,
    usedRetrieval: !retrieval.usedFallback,
  };
}

export function retrieveClosetCandidatesSafe(
  input: RetrieveClosetCandidatesInput
): RetrievalResult {
  try {
    return retrieveClosetCandidates(input);
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    console.error("[recommendation] retrieval failed, using fallback", {
      errorName,
      errorMessage,
    });

    return {
      candidateItems: input.closetItems,
      scoredItems: [],
      retrievalReason: "规则召回失败，已回退到全量衣橱",
      debugScores: [],
      categoryCoverage: getCategoryCoverage(
        input.closetItems.map((item) => ({
          item,
          ruleScore: 0,
          matchedReasons: [],
          breakdown: {
            occasion: 0,
            style: 0,
            weather: 0,
            color: 0,
            userPreference: 0,
            total: 0,
          },
        }))
      ),
      usedFallback: true,
    };
  }
}
