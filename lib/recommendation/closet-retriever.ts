import { generateEmbeddingSafe } from "@/lib/ai/embeddings";
import type { StyleProfileContext } from "@/lib/memory/style-profile";
import type { ClosetItem } from "@/types/database";
import type { Database } from "@/types/database";
import type {
  RecommendationContext,
  RecommendationRequirement,
  RetrievalResult,
} from "@/types/recommendation";
import type { WeatherContext } from "@/types/weather";
import type { SupabaseClient } from "@supabase/supabase-js";
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
const RULE_SCORE_WEIGHT = 0.7;
const EMBEDDING_SCORE_WEIGHT = 30;
const DEFAULT_EMBEDDING_MATCH_COUNT = 12;

export type RetrieveClosetCandidatesInput = {
  closetItems: ClosetItem[];
  requestText: string;
  weatherContext: WeatherContext | null;
  styleProfile: StyleProfileContext | null;
};

export type EmbeddingClosetCandidate = {
  item: ClosetItem;
  embeddingSimilarity: number;
};

function buildRetrievalReason(
  requirement: RecommendationRequirement,
  candidateCount: number,
  totalCount: number,
  usedFullCloset: boolean,
  usedEmbedding: boolean
): string {
  const occasion = requirement.occasionHints.slice(0, 3).join("、");
  const style =
    requirement.styleHints.length > 0
      ? requirement.styleHints.slice(0, 3).join("、")
      : "未指定";

  const retrievalMode = usedEmbedding ? "规则 + embedding 混合召回" : "规则召回";

  if (usedFullCloset) {
    return `衣橱共 ${totalCount} 件，全量参与推荐；${retrievalMode}；场合倾向：${occasion}；风格倾向：${style}`;
  }

  return `从 ${totalCount} 件中${retrievalMode} ${candidateCount} 件候选；场合：${occasion}；风格：${style}`;
}

function filterEligibleItems(
  closetItems: ClosetItem[],
  styleProfile: StyleProfileContext | null
): ClosetItem[] {
  return closetItems.filter((item) => {
    if (!styleProfile || styleProfile.feedbackCount <= 0) {
      return true;
    }
    return !styleProfile.dislikedItemIds.includes(item.id);
  });
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
  const eligibleItems = filterEligibleItems(closetItems, styleProfile);

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
      useFullCloset,
      false
    ),
    debugScores,
    categoryCoverage,
    usedFallback: false,
    usedEmbeddingRetrieval: false,
    embeddingCandidateCount: 0,
  };
}

export async function retrieveClosetEmbeddingCandidates(input: {
  supabase: SupabaseClient<Database>;
  userId: string;
  requestText: string;
  closetItems: ClosetItem[];
  styleProfile: StyleProfileContext | null;
  limit?: number;
}): Promise<EmbeddingClosetCandidate[]> {
  const embedding = await generateEmbeddingSafe(input.requestText);
  if (!embedding) {
    return [];
  }

  try {
    const { data, error } = await input.supabase.rpc("match_closet_items", {
      query_embedding: embedding,
      match_user_id: input.userId,
      match_count: input.limit ?? DEFAULT_EMBEDDING_MATCH_COUNT,
    });

    if (error) {
      console.warn("[recommendation] embedding rpc failed:", error.message);
      return [];
    }

    const eligibleItems = filterEligibleItems(
      input.closetItems,
      input.styleProfile
    );
    const closetMap = new Map(eligibleItems.map((item) => [item.id, item]));

    return (data ?? [])
      .map((row) => {
        const item = closetMap.get(row.id);
        if (!item) {
          return null;
        }

        return {
          item,
          embeddingSimilarity:
            typeof row.similarity === "number" ? row.similarity : 0,
        };
      })
      .filter((candidate): candidate is EmbeddingClosetCandidate =>
        Boolean(candidate)
      );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[recommendation] embedding retrieval failed:", message);
    return [];
  }
}

export function mergeHybridClosetRetrieval(
  ruleRetrieval: RetrievalResult,
  embeddingCandidates: EmbeddingClosetCandidate[],
  input: RetrieveClosetCandidatesInput
): RetrievalResult {
  if (embeddingCandidates.length === 0) {
    return ruleRetrieval;
  }

  const requirement = parseRecommendationRequirement(input.requestText);
  const scoreContext = {
    requirement,
    weatherContext: input.weatherContext,
    styleProfile: input.styleProfile,
  };

  const ruleById = new Map(
    ruleRetrieval.scoredItems.map((scored) => [scored.item.id, scored])
  );
  const embeddingById = new Map(
    embeddingCandidates.map((candidate) => [candidate.item.id, candidate])
  );

  const allItemIds = new Set<string>([
    ...ruleById.keys(),
    ...embeddingById.keys(),
  ]);

  const hybridScored = rankClosetItems(
    [...allItemIds].map((itemId) => {
      const ruleScored = ruleById.get(itemId);
      const embeddingCandidate = embeddingById.get(itemId);
      const item = ruleScored?.item ?? embeddingCandidate!.item;
      const ruleScore = ruleScored?.ruleScore ?? 0;
      const embeddingSimilarity = embeddingCandidate?.embeddingSimilarity ?? 0;
      const hybridScore =
        ruleScore * RULE_SCORE_WEIGHT +
        embeddingSimilarity * EMBEDDING_SCORE_WEIGHT;

      const baseScored =
        ruleScored ?? scoreClosetItem(item, scoreContext);

      return {
        ...baseScored,
        ruleScore: hybridScore,
        matchedReasons: embeddingCandidate
          ? [
              ...baseScored.matchedReasons,
              "embedding 语义召回",
            ]
          : baseScored.matchedReasons,
        breakdown: {
          ...baseScored.breakdown,
          total: hybridScore,
        },
      };
    })
  );

  const useFullCloset = input.closetItems.length <= FULL_CLOSET_THRESHOLD;
  const picked = useFullCloset
    ? hybridScored
    : pickBalancedCandidates(hybridScored, {
        min: MIN_CANDIDATES,
        max: MAX_CANDIDATES,
      });

  const candidateItems = picked.map((scored) => scored.item);

  return {
    candidateItems,
    scoredItems: picked,
    retrievalReason: buildRetrievalReason(
      requirement,
      candidateItems.length,
      input.closetItems.length,
      useFullCloset,
      true
    ),
    debugScores: picked.map((scored) => ({
      itemId: scored.item.id.slice(0, 8),
      name: scored.item.name ?? "未命名",
      category: scored.item.category ?? "未知",
      total: scored.ruleScore,
    })),
    categoryCoverage: getCategoryCoverage(picked),
    usedFallback: false,
    usedEmbeddingRetrieval: true,
    embeddingCandidateCount: embeddingCandidates.length,
  };
}

export async function retrieveClosetCandidatesHybridSafe(input: {
  supabase: SupabaseClient<Database>;
  userId: string;
  closetItems: ClosetItem[];
  requestText: string;
  weatherContext: WeatherContext | null;
  styleProfile: StyleProfileContext | null;
}): Promise<RetrievalResult> {
  const retrievalInput: RetrieveClosetCandidatesInput = {
    closetItems: input.closetItems,
    requestText: input.requestText,
    weatherContext: input.weatherContext,
    styleProfile: input.styleProfile,
  };

  const ruleRetrieval = retrieveClosetCandidatesSafe(retrievalInput);

  try {
    const embeddingCandidates = await retrieveClosetEmbeddingCandidates({
      supabase: input.supabase,
      userId: input.userId,
      requestText: input.requestText,
      closetItems: input.closetItems,
      styleProfile: input.styleProfile,
    });

    if (embeddingCandidates.length === 0) {
      return ruleRetrieval;
    }

    return mergeHybridClosetRetrieval(
      ruleRetrieval,
      embeddingCandidates,
      retrievalInput
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[recommendation] hybrid retrieval failed, using rules:", message);
    return ruleRetrieval;
  }
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
      usedEmbeddingRetrieval: false,
      embeddingCandidateCount: 0,
    };
  }
}
