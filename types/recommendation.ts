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

export type RecommendationRequirement = {
  rawText: string;
  occasionHints: string[];
  styleHints: string[];
};

export type ScoreBreakdown = {
  occasion: number;
  style: number;
  weather: number;
  color: number;
  userPreference: number;
  total: number;
};

export type ScoredClosetItem = {
  item: ClosetItem;
  ruleScore: number;
  matchedReasons: string[];
  breakdown: ScoreBreakdown;
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
