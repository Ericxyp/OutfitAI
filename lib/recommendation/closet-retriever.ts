import { generateEmbeddingSafe } from "@/lib/ai/embeddings";
import { logger } from "@/lib/logger";
import type { StyleProfileContext } from "@/lib/memory/style-profile";
import type { ClosetItem } from "@/types/database";
import type { Database } from "@/types/database";
import type {
  RecommendationContext,
  RecommendationRequirement,
  RequirementMatchTerms,
  RetrievalDebugScore,
  RetrievalResult,
  ScoredClosetItem,
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
/**
 * 混合排序权重：hybrid = rule × 0.8 + (similarity × 100) × 0.2
 * - 规则（系统标签 / 天气 / 画像 / 颜色）占主导，语义（含自定义标签）只做补召回与软排序；
 * - 原为 0.7 / 30（语义约 30%），本次小幅下调到 20%。
 */
export const RULE_SCORE_WEIGHT = 0.8;
export const SEMANTIC_SCORE_WEIGHT = 0.2;
/** 天气不适配（天气分低于中性分）的单品，语义加分减半，避免自定义描述压过天气规则 */
const WEATHER_PENALIZED_SEMANTIC_FACTOR = 0.5;
const NEUTRAL_WEATHER_SCORE = 50;
const DEFAULT_EMBEDDING_MATCH_COUNT = 12;

export type RetrieveClosetCandidatesInput = {
  closetItems: ClosetItem[];
  requestText: string;
  weatherContext: WeatherContext | null;
  styleProfile: StyleProfileContext | null;
  /** 需求确认 Agent 的结构化场景 / 风格词（已在服务端清洗），用于精确自定义标签匹配 */
  requirementTerms?: RequirementMatchTerms | null;
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

/** 每个候选的服务端调试信息：只含数量与分数，不含标签原文 */
function buildDebugScore(
  scored: ScoredClosetItem,
  extra: { ruleScore: number; semanticScore: number; sources: Array<"rule" | "embedding"> }
): RetrievalDebugScore {
  return {
    itemId: scored.item.id.slice(0, 8),
    name: scored.item.name ?? "未命名",
    category: scored.item.category ?? "未知",
    total: scored.ruleScore,
    ruleScore: extra.ruleScore,
    semanticScore: extra.semanticScore,
    sources: extra.sources,
    exactCustomOccasionMatches: scored.customTag?.exactCustomOccasionMatches.length ?? 0,
    exactCustomStyleMatches: scored.customTag?.exactCustomStyleMatches.length ?? 0,
    customTagBonus: scored.customTag?.customTagBonus ?? 0,
    finalScore: scored.ruleScore,
  };
}

/** 去掉精确自定义标签奖励后的规则分 */
function getBaseRuleScore(scored: ScoredClosetItem): number {
  return scored.ruleScore - (scored.customTag?.customTagBonus ?? 0);
}

/**
 * 硬过滤：用户明确不喜欢的单品不进入任何候选（规则、语义、fallback 均适用）。
 * 自定义标签不会影响此过滤。
 */
export function filterEligibleItems(
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

  logger.debug("[recommendation] retrieval start", {
    closetCount: closetItems.length,
    hasWeather: weatherContext !== null,
    hasStyleProfile: styleProfile !== null && styleProfile.feedbackCount > 0,
  });

  const requirement = parseRecommendationRequirement(requestText, input.requirementTerms);
  const eligibleItems = filterEligibleItems(closetItems, styleProfile);

  const scoreContext = {
    requirement,
    weatherContext,
    styleProfile,
  };

  const scoredItems = rankClosetItems(
    eligibleItems.map((item) => scoreClosetItem(item, scoreContext))
  );

  logger.debug("[recommendation] scoring finished", {
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

  logger.debug("[recommendation] selected candidates", {
    candidateCount: candidateItems.length,
    usedFullCloset: useFullCloset,
  });

  logger.debug("[recommendation] category coverage", {
    ...categoryCoverage,
  });

  const debugScores = picked.map((scored) =>
    buildDebugScore(scored, { ruleScore: getBaseRuleScore(scored), semanticScore: 0, sources: ["rule"] })
  );

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
      logger.warn("[recommendation] embedding rpc failed", { errorMessage: error.message.slice(0, 200) });
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
    logger.warn("[recommendation] embedding retrieval failed", { errorMessage: message.slice(0, 200) });
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

  const requirement = parseRecommendationRequirement(input.requestText, input.requirementTerms);
  const scoreContext = {
    requirement,
    weatherContext: input.weatherContext,
    styleProfile: input.styleProfile,
  };

  const ruleById = new Map(
    ruleRetrieval.scoredItems.map((scored) => [scored.item.id, scored])
  );
  const hybridDebug = new Map<
    string,
    { ruleScore: number; semanticScore: number; sources: Array<"rule" | "embedding"> }
  >();
  const embeddingById = new Map(
    embeddingCandidates.map((candidate) => [candidate.item.id, candidate])
  );

  const allItemIds = new Set<string>([
    ...ruleById.keys(),
    ...embeddingById.keys(),
  ]);

  const eligibleIds = new Set(
    filterEligibleItems(input.closetItems, input.styleProfile).map((item) => item.id)
  );

  const hybridScored = rankClosetItems(
    [...allItemIds]
      // 语义召回不能让硬排除单品重新进入候选
      .filter((itemId) => eligibleIds.has(itemId))
      .map((itemId) => {
        const ruleScored = ruleById.get(itemId);
        const embeddingCandidate = embeddingById.get(itemId);
        const item = ruleScored?.item ?? embeddingCandidate!.item;
        // 纯语义召回的单品同样计算完整规则分（含天气），不再按 0 分处理
        const baseScored = ruleScored ?? scoreClosetItem(item, scoreContext);
        // 精确自定义标签奖励不参与 0.8 缩放，以原值加在融合分上（仍发生在截断之前）
        const customTagBonus = baseScored.customTag?.customTagBonus ?? 0;
        const ruleScore = getBaseRuleScore(baseScored);
        const similarity = Math.max(0, Math.min(1, embeddingCandidate?.embeddingSimilarity ?? 0));
        const weatherFactor =
          baseScored.breakdown.weather < NEUTRAL_WEATHER_SCORE ? WEATHER_PENALIZED_SEMANTIC_FACTOR : 1;
        const semanticScore = similarity * 100 * weatherFactor;
        const hybridScore =
          ruleScore * RULE_SCORE_WEIGHT + semanticScore * SEMANTIC_SCORE_WEIGHT + customTagBonus;

        const scored: ScoredClosetItem = {
          ...baseScored,
          ruleScore: hybridScore,
          matchedReasons: embeddingCandidate
            ? [...baseScored.matchedReasons, "embedding 语义召回"]
            : baseScored.matchedReasons,
          breakdown: {
            ...baseScored.breakdown,
            total: hybridScore,
          },
        };
        hybridDebug.set(itemId, {
          ruleScore,
          semanticScore,
          sources: [
            ...(ruleScored ? (["rule"] as const) : []),
            ...(embeddingCandidate ? (["embedding"] as const) : []),
          ],
        });
        return scored;
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
    debugScores: picked.map((scored) => {
      const debug = hybridDebug.get(scored.item.id);
      return buildDebugScore(scored, {
        ruleScore: debug?.ruleScore ?? getBaseRuleScore(scored),
        semanticScore: debug?.semanticScore ?? 0,
        sources: debug?.sources ?? ["rule"],
      });
    }),
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
  requirementTerms?: RequirementMatchTerms | null;
}): Promise<RetrievalResult> {
  const retrievalInput: RetrieveClosetCandidatesInput = {
    closetItems: input.closetItems,
    requestText: input.requestText,
    weatherContext: input.weatherContext,
    styleProfile: input.styleProfile,
    requirementTerms: input.requirementTerms,
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
    logger.warn("[recommendation] hybrid retrieval failed, using rules", { errorMessage: message.slice(0, 200) });
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

    logger.error("[recommendation] retrieval failed, using fallback", {
      feature: "recommendation",
      reason: "retrieval_failed",
      errorName,
      errorMessage: errorMessage.slice(0, 200),
    });

    // fallback 同样执行硬过滤：明确不喜欢的单品不能重新进入
    const eligibleItems = filterEligibleItems(input.closetItems, input.styleProfile);
    return {
      candidateItems: eligibleItems,
      scoredItems: [],
      retrievalReason: "规则召回失败，已回退到全量衣橱",
      debugScores: [],
      categoryCoverage: getCategoryCoverage(
        eligibleItems.map((item) => ({
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
