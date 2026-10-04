/**
 * 精确自定义标签匹配奖励（确定性、有上限）。
 *
 * 需求中已解析的场景 / 风格词，与衣物 custom_occasion_tags / custom_style_tags
 * 经 normalizeTagForMatch 标准化后“整词相等”才算命中；不做包含或模糊匹配。
 * 奖励只提高进入候选集的机会，不是强制选中条件。
 */
import { normalizeTagForMatch, readCustomTags } from "@/lib/closet/custom-tags";
import type { ClosetItem } from "@/types/database";
import type { RecommendationRequirement } from "@/types/recommendation";

/** 每个命中的自定义场景加分，以及每件衣物的场景奖励上限 */
export const CUSTOM_OCCASION_EXACT_BONUS = 10;
export const CUSTOM_OCCASION_EXACT_MAX = 10;
/** 每个命中的自定义风格加分，以及每件衣物的风格奖励上限 */
export const CUSTOM_STYLE_EXACT_BONUS = 6;
export const CUSTOM_STYLE_EXACT_MAX = 6;
/** 自定义标签奖励总上限 */
export const CUSTOM_TAG_BONUS_MAX = 16;
/** 天气分低于该值视为天气冲突：此时不发放自定义标签奖励 */
export const WEATHER_CONFLICT_THRESHOLD = 50;

export type CustomTagBonusResult = {
  /** 命中的标准化场景标签（去重；仅服务端调试使用） */
  exactCustomOccasionMatches: string[];
  /** 命中的标准化风格标签（去重；仅服务端调试使用） */
  exactCustomStyleMatches: string[];
  customTagBonus: number;
  /** 命中但因天气冲突未发放奖励 */
  suppressedByWeather: boolean;
};

export const EMPTY_CUSTOM_TAG_BONUS: CustomTagBonusResult = {
  exactCustomOccasionMatches: [],
  exactCustomStyleMatches: [],
  customTagBonus: 0,
  suppressedByWeather: false,
};

function exactMatches(terms: readonly string[], tags: readonly string[]): string[] {
  if (terms.length === 0 || tags.length === 0) return [];
  const termSet = new Set(terms.map(normalizeTagForMatch).filter(Boolean));
  const matched = new Set<string>();
  for (const tag of tags) {
    const key = normalizeTagForMatch(tag);
    // 同一标准标签只计算一次
    if (key && termSet.has(key)) matched.add(key);
  }
  return [...matched];
}

export function computeCustomTagBonus(
  item: ClosetItem,
  requirement: Pick<RecommendationRequirement, "exactMatchTerms">,
  weatherScore: number
): CustomTagBonusResult {
  const terms = requirement.exactMatchTerms;
  if (!terms || (terms.occasions.length === 0 && terms.styles.length === 0)) {
    return EMPTY_CUSTOM_TAG_BONUS;
  }
  // readCustomTags 会再次清洗存量数据：指令式 / 非法标签不参与匹配
  const { customStyleTags, customOccasionTags } = readCustomTags(item);
  const occasionMatches = exactMatches(terms.occasions, customOccasionTags);
  const styleMatches = exactMatches(terms.styles, customStyleTags);
  if (occasionMatches.length === 0 && styleMatches.length === 0) {
    return EMPTY_CUSTOM_TAG_BONUS;
  }

  const occasionBonus = Math.min(CUSTOM_OCCASION_EXACT_MAX, occasionMatches.length * CUSTOM_OCCASION_EXACT_BONUS);
  const styleBonus = Math.min(CUSTOM_STYLE_EXACT_MAX, styleMatches.length * CUSTOM_STYLE_EXACT_BONUS);
  const weatherConflict = weatherScore < WEATHER_CONFLICT_THRESHOLD;

  return {
    exactCustomOccasionMatches: occasionMatches,
    exactCustomStyleMatches: styleMatches,
    customTagBonus: weatherConflict ? 0 : Math.min(CUSTOM_TAG_BONUS_MAX, occasionBonus + styleBonus),
    suppressedByWeather: weatherConflict,
  };
}
