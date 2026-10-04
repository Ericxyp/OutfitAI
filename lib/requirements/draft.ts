/**
 * 需求草稿运行时校验（纯函数，客户端恢复与服务端确认共用）。
 * 客户端回传的草稿一律视为不可信数据，必须经过这里重新校验。
 */
import { recomputeDateOffset } from "@/lib/requirements/date";
import {
  ACTIVITIES,
  CLARIFIABLE_FIELDS,
  DISLIKED_STYLE_VOCAB,
  DURATIONS,
  FORMALITIES,
  OCCASIONS,
  PARTS_OF_DAY,
  REQUIREMENT_LIMITS,
  SPECIAL_REQUIREMENTS,
  STYLE_VOCAB,
  clampConfidence,
  isIsoDate,
  isRecord,
  isSafeIdString,
  pickEnum,
  pickEnumArray,
  pickTextArray,
  sanitizeShortText,
} from "@/lib/requirements/schema";
import { normalizeWeatherLocationInput } from "@/lib/weather-location";
import { sanitizeSemanticPreferences } from "@/lib/requirements/extraction";
import type { OutfitRequirement, RequirementDate, RequirementLocation } from "@/types/requirement";

// ---------------- 草稿校验（客户端回传的数据不可信） ----------------

const LOCATION_SOURCES = ["text", "current_location", "manual_city", "none"] as const;
const WEATHER_STATUSES = ["available", "unavailable", "not_found", "out_of_range", "skipped"] as const;

export function sanitizeRequestText(value: unknown, max: number = REQUIREMENT_LIMITS.requestTextMax): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .slice(0, max * 2)
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F\u2028\u2029\u202A-\u202E\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return cleaned.slice(0, max);
}

export function sanitizeLocation(value: unknown): RequirementLocation | null {
  if (!isRecord(value)) return null;
  const source = pickEnum(value.source, LOCATION_SOURCES);
  const weatherStatus = pickEnum(value.weatherStatus, WEATHER_STATUSES);
  const displayName = sanitizeShortText(value.displayName, 60);
  if (!source || !weatherStatus || !displayName) return null;
  const weatherLocation =
    value.weatherLocation === null || value.weatherLocation === undefined
      ? null
      : normalizeWeatherLocationInput(value.weatherLocation);
  if (source !== "none" && !weatherLocation) return null;
  return {
    source,
    displayName,
    placeName: sanitizeShortText(value.placeName, REQUIREMENT_LIMITS.placeNameMax),
    weatherLocation: source === "none" ? null : weatherLocation,
    weatherStatus,
  };
}

function sanitizeDate(value: unknown, now: Date, timeZone: string): RequirementDate | null {
  if (!isRecord(value) || !isIsoDate(value.iso)) return null;
  const offset = recomputeDateOffset(value.iso, now, timeZone);
  if (offset === null) return null;
  return {
    iso: value.iso,
    raw: sanitizeShortText(value.raw, REQUIREMENT_LIMITS.dateRawMax) ?? "未指定",
    offsetDays: offset,
    partOfDay: pickEnum(value.partOfDay, PARTS_OF_DAY),
  };
}

/**
 * 运行时校验客户端回传的需求草稿：枚举、长度、日期是否过期、位置结构；
 * dislikedItemIds 只保留属于当前用户衣橱的 ID。
 * 返回 null 表示结构不可用。
 */
export function sanitizeRequirement(
  value: unknown,
  options: { now: Date; timeZone: string; closetItemIds: Set<string> | null }
): { requirement: OutfitRequirement; dateExpired: boolean } | null {
  if (!isRecord(value) || value.version !== 1) return null;
  const originalText = sanitizeRequestText(value.originalText);
  if (!originalText) return null;

  const date = sanitizeDate(value.date, options.now, options.timeZone);
  const dateExpired = isRecord(value.date) && date === null;

  const confidenceRaw = isRecord(value.confidence) ? value.confidence : {};
  const confidence = {
    occasion: clampConfidence(confidenceRaw.occasion) ?? 0,
    date: clampConfidence(confidenceRaw.date) ?? 0,
    location: clampConfidence(confidenceRaw.location) ?? 0,
  };

  const dislikedItemIds = Array.isArray(value.dislikedItemIds)
    ? value.dislikedItemIds
        .filter(isSafeIdString)
        .filter((id) => options.closetItemIds?.has(id) ?? false)
        .slice(0, REQUIREMENT_LIMITS.dislikedItemMax)
    : [];

  return {
    dateExpired,
    requirement: {
      version: 1,
      originalText,
      occasion: pickEnum(value.occasion, OCCASIONS),
      location: sanitizeLocation(value.location),
      date,
      style: pickEnumArray(value.style, STYLE_VOCAB, REQUIREMENT_LIMITS.styleMax),
      formality: pickEnum(value.formality, FORMALITIES),
      activity: pickEnum(value.activity, ACTIVITIES),
      duration: pickEnum(value.duration, DURATIONS),
      specialRequirements: pickEnumArray(value.specialRequirements, SPECIAL_REQUIREMENTS, REQUIREMENT_LIMITS.specialMax),
      colorPreferences: pickTextArray(value.colorPreferences, REQUIREMENT_LIMITS.colorMax, 8),
      dislikedStyles: pickEnumArray(value.dislikedStyles, DISLIKED_STYLE_VOCAB, REQUIREMENT_LIMITS.dislikedStyleMax),
      // 旧版草稿没有该字段时按空数组处理
      semanticPreferences: sanitizeSemanticPreferences(value.semanticPreferences),
      dislikedItemIds,
      assumptions: pickTextArray(value.assumptions, REQUIREMENT_LIMITS.assumptionMax, REQUIREMENT_LIMITS.assumptionTextMax),
      confidence,
      missingCriticalFields: pickEnumArray(value.missingCriticalFields, ["occasion", "date", "location"] as const, 3),
      ambiguousFields: pickEnumArray(value.ambiguousFields, CLARIFIABLE_FIELDS, CLARIFIABLE_FIELDS.length),
    },
  };
}

