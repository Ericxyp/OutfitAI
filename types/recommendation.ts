import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClosetItem, Database } from "@/types/database";
import type { GenerateRecommendationOptions } from "@/types/weather";

export type RecommendationResult = {
  id: string;
  requestText: string;
  title: string;
  selectedItemIds: string[];
  summary: string;
  reasoning: string;
  styleTags: string[];
  occasion: string;
  alternatives: string[];
  items: ClosetItem[];
};

/** 用于精确自定义标签匹配的结构化需求词（已标准化） */
export type RequirementMatchTerms = {
  occasions: string[];
  styles: string[];
};

export type RecommendationRequirement = {
  rawText: string;
  occasionHints: string[];
  styleHints: string[];
  /**
   * 精确匹配用的场景 / 风格词：来自固定关键词表命中的原词与需求确认 Agent 的结构化字段，
   * 不是对整段文本的模糊匹配。
   */
  exactMatchTerms: RequirementMatchTerms;
};

export type ScoreBreakdown = {
  occasion: number;
  style: number;
  weather: number;
  color: number;
  userPreference: number;
  total: number;
};

export type CustomTagScoreDebug = {
  exactCustomOccasionMatches: string[];
  exactCustomStyleMatches: string[];
  customTagBonus: number;
  suppressedByWeather: boolean;
  /** 不含自定义标签奖励的规则分 */
  baseRuleScore: number;
};

export type ScoredClosetItem = {
  item: ClosetItem;
  ruleScore: number;
  matchedReasons: string[];
  breakdown: ScoreBreakdown;
  /** 精确自定义标签奖励（仅服务端调试 / 日志使用） */
  customTag?: CustomTagScoreDebug;
};

export type RecommendationContext = {
  requirement: RecommendationRequirement;
  candidateCount: number;
  totalClosetCount: number;
  categoryCoverage: Record<string, number>;
  usedRetrieval: boolean;
};

export type RetrievalDebugScore = {
  itemId: string;
  name: string;
  category: string;
  total: number;
  /** 融合前的规则分（系统标签 / 天气 / 画像 / 颜色） */
  ruleScore?: number;
  /** 语义分（similarity × 100，天气不适配时减半；包含自定义标签语义） */
  semanticScore?: number;
  /** 候选来源：规则召回 / embedding 语义召回 */
  sources?: Array<"rule" | "embedding">;
  /** 精确命中的自定义场景 / 风格数量与奖励（仅服务端日志，不返回客户端） */
  exactCustomOccasionMatches?: number;
  exactCustomStyleMatches?: number;
  customTagBonus?: number;
  /** 最终排序分（规则路径 = ruleScore + 奖励；混合路径 = 融合分） */
  finalScore?: number;
};

export type RetrievalResult = {
  candidateItems: ClosetItem[];
  scoredItems: ScoredClosetItem[];
  retrievalReason: string;
  debugScores: RetrievalDebugScore[];
  categoryCoverage: Record<string, number>;
  usedFallback: boolean;
  usedEmbeddingRetrieval?: boolean;
  embeddingCandidateCount?: number;
};

export type OutfitWorkflowInput = {
  userId: string;
  requestText: string;
  options?: GenerateRecommendationOptions;
  /** Bearer-authenticated client for mobile API routes */
  supabase?: SupabaseClient<Database>;
};

export type OutfitWorkflowSuccess = {
  success: true;
  recommendation: RecommendationResult;
};

export type OutfitWorkflowFailure = {
  success: false;
  error: string;
  needsMoreClothes?: boolean;
};

export type OutfitWorkflowResult =
  | OutfitWorkflowSuccess
  | OutfitWorkflowFailure;
