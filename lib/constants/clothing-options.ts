export const DEFAULT_CATEGORIES = [
  "上衣",
  "裤子",
  "外套",
  "连衣裙",
  "鞋子",
  "包",
  "配饰",
] as const;

export const DEFAULT_STYLE_TAGS = [
  "简约",
  "休闲",
  "通勤",
  "韩系",
  "复古",
  "街头",
  "温柔",
  "正式",
] as const;

export const DEFAULT_SEASON_TAGS = ["春", "夏", "秋", "冬"] as const;

export const DEFAULT_OCCASION_TAGS = [
  "上班",
  "约会",
  "周末",
  "旅行",
  "聚会",
  "日常",
] as const;

/** @deprecated 使用 DEFAULT_CATEGORIES，保留以兼容旧引用 */
export const CLOSET_CATEGORIES = DEFAULT_CATEGORIES;

/** @deprecated 使用 DEFAULT_STYLE_TAGS */
export const CLOSET_STYLE_TAGS = DEFAULT_STYLE_TAGS;

/** @deprecated 使用 DEFAULT_SEASON_TAGS */
export const CLOSET_SEASON_TAGS = DEFAULT_SEASON_TAGS;

/** @deprecated 使用 DEFAULT_OCCASION_TAGS */
export const CLOSET_OCCASION_TAGS = DEFAULT_OCCASION_TAGS;
