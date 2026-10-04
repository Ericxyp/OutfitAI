import type { ClosetItem } from "@/types/database";
import type { StyleProfileContext } from "@/lib/memory/style-profile";
import type {
  RecommendationRequirement,
  RequirementMatchTerms,
  ScoreBreakdown,
  ScoredClosetItem,
} from "@/types/recommendation";
import type { WeatherContext } from "@/types/weather";
import {
  getSupplementalCanonicalTags,
  normalizeTagForMatch,
  validateCustomTag,
} from "@/lib/closet/custom-tags";
import { computeCustomTagBonus } from "@/lib/recommendation/custom-tag-bonus";

/** 结构化需求词数量上限（每类） */
const MAX_STRUCTURED_TERMS = 8;

function normalizeTerms(values: readonly unknown[]): string[] {
  const result: string[] = [];
  for (const value of values) {
    const key = normalizeTagForMatch(value);
    if (key && !result.includes(key)) result.push(key);
  }
  return result;
}

/** 来自需求确认 Agent 的结构化词：与自定义标签同一套校验，非法内容丢弃 */
export function sanitizeRequirementTerms(raw: unknown): RequirementMatchTerms {
  const pick = (value: unknown) =>
    Array.isArray(value)
      ? value
          .slice(0, 20)
          .map((entry) => validateCustomTag(entry))
          .flatMap((result) => (result.ok ? [result.tag] : []))
          .slice(0, MAX_STRUCTURED_TERMS)
      : [];
  const record = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return { occasions: pick(record.occasions), styles: pick(record.styles) };
}

export type ClosetItemScoreContext = {
  requirement: RecommendationRequirement;
  weatherContext: WeatherContext | null;
  styleProfile: StyleProfileContext | null;
};

const OCCASION_WEIGHT = 0.3;
const STYLE_WEIGHT = 0.25;
const WEATHER_WEIGHT = 0.2;
const COLOR_WEIGHT = 0.15;
const USER_PREFERENCE_WEIGHT = 0.1;
/**
 * 自定义标签映射到系统标签后的“弱补充”加分：
 * 低于系统标签命中（+12 / +10）和文本命中（+8），且只在系统标签未命中时生效。
 */
const CUSTOM_CANONICAL_BONUS = 4;

const BASE_COLORS = ["黑", "白", "灰", "米", "蓝", "杏", "卡其", "藏青"];

const OCCASION_KEYWORD_MAP: Array<{ pattern: RegExp; hints: string[] }> = [
  { pattern: /上班|通勤|面试|商务|职场|开会/, hints: ["上班", "通勤", "正式", "简约"] },
  { pattern: /约会|见面|晚餐|浪漫/, hints: ["约会", "温柔", "优雅", "精致"] },
  { pattern: /旅行|拍照|城市漫游|出游|逛街/, hints: ["旅行", "休闲", "街头", "舒适"] },
  { pattern: /运动|徒步|户外|跑步|健身/, hints: ["运动", "户外", "舒适"] },
  { pattern: /周末|咖啡|日常/, hints: ["日常", "休闲", "周末"] },
  { pattern: /聚会|派对|活动/, hints: ["聚会", "精致"] },
];

const STYLE_KEYWORDS = [
  "简约",
  "休闲",
  "通勤",
  "韩系",
  "复古",
  "街头",
  "温柔",
  "正式",
  "显瘦",
  "优雅",
  "精致",
  "舒适",
];

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function itemSearchText(item: ClosetItem): string {
  return [
    item.name,
    item.category,
    item.color,
    item.material,
    item.notes,
    ...(item.style_tags ?? []),
    ...(item.season_tags ?? []),
    ...(item.occasion_tags ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function parseRecommendationRequirement(
  requestText: string,
  structuredTerms?: RequirementMatchTerms | null
): RecommendationRequirement {
  const occasionHints: string[] = [];
  const styleHints: string[] = [];
  /** 固定关键词表中实际命中的原词（如“健身”），用于精确自定义标签匹配 */
  const occasionKeywords: string[] = [];

  for (const { pattern, hints } of OCCASION_KEYWORD_MAP) {
    if (pattern.test(requestText)) {
      occasionHints.push(...hints);
      for (const match of requestText.matchAll(new RegExp(pattern.source, "g"))) {
        occasionKeywords.push(match[0]);
      }
    }
  }

  for (const style of STYLE_KEYWORDS) {
    if (requestText.includes(style)) {
      styleHints.push(style);
    }
  }

  if (occasionHints.length === 0) {
    occasionHints.push("日常", "休闲");
  }

  return {
    rawText: requestText,
    occasionHints: [...new Set(occasionHints)],
    styleHints: [...new Set(styleHints)],
    exactMatchTerms: {
      // 默认补充的“日常 / 休闲”不参与精确匹配，避免模糊需求触发奖励
      occasions: normalizeTerms([...occasionKeywords, ...(structuredTerms?.occasions ?? [])]),
      styles: normalizeTerms([...styleHints, ...(structuredTerms?.styles ?? [])]),
    },
  };
}

export function scoreOccasionMatch(
  item: ClosetItem,
  requirement: RecommendationRequirement
): { score: number; reasons: string[] } {
  let score = 45;
  const reasons: string[] = [];
  const itemTags = [
    ...(item.occasion_tags ?? []),
    ...(item.style_tags ?? []),
  ];
  // 注意：itemSearchText 不包含自定义标签原文，自定义文本无法通过关键词影响规则 / 天气评分
  const text = itemSearchText(item);
  const supplemental = getSupplementalCanonicalTags(item);

  for (const hint of requirement.occasionHints) {
    const tagHit = itemTags.some(
      (tag) => tag.includes(hint) || hint.includes(tag)
    );
    const textHit = text.includes(hint.toLowerCase());

    if (tagHit) {
      score += 12;
      reasons.push(`场合标签匹配：${hint}`);
    } else if (textHit) {
      score += 8;
      reasons.push(`场合语义匹配：${hint}`);
    } else if (
      supplemental.occasions.some((tag) => tag.includes(hint) || hint.includes(tag)) ||
      supplemental.styles.some((tag) => tag.includes(hint) || hint.includes(tag))
    ) {
      score += CUSTOM_CANONICAL_BONUS;
      reasons.push(`自定义标签映射：${hint}`);
    }
  }

  return { score: clampScore(score), reasons };
}

export function scoreStyleMatch(
  item: ClosetItem,
  styleProfile: StyleProfileContext | null,
  requirement: RecommendationRequirement
): { score: number; reasons: string[] } {
  let score = 45;
  const reasons: string[] = [];
  const itemStyles = item.style_tags ?? [];
  const text = itemSearchText(item);

  const supplementalStyles = getSupplementalCanonicalTags(item).styles as string[];
  for (const hint of requirement.styleHints) {
    if (itemStyles.includes(hint) || text.includes(hint.toLowerCase())) {
      score += 10;
      reasons.push(`风格需求匹配：${hint}`);
    } else if (supplementalStyles.includes(hint)) {
      score += CUSTOM_CANONICAL_BONUS;
      reasons.push(`自定义风格映射：${hint}`);
    }
  }

  if (styleProfile) {
    for (const preferred of styleProfile.preferredStyles) {
      if (itemStyles.includes(preferred) || text.includes(preferred.toLowerCase())) {
        score += 12;
        reasons.push(`偏好风格：${preferred}`);
      }
    }

    for (const avoid of styleProfile.avoidStyles) {
      if (itemStyles.includes(avoid) || text.includes(avoid.toLowerCase())) {
        score -= 18;
        reasons.push(`避免风格：${avoid}`);
      }
    }
  }

  return { score: clampScore(score), reasons };
}

export function scoreWeatherMatch(
  item: ClosetItem,
  weatherContext: WeatherContext | null
): { score: number; reasons: string[] } {
  if (!weatherContext) {
    return { score: 50, reasons: ["天气不可用，中性分"] };
  }

  let score = 50;
  const reasons: string[] = [];
  const text = itemSearchText(item);
  const temp = weatherContext.temperatureC;
  const condition = weatherContext.condition.toLowerCase();

  if (temp >= 28) {
    if (/棉|麻|薄|透|短袖|夏季|裙|短裤/.test(text)) {
      score += 18;
      reasons.push("高温天气适配轻薄单品");
    }
    if (/羽绒|毛呢|厚|羊毛|冬季|靴|抓绒/.test(text)) {
      score -= 22;
      reasons.push("高温天气不适合厚重单品");
    }
  } else if (temp <= 12) {
    if (/外套|针织|毛衣|保暖|冬季|厚|羽绒/.test(text)) {
      score += 18;
      reasons.push("低温天气适配保暖单品");
    }
    if (/短袖|薄|夏季|吊带/.test(text)) {
      score -= 18;
      reasons.push("低温天气不适合薄款单品");
    }
  }

  if (/雨|雷|阵雨/.test(condition)) {
    if (/防水|外套|靴|深色|风衣/.test(text)) {
      score += 14;
      reasons.push("雨天适配防雨耐脏单品");
    }
    if (/麂皮|浅色|拖地|帆布/.test(text)) {
      score -= 14;
      reasons.push("雨天不太适合易脏单品");
    }
  }

  if (/风/.test(condition)) {
    if (/外套|夹克|长裤|风衣/.test(text)) {
      score += 10;
      reasons.push("大风天气适合外套长裤");
    }
  }

  return { score: clampScore(score), reasons };
}

export function scoreColorHarmony(
  item: ClosetItem,
  context: ClosetItemScoreContext
): { score: number; reasons: string[] } {
  let score = 50;
  const reasons: string[] = [];
  const color = (item.color ?? "").toLowerCase();

  if (!color) {
    return { score, reasons };
  }

  if (BASE_COLORS.some((base) => color.includes(base.toLowerCase()))) {
    score += 10;
    reasons.push("基础色易搭配");
  }

  const profile = context.styleProfile;
  if (profile) {
    for (const preferred of profile.preferredColors) {
      if (color.includes(preferred.toLowerCase())) {
        score += 12;
        reasons.push(`偏好颜色：${preferred}`);
      }
    }

    for (const avoid of profile.avoidColors) {
      if (color.includes(avoid.toLowerCase())) {
        score -= 15;
        reasons.push(`避免颜色：${avoid}`);
      }
    }
  }

  return { score: clampScore(score), reasons };
}

export function scoreUserPreference(
  item: ClosetItem,
  styleProfile: StyleProfileContext | null
): { score: number; reasons: string[] } {
  let score = 50;
  const reasons: string[] = [];

  if (!styleProfile || styleProfile.feedbackCount <= 0) {
    return { score, reasons };
  }

  if (styleProfile.favoriteItemIds.includes(item.id)) {
    score += 25;
    reasons.push("用户喜欢的单品");
  }

  if (styleProfile.dislikedItemIds.includes(item.id)) {
    score -= 60;
    reasons.push("用户不喜欢的单品");
  }

  const color = (item.color ?? "").toLowerCase();
  for (const preferred of styleProfile.preferredColors) {
    if (color && color.includes(preferred.toLowerCase())) {
      score += 8;
      reasons.push(`偏好颜色：${preferred}`);
    }
  }

  for (const avoid of styleProfile.avoidColors) {
    if (color && color.includes(avoid.toLowerCase())) {
      score -= 12;
      reasons.push(`避免颜色：${avoid}`);
    }
  }

  for (const occasion of styleProfile.preferredOccasions) {
    if ((item.occasion_tags ?? []).includes(occasion)) {
      score += 8;
      reasons.push(`常用场景：${occasion}`);
    }
  }

  return { score: clampScore(score), reasons };
}

export function scoreClosetItem(
  item: ClosetItem,
  context: ClosetItemScoreContext
): ScoredClosetItem {
  const occasion = scoreOccasionMatch(item, context.requirement);
  const style = scoreStyleMatch(
    item,
    context.styleProfile,
    context.requirement
  );
  const weather = scoreWeatherMatch(item, context.weatherContext);
  const color = scoreColorHarmony(item, context);
  const userPreference = scoreUserPreference(item, context.styleProfile);

  const breakdown: ScoreBreakdown = {
    occasion: occasion.score,
    style: style.score,
    weather: weather.score,
    color: color.score,
    userPreference: userPreference.score,
    total: clampScore(
      occasion.score * OCCASION_WEIGHT +
        style.score * STYLE_WEIGHT +
        weather.score * WEATHER_WEIGHT +
        color.score * COLOR_WEIGHT +
        userPreference.score * USER_PREFERENCE_WEIGHT
    ),
  };

  // 精确自定义标签奖励：加在规则分上，发生在 pickBalancedCandidates 截断之前；
  // 天气冲突（weather < 50）时不发放，避免仅凭自定义标签把不适合天气的单品推到前面。
  const customTag = computeCustomTagBonus(item, context.requirement, weather.score);
  const customTagReasons: string[] = [];
  if (customTag.customTagBonus > 0) {
    customTagReasons.push(`自定义标签精确匹配 +${customTag.customTagBonus}`);
  }

  const matchedReasons = [
    ...customTagReasons,
    ...occasion.reasons,
    ...style.reasons,
    ...weather.reasons,
    ...color.reasons,
    ...userPreference.reasons,
  ].slice(0, 6);

  const hasCustomMatch =
    customTag.exactCustomOccasionMatches.length > 0 || customTag.exactCustomStyleMatches.length > 0;

  return {
    item,
    // breakdown.total 保持原口径（0–100）；排序分 = 原规则分 + 有上限的奖励
    ruleScore: breakdown.total + customTag.customTagBonus,
    matchedReasons,
    breakdown,
    ...(hasCustomMatch ? { customTag: { ...customTag, baseRuleScore: breakdown.total } } : {}),
  };
}
