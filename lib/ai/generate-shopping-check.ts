import type { ProductAnalysis } from "@/lib/ai/analyze-product";
import { createQwenClient, getQwenModel } from "@/lib/ai/qwen";
import {
  formatStyleProfileForPrompt,
  type StyleProfileContext,
} from "@/lib/memory/style-profile";
import {
  formatPersonalProfileForPrompt,
  hasPersonalProfileData,
  PERSONAL_PROFILE_SAFETY_RULES,
  type PersonalProfileContext,
} from "@/lib/memory/personal-profile";
import {
  formatStyleKnowledgeForPrompt,
  type StyleKnowledgeEntry,
} from "@/lib/knowledge/style-knowledge";
import {
  containsVisibleId,
  sanitizeVisibleAiText,
} from "@/lib/text/sanitize-visible-ai-text";
import type { ClosetItem } from "@/types/database";

export type GenerateShoppingCheckInput = {
  product: ProductAnalysis;
  closetItems: ClosetItem[];
  styleProfile: StyleProfileContext | null;
  personalProfile?: PersonalProfileContext | null;
  styleKnowledge?: StyleKnowledgeEntry[];
};

export type ShoppingOutfitIdea = {
  title: string;
  selected_item_ids: string[];
  summary: string;
};

export type ShoppingCheckAIResponse = {
  compatibility_score: number;
  match_count: number;
  suitable_styles: string[];
  recommendation: "buy" | "consider" | "skip";
  reasons: string[];
  risks: string[];
  outfit_ideas: ShoppingOutfitIdea[];
};

export type GenerateShoppingCheckRetryContext = {
  invalidIds?: boolean;
  visibleIds?: boolean;
};

const MAX_RESOLVED_ITEMS = 6;
const PURCHASE_RECOMMENDATIONS = new Set(["buy", "consider", "skip"]);

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function normalizeMatchText(text: string): string {
  return text.replace(/\s+/g, "").trim();
}

function matchItemByName(
  rawValue: string,
  closetItems: ClosetItem[]
): ClosetItem | undefined {
  const raw = rawValue.trim();
  if (!raw) {
    return undefined;
  }

  const rawNormalized = normalizeMatchText(raw);

  const exactMatch = closetItems.find(
    (item) => (item.name?.trim() ?? "") === raw
  );
  if (exactMatch) {
    return exactMatch;
  }

  const normalizedMatch = closetItems.find(
    (item) => normalizeMatchText(item.name ?? "") === rawNormalized
  );
  if (normalizedMatch) {
    return normalizedMatch;
  }

  const rawContainsName = closetItems.find((item) => {
    const name = item.name?.trim();
    return Boolean(name && raw.includes(name));
  });
  if (rawContainsName) {
    return rawContainsName;
  }

  const nameContainsRaw = closetItems.find((item) => {
    const name = item.name?.trim();
    return Boolean(name && name.includes(raw));
  });
  if (nameContainsRaw) {
    return nameContainsRaw;
  }

  return undefined;
}

function resolveSelectedItemIds(
  rawIds: string[],
  closetItems: ClosetItem[],
  visibleTexts?: string[]
): string[] {
  const validIds = new Set(closetItems.map((item) => item.id));
  const resolved: string[] = [];
  const seen = new Set<string>();

  const addId = (id: string) => {
    if (!validIds.has(id) || seen.has(id) || resolved.length >= MAX_RESOLVED_ITEMS) {
      return;
    }
    seen.add(id);
    resolved.push(id);
  };

  for (const raw of rawIds) {
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }

    if (validIds.has(trimmed)) {
      addId(trimmed);
      continue;
    }

    const matched = matchItemByName(trimmed, closetItems);
    if (matched) {
      addId(matched.id);
    }
  }

  if (resolved.length === 0 && visibleTexts && visibleTexts.length > 0) {
    const combinedText = visibleTexts.join(" ");
    const itemsByNameLength = [...closetItems]
      .filter((item) => item.name?.trim())
      .sort((a, b) => (b.name?.length ?? 0) - (a.name?.length ?? 0));

    for (const item of itemsByNameLength) {
      const name = item.name?.trim();
      if (name && combinedText.includes(name)) {
        addId(item.id);
      }
    }
  }

  return resolved;
}

function mapItemIdsToNames(
  itemIds: string[],
  closetItems: ClosetItem[]
): string[] {
  const nameById = new Map(
    closetItems.map((item) => [item.id, item.name?.trim() || "未命名衣物"])
  );

  return itemIds
    .map((id) => nameById.get(id))
    .filter((name): name is string => Boolean(name));
}

function buildSystemPrompt(
  hasStyleProfile: boolean,
  hasPersonalProfile: boolean,
  hasStyleKnowledge: boolean
): string {
  const styleRules = hasStyleProfile
    ? `
- 参考用户风格画像，如果商品与偏好冲突要说明风险`
    : "";

  const personalRules = hasPersonalProfile
    ? `
- 参考用户个人信息与穿衣目标评估商品是否合适
- ${PERSONAL_PROFILE_SAFETY_RULES}`
    : "";

  const knowledgeRules = hasStyleKnowledge
    ? `
- 可参考穿搭知识判断商品是否值得买，但不要原样照抄
- 输出要结合商品属性、已有衣橱、用户偏好、可搭配套数、风格风险
- 不要在用户可见内容中出现知识库编号、style_knowledge_entries、priority、tags、category 等字段名或 UUID
- 若穿搭知识与用户真实衣橱冲突，必须以用户衣橱为准`
    : "";

  return `你是 OutfitAI 的中文购物搭配顾问。
用户想购买一件新商品，请结合用户已有衣橱和风格画像，分析这件商品是否值得买、能搭配多少套、以及具体搭配方案。

规则：
1. 只能从 closet_items 中选择已有衣服
2. 商品本身不是 closet item，不要把商品放进 selected_item_ids
3. selected_item_ids 必须填写 closet_items 中的 id 字段，不能填写衣服名称
4. title、summary、reasons、risks、suitable_styles 中禁止出现 UUID、数据库 id、「id:」「item_id」
5. 用户可见文案只能使用衣服 name 称呼单品
6. compatibility_score 是 0-100 的整数
7. match_count 表示预计可搭配套数
8. outfit_ideas 提供 2-4 套可搭配组合
9. 如果衣橱不够匹配，recommendation 可为 consider 或 skip
10. recommendation 只能是 buy（推荐购买）、consider（谨慎考虑）、skip（不建议购买）
11. 输出中文，必须输出严格 JSON，不要 markdown${styleRules}${personalRules}${knowledgeRules}

JSON 格式：
{
  "compatibility_score": number,
  "match_count": number,
  "suitable_styles": string[],
  "recommendation": "buy" | "consider" | "skip",
  "reasons": string[],
  "risks": string[],
  "outfit_ideas": [
    {
      "title": string,
      "selected_item_ids": string[],
      "summary": string
    }
  ]
}`;
}

function buildUserPrompt(
  input: GenerateShoppingCheckInput,
  retryContext?: GenerateShoppingCheckRetryContext
): string {
  const wardrobe = input.closetItems.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    color: item.color,
    material: item.material,
    style_tags: item.style_tags,
    season_tags: item.season_tags,
    occasion_tags: item.occasion_tags,
    notes: item.notes,
  }));

  let prompt = `想购买的商品分析：
${JSON.stringify(input.product, null, 2)}`;

  const profile = input.styleProfile;
  const styleBlock = formatStyleProfileForPrompt(profile, {
    favoriteItemNames: profile
      ? mapItemIdsToNames(profile.favoriteItemIds, input.closetItems)
      : undefined,
    dislikedItemNames: profile
      ? mapItemIdsToNames(profile.dislikedItemIds, input.closetItems)
      : undefined,
  });

  if (styleBlock) {
    prompt += `\n\n${styleBlock}`;
  }

  const personalBlock = formatPersonalProfileForPrompt(
    input.personalProfile ?? null
  );
  if (personalBlock) {
    prompt += `\n\n${personalBlock}`;
  }

  if (input.product.user_input?.question?.trim()) {
    prompt += `\n\n用户关心的问题：${input.product.user_input.question.trim()}`;
  }

  const styleKnowledgeBlock = formatStyleKnowledgeForPrompt(
    input.styleKnowledge ?? []
  );
  if (styleKnowledgeBlock) {
    prompt += `\n\n${styleKnowledgeBlock}`;
  }

  prompt += `

用户衣橱（closet_items）：
${JSON.stringify(wardrobe, null, 2)}

请分析这件商品与用户衣橱的兼容性，返回严格 JSON。

重要：
- selected_item_ids 必须填写 closet_items 中的 id 字段，不能填写衣服名称
- 如果你在文案中使用衣服名称，对应的 selected_item_ids 仍必须是该衣服的 id
- 用户可见字段只能使用 name，不能出现 id 或 UUID`;

  if (retryContext?.visibleIds) {
    prompt += `\n\n上次返回的用户可见文案包含内部 id / UUID。请重新生成：selected_item_ids 仍用真实 id，但所有用户可见文本只能使用衣服名称。`;
  }

  if (retryContext?.invalidIds) {
    prompt += `\n\n上次返回的 selected_item_ids 无效。请确保每个 selected_item_ids 都使用 closet_items 里的 id 字段（UUID），不要填写衣服名称或自造编号。`;
  }

  return prompt;
}

function normalizeOutfitIdea(
  idea: unknown,
  index: number
): ShoppingOutfitIdea {
  const fallbackTitle = `搭配方案 ${index + 1}`;

  if (!idea || typeof idea !== "object") {
    return {
      title: fallbackTitle,
      selected_item_ids: [],
      summary: "结合衣橱单品与这件新商品的搭配思路。",
    };
  }

  const record = idea as Record<string, unknown>;

  return {
    title:
      typeof record.title === "string" && record.title.trim()
        ? record.title
        : fallbackTitle,
    selected_item_ids: normalizeStringArray(record.selected_item_ids),
    summary:
      typeof record.summary === "string" && record.summary.trim()
        ? record.summary
        : "结合衣橱单品与这件新商品的搭配思路。",
  };
}

function normalizeRecommendation(
  value: unknown
): "buy" | "consider" | "skip" {
  if (typeof value !== "string") {
    return "consider";
  }

  if (PURCHASE_RECOMMENDATIONS.has(value)) {
    return value as "buy" | "consider" | "skip";
  }

  if (value === "yes") {
    return "buy";
  }

  if (value === "no") {
    return "skip";
  }

  if (value === "caution") {
    return "consider";
  }

  return "consider";
}

function normalizeCompatibilityScore(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 50;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeMatchCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

function assertNoVisibleIdsInShoppingResponse(
  parsed: ShoppingCheckAIResponse
): void {
  const texts = [
    ...parsed.reasons,
    ...parsed.risks,
    ...parsed.suitable_styles,
    ...parsed.outfit_ideas.flatMap((idea) => [
      idea.title,
      idea.summary,
    ]),
  ];

  for (const text of texts) {
    if (containsVisibleId(text)) {
      throw new Error("AI 返回包含内部编号，请重新生成");
    }
  }
}

function parseShoppingResponse(content: string): ShoppingCheckAIResponse {
  const trimmed = content.trim();
  const jsonText = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
    : trimmed;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("AI 返回格式异常，请稍后再试");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("AI 返回格式不正确，请稍后再试");
  }

  const record = parsed as Record<string, unknown>;
  const outfitIdeasRaw = Array.isArray(record.outfit_ideas)
    ? record.outfit_ideas
    : [];

  const normalized: ShoppingCheckAIResponse = {
    compatibility_score: normalizeCompatibilityScore(record.compatibility_score),
    match_count: normalizeMatchCount(record.match_count),
    suitable_styles: normalizeStringArray(record.suitable_styles),
    recommendation: normalizeRecommendation(
      record.recommendation ?? record.purchase_recommendation
    ),
    reasons: normalizeStringArray(record.reasons),
    risks: normalizeStringArray(record.risks),
    outfit_ideas: outfitIdeasRaw.map((idea, index) =>
      normalizeOutfitIdea(idea, index)
    ),
  };

  assertNoVisibleIdsInShoppingResponse(normalized);

  return {
    compatibility_score: normalized.compatibility_score,
    match_count: normalized.match_count,
    suitable_styles: normalized.suitable_styles.map(sanitizeVisibleAiText),
    recommendation: normalized.recommendation,
    reasons: normalized.reasons.map(sanitizeVisibleAiText),
    risks: normalized.risks.map(sanitizeVisibleAiText),
    outfit_ideas: normalized.outfit_ideas.map((idea) => ({
      title: sanitizeVisibleAiText(idea.title),
      selected_item_ids: idea.selected_item_ids,
      summary: sanitizeVisibleAiText(idea.summary),
    })),
  };
}

function resolveOutfitIdeaItemIds(
  idea: ShoppingOutfitIdea,
  closetItems: ClosetItem[],
  ideaIndex: number
): string[] {
  const resolved = resolveSelectedItemIds(
    idea.selected_item_ids,
    closetItems,
    [idea.title, idea.summary]
  );

  const validIds = new Set(closetItems.map((item) => item.id));
  const validRawCount = idea.selected_item_ids.filter((id) =>
    validIds.has(id.trim())
  ).length;

  if (resolved.length > 0 && resolved.length !== validRawCount) {
    console.warn("[generateShoppingCheck] resolved item ids from names", {
      ideaIndex: ideaIndex + 1,
      rawCount: idea.selected_item_ids.length,
      resolvedCount: resolved.length,
    });
  }

  return resolved;
}

async function callQwenShoppingCheck(
  input: GenerateShoppingCheckInput,
  retryContext?: GenerateShoppingCheckRetryContext
): Promise<ShoppingCheckAIResponse> {
  const client = createQwenClient();
  const hasStyleProfile = Boolean(
    input.styleProfile && input.styleProfile.feedbackCount > 0
  );
  const hasPersonalProfile = hasPersonalProfileData(
    input.personalProfile ?? null
  );
  const hasStyleKnowledge = Boolean(input.styleKnowledge?.length);

  console.log("[generateShoppingCheck] request start", {
    model: getQwenModel(),
    hasStyleProfile,
    hasPersonalProfile,
    styleKnowledgeCount: input.styleKnowledge?.length ?? 0,
    closetCount: input.closetItems.length,
    retryContext,
  });

  const response = await client.chat.completions.create({
    model: getQwenModel(),
    messages: [
      {
        role: "system",
        content: buildSystemPrompt(
          hasStyleProfile,
          hasPersonalProfile,
          hasStyleKnowledge
        ),
      },
      { role: "user", content: buildUserPrompt(input, retryContext) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Qwen 未返回内容，请稍后再试");
  }

  return parseShoppingResponse(content);
}

export async function generateShoppingCheck(
  input: GenerateShoppingCheckInput
): Promise<ShoppingCheckAIResponse> {
  let retryContext: GenerateShoppingCheckRetryContext | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    let response: ShoppingCheckAIResponse;

    try {
      response = await callQwenShoppingCheck(input, retryContext);
    } catch (error) {
      const errorName = error instanceof Error ? error.name : "UnknownError";
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      console.error("[generateShoppingCheck] callQwenShoppingCheck failed", {
        errorName,
        errorMessage,
        attempt,
      });

      const isVisibleIdError =
        error instanceof Error &&
        error.message === "AI 返回包含内部编号，请重新生成";

      if (isVisibleIdError && attempt === 0) {
        retryContext = { ...retryContext, visibleIds: true };
        continue;
      }

      throw error;
    }

    const resolvedIdeas = response.outfit_ideas.map((idea, index) => ({
      ...idea,
      selected_item_ids: resolveOutfitIdeaItemIds(
        idea,
        input.closetItems,
        index
      ),
    }));

    return {
      ...response,
      outfit_ideas: resolvedIdeas,
    };
  }

  throw new Error("生成购物分析失败，请稍后重试");
}
