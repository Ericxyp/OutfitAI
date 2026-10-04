/**
 * 需求确认 Agent：字段枚举、上限与运行时 Schema 校验。
 *
 * 所有来自模型或客户端的数据都必须经过这里的校验函数，
 * 校验通过后才能进入推荐工作流。本文件不含任何密钥或网络调用，客户端可安全引用。
 */
import { validateCityInput } from "@/lib/weather-location";

// ---------------- 枚举 ----------------

export const OCCASIONS = [
  "commute",
  "business",
  "interview",
  "date",
  "party",
  "outdoor_leisure",
  "sports",
  "travel",
  "shopping",
  "formal_event",
  "daily",
] as const;
export type Occasion = (typeof OCCASIONS)[number];

/** 标签同时包含 rule-engine 的关键词（通勤/约会/运动/日常…），确保确认后的需求能命中现有规则召回 */
export const OCCASION_LABELS: Record<Occasion, string> = {
  commute: "上班通勤",
  business: "商务会议",
  interview: "面试",
  date: "约会",
  party: "朋友聚会",
  outdoor_leisure: "户外休闲",
  sports: "运动健身",
  travel: "旅行出游",
  shopping: "逛街",
  formal_event: "正式活动（婚礼/典礼）",
  daily: "日常休闲",
};

export const FORMALITIES = [
  "casual",
  "smart_casual",
  "business_casual",
  "formal",
] as const;
export type Formality = (typeof FORMALITIES)[number];

export const FORMALITY_LABELS: Record<Formality, string> = {
  casual: "休闲",
  smart_casual: "休闲精致",
  business_casual: "商务休闲",
  formal: "正式",
};

export const ACTIVITIES = [
  "walking",
  "sports",
  "photography",
  "dating",
  "dining",
  "working",
  "shopping",
  "sightseeing",
  "party",
] as const;
export type Activity = (typeof ACTIVITIES)[number];

export const ACTIVITY_LABELS: Record<Activity, string> = {
  walking: "散步",
  sports: "运动",
  photography: "拍照",
  dating: "约会",
  dining: "吃饭",
  working: "工作",
  shopping: "逛街",
  sightseeing: "游览",
  party: "聚会",
};

export const DURATIONS = ["short", "half_day", "full_day"] as const;
export type Duration = (typeof DURATIONS)[number];

export const DURATION_LABELS: Record<Duration, string> = {
  short: "1-2 小时",
  half_day: "半天",
  full_day: "一整天",
};

export const PARTS_OF_DAY = ["morning", "noon", "afternoon", "evening"] as const;
export type PartOfDay = (typeof PARTS_OF_DAY)[number];

export const PART_OF_DAY_LABELS: Record<PartOfDay, string> = {
  morning: "上午",
  noon: "中午",
  afternoon: "下午",
  evening: "晚上",
};

/** 风格词表：与 rule-engine 的 STYLE_KEYWORDS 对齐，并补充可执行的视觉约束 */
export const STYLE_VOCAB = [
  "简约",
  "休闲",
  "通勤",
  "韩系",
  "日系",
  "复古",
  "街头",
  "温柔",
  "正式",
  "显瘦",
  "优雅",
  "精致",
  "舒适",
  "运动",
  "甜美",
  "酷",
  "中性",
  "文艺",
  "低饱和",
  "少图案",
  "亮色",
] as const;
export type StyleTag = (typeof STYLE_VOCAB)[number];

/** 明确不喜欢的风格（如“别太花” → 花哨、高饱和、大面积图案） */
export const DISLIKED_STYLE_VOCAB = [
  "花哨",
  "高饱和",
  "大面积图案",
  "过于正式",
  "过于休闲",
  "紧身",
  "暴露",
  "厚重",
  "运动风",
  "甜美",
  "街头",
  "复古",
] as const;
export type DislikedStyle = (typeof DISLIKED_STYLE_VOCAB)[number];

export const SPECIAL_REQUIREMENTS = [
  "warm",
  "rain_proof",
  "sun_protection",
  "breathable",
  "comfortable_shoes",
  "stain_resistant",
  "easy_movement",
] as const;
export type SpecialRequirement = (typeof SPECIAL_REQUIREMENTS)[number];

export const SPECIAL_REQUIREMENT_LABELS: Record<SpecialRequirement, string> = {
  warm: "保暖",
  rain_proof: "防雨",
  sun_protection: "防晒",
  breathable: "透气",
  comfortable_shoes: "鞋子好走",
  stain_resistant: "耐脏",
  easy_movement: "方便活动",
};

export const CRITICAL_FIELDS = ["occasion", "date", "location"] as const;
export type CriticalField = (typeof CRITICAL_FIELDS)[number];

export const CLARIFIABLE_FIELDS = [
  "occasion",
  "date",
  "location",
  "activity",
] as const;
export type ClarifiableField = (typeof CLARIFIABLE_FIELDS)[number];

// ---------------- 上限 ----------------

export const REQUIREMENT_LIMITS = {
  requestTextMax: 300,
  answerTextMax: 120,
  placeNameMax: 30,
  shortTextMax: 20,
  styleMax: 6,
  dislikedStyleMax: 6,
  specialMax: 5,
  colorMax: 5,
  dislikedItemMax: 10,
  dislikedItemNameMax: 5,
  /** 无法映射到枚举的长尾表达（如“法式松弛感”），作为语义偏好保留 */
  semanticPreferenceMax: 4,
  assumptionMax: 6,
  assumptionTextMax: 60,
  dateRawMax: 20,
  maxClarificationRounds: 2,
  maxQuestionsPerRound: 2,
  /** 模型原始响应最大字节数，超出视为格式错误 */
  modelResponseMax: 4000,
} as const;

// ---------------- 通用校验工具 ----------------

const CONTROL_CHARS =
  /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF]/g;
const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 用户可见短文本清洗：去控制字符、URL、代码/标签符号，折叠空白并截断 */
export function sanitizeShortText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .slice(0, maxLength * 4)
    .replace(CONTROL_CHARS, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[<>{}`\\[\]$]/g, " ")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || UUID_PATTERN.test(cleaned)) return null;
  return cleaned.slice(0, maxLength);
}

export function pickEnum<T extends string>(
  value: unknown,
  allowed: readonly T[]
): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

export function pickEnumArray<T extends string>(
  value: unknown,
  allowed: readonly T[],
  max: number
): T[] {
  if (!Array.isArray(value)) return [];
  const result: T[] = [];
  for (const item of value.slice(0, 50)) {
    const picked = pickEnum(item, allowed);
    if (picked && !result.includes(picked)) result.push(picked);
    if (result.length >= max) break;
  }
  return result;
}

export function pickTextArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const item of value.slice(0, 50)) {
    const text = sanitizeShortText(item, maxLength);
    if (text && !result.includes(text)) result.push(text);
    if (result.length >= maxItems) break;
  }
  return result;
}

export function clampConfidence(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}

export function uniqueMerge<T>(base: readonly T[], extra: readonly T[], max: number): T[] {
  const result: T[] = [];
  for (const item of [...base, ...extra]) {
    if (!result.includes(item)) result.push(item);
    if (result.length >= max) break;
  }
  return result;
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

export function isValidCityText(value: unknown): value is string {
  return validateCityInput(value).ok;
}

const SAFE_ID_PATTERN = /^[0-9a-f-]{8,64}$/i;
export function isSafeIdString(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID_PATTERN.test(value);
}
