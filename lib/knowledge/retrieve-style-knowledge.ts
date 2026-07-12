import { generateEmbeddingSafe } from "@/lib/ai/embeddings";
import { logger } from "@/lib/logger";
import {
  isPersonalProfileContext,
  isStyleProfileContext,
  STYLE_KNOWLEDGE_KNOWN_TERMS,
  type PersonalKnowledgeProfileInput,
  type RetrieveStyleKnowledgeInput,
  type StyleKnowledgeEntry,
  type StyleKnowledgeProfileInput,
} from "@/lib/knowledge/style-knowledge";
import type { PersonalProfileContext } from "@/lib/memory/personal-profile-shared";
import type { StyleProfileContext } from "@/lib/memory/style-profile";
import type {
  UserPersonalProfile,
  UserStyleProfile,
} from "@/types/database";

export type { RetrieveStyleKnowledgeInput } from "@/lib/knowledge/style-knowledge";

export type RankedStyleKnowledgeEntry = StyleKnowledgeEntry & {
  score: number;
};

const DEFAULT_LIMIT = 6;
const EMBEDDING_SCORE_WEIGHT = 20;

const CATEGORY_KEYWORD_MAP: Record<string, string[]> = {
  occasion: ["上班", "通勤", "约会", "旅行", "商务", "会议", "正式", "职场"],
  weather: ["高温", "炎热", "低温", "寒冷", "雨天", "下雨", "冬季", "夏季"],
  body_goal: ["显高", "显瘦", "遮肉", "舒适"],
  style: ["简约", "低饱和", "休闲", "优雅", "精致", "街头"],
  color: ["色彩", "配色", "协调", "同色系", "对比色"],
  item: ["鞋子", "包包", "配饰"],
};

function normalizeText(text: string): string {
  return text.replace(/\s+/g, "").trim().toLowerCase();
}

function collectTermsFromText(text: string, keywords: Set<string>) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return;
  }

  for (const term of STYLE_KNOWLEDGE_KNOWN_TERMS) {
    if (normalized.includes(normalizeText(term))) {
      keywords.add(term);
    }
  }

  const chunks = text
    .split(/[，。；、\s]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);

  for (const chunk of chunks) {
    keywords.add(chunk);
  }
}

export function extractStyleKnowledgeKeywords(
  input: RetrieveStyleKnowledgeInput
): string[] {
  const keywords = new Set<string>();

  collectTermsFromText(input.query, keywords);

  if (input.occasion) {
    collectTermsFromText(input.occasion, keywords);
  }

  if (input.weatherSummary) {
    collectTermsFromText(input.weatherSummary, keywords);
  }

  if (input.styleProfile) {
    if (isStyleProfileContext(input.styleProfile as StyleKnowledgeProfileInput)) {
      const profile = input.styleProfile as StyleProfileContext;
      for (const value of [
        ...profile.preferredStyles,
        ...profile.preferredColors,
        ...profile.preferredOccasions,
        ...profile.avoidStyles,
        ...profile.avoidColors,
      ]) {
        collectTermsFromText(value, keywords);
      }
    } else {
      const profile = input.styleProfile as UserStyleProfile;
      for (const value of [
        ...profile.preferred_styles,
        ...profile.preferred_colors,
        ...profile.preferred_occasions,
        ...profile.avoid_styles,
        ...profile.avoid_colors,
      ]) {
        collectTermsFromText(value, keywords);
      }
    }
  }

  if (input.personalProfile) {
    if (
      isPersonalProfileContext(input.personalProfile as PersonalKnowledgeProfileInput)
    ) {
      const profile = input.personalProfile as PersonalProfileContext;
      for (const value of [
        ...profile.fitGoals,
        ...profile.avoidBodyFocus,
        profile.gender ?? "",
        profile.bodyNotes ?? "",
        profile.sizeNotes ?? "",
      ]) {
        collectTermsFromText(value, keywords);
      }
    } else {
      const profile = input.personalProfile as UserPersonalProfile;
      for (const value of [
        ...(profile.fit_goals ?? []),
        ...(profile.avoid_body_focus ?? []),
        profile.gender ?? "",
        profile.body_notes ?? "",
        profile.size_notes ?? "",
      ]) {
        collectTermsFromText(value, keywords);
      }
    }
  }

  return Array.from(keywords);
}

function countKeywordHits(text: string, keywords: string[]): number {
  const normalized = normalizeText(text);
  if (!normalized) {
    return 0;
  }

  let hits = 0;

  for (const keyword of keywords) {
    const normalizedKeyword = normalizeText(keyword);
    if (normalizedKeyword && normalized.includes(normalizedKeyword)) {
      hits += 1;
    }
  }

  return hits;
}

function scoreCategoryMatch(category: string, keywords: string[]): number {
  const hints = CATEGORY_KEYWORD_MAP[category] ?? [];
  if (hints.length === 0 || keywords.length === 0) {
    return 0;
  }

  let hits = 0;

  for (const keyword of keywords) {
    const normalizedKeyword = normalizeText(keyword);
    for (const hint of hints) {
      const normalizedHint = normalizeText(hint);
      if (
        normalizedKeyword.includes(normalizedHint) ||
        normalizedHint.includes(normalizedKeyword)
      ) {
        hits += 1;
        break;
      }
    }
  }

  return hits;
}

export function scoreStyleKnowledgeEntry(
  entry: StyleKnowledgeEntry,
  keywords: string[]
): number {
  if (keywords.length === 0) {
    return entry.priority * 10;
  }

  const tagText = [...entry.tags].join(" ");
  const tagHits = countKeywordHits(tagText, keywords);
  const titleHits = countKeywordHits(entry.title, keywords);
  const contentHits = countKeywordHits(entry.content, keywords);
  const categoryHits = scoreCategoryMatch(entry.category, keywords);

  return (
    entry.priority * 10 +
    categoryHits * 6 +
    tagHits * 5 +
    titleHits * 3 +
    contentHits * 2
  );
}

export function rankStyleKnowledgeEntries(
  entries: StyleKnowledgeEntry[],
  keywords: string[],
  limit = DEFAULT_LIMIT
): StyleKnowledgeEntry[] {
  if (entries.length === 0) {
    return [];
  }

  const ranked: RankedStyleKnowledgeEntry[] = entries
    .map((entry) => ({
      ...entry,
      score: scoreStyleKnowledgeEntry(entry, keywords),
    }))
    .filter((entry) => keywords.length === 0 || entry.score > 0)
    .sort((a, b) => b.score - a.score || b.priority - a.priority)
    .slice(0, limit);

  return ranked.map((entry) => ({
    id: entry.id,
    title: entry.title,
    category: entry.category,
    tags: entry.tags,
    content: entry.content,
    priority: entry.priority,
    is_active: entry.is_active,
    created_at: entry.created_at,
  }));
}

function buildStyleKnowledgeQueryText(
  input: RetrieveStyleKnowledgeInput,
  keywords: string[]
): string {
  return [
    input.query,
    input.occasion ?? "",
    input.weatherSummary ?? "",
    keywords.join("、"),
  ]
    .filter(Boolean)
    .join(" ");
}

async function retrieveStyleKnowledgeEmbeddingScores(
  input: RetrieveStyleKnowledgeInput,
  queryText: string,
  limit: number
): Promise<Map<string, number>> {
  const embedding = await generateEmbeddingSafe(queryText);
  if (!embedding) {
    return new Map();
  }

  try {
    const { data, error } = await input.supabase.rpc(
      "match_style_knowledge_entries",
      {
        query_embedding: embedding,
        match_count: limit,
      }
    );

    if (error) {
      logger.warn("[styleKnowledge] embedding rpc failed", { errorMessage: error.message.slice(0, 200) });
      return new Map();
    }

    return new Map(
      (data ?? []).map((row) => [
        row.id,
        typeof row.similarity === "number" ? row.similarity : 0,
      ])
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("[styleKnowledge] embedding retrieval failed", { errorMessage: message.slice(0, 200) });
    return new Map();
  }
}

function mergeHybridStyleKnowledgeEntries(
  entries: StyleKnowledgeEntry[],
  keywords: string[],
  embeddingScores: Map<string, number>,
  limit: number
): StyleKnowledgeEntry[] {
  const ranked = entries
    .map((entry) => {
      const keywordScore = scoreStyleKnowledgeEntry(entry, keywords);
      const embeddingSimilarity = embeddingScores.get(entry.id) ?? 0;
      const hybridScore =
        keywordScore + embeddingSimilarity * EMBEDDING_SCORE_WEIGHT;

      return {
        entry,
        hybridScore,
        keywordScore,
        embeddingSimilarity,
      };
    })
    .filter(
      (item) =>
        item.keywordScore > 0 ||
        item.embeddingSimilarity > 0 ||
        keywords.length === 0
    )
    .sort(
      (a, b) =>
        b.hybridScore - a.hybridScore ||
        b.entry.priority - a.entry.priority
    )
    .slice(0, limit)
    .map((item) => item.entry);

  return ranked;
}

export async function retrieveStyleKnowledge(
  input: RetrieveStyleKnowledgeInput
): Promise<StyleKnowledgeEntry[]> {
  const limit = input.limit ?? DEFAULT_LIMIT;

  try {
    const { data, error } = await input.supabase
      .from("style_knowledge_entries")
      .select("id, title, category, tags, content, priority, is_active, created_at")
      .eq("is_active", true);

    if (error) {
      logger.warn("[styleKnowledge] retrieve failed", { errorMessage: error.message.slice(0, 200) });
      return [];
    }

    const entries = (data ?? []) as StyleKnowledgeEntry[];
    const keywords = extractStyleKnowledgeKeywords(input);
    const queryText = buildStyleKnowledgeQueryText(input, keywords);
    const embeddingScores = await retrieveStyleKnowledgeEmbeddingScores(
      input,
      queryText,
      limit
    );

    if (embeddingScores.size === 0) {
      return rankStyleKnowledgeEntries(entries, keywords, limit);
    }

    const merged = mergeHybridStyleKnowledgeEntries(
      entries,
      keywords,
      embeddingScores,
      limit
    );

    logger.debug("[styleKnowledge] hybrid retrieval", {
      usedEmbedding: true,
      resultCount: merged.length,
    });

    return merged;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("[styleKnowledge] retrieve failed", { errorMessage: message.slice(0, 200) });
    return [];
  }
}
