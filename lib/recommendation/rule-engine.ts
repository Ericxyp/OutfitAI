import type { ClosetItem } from "@/types/database";
import type { StyleProfileContext } from "@/lib/memory/style-profile";
import type {
  RecommendationRequirement,
  ScoreBreakdown,
  ScoredClosetItem,
} from "@/types/recommendation";
import type { WeatherContext } from "@/types/weather";

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
  requestText: string
): RecommendationRequirement {
  const occasionHints: string[] = [];
  const styleHints: string[] = [];

  for (const { pattern, hints } of OCCASION_KEYWORD_MAP) {
    if (pattern.test(requestText)) {
      occasionHints.push(...hints);
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
  const text = itemSearchText(item);

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

  for (const hint of requirement.styleHints) {
    if (itemStyles.includes(hint) || text.includes(hint.toLowerCase())) {
      score += 10;
      reasons.push(`风格需求匹配：${hint}`);
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

  const matchedReasons = [
    ...occasion.reasons,
    ...style.reasons,
    ...weather.reasons,
    ...color.reasons,
    ...userPreference.reasons,
  ].slice(0, 6);

  return {
    item,
    ruleScore: breakdown.total,
    matchedReasons,
    breakdown,
  };
}
