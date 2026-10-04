/**
 * 需求确认埋点 metadata 白名单：只允许枚举、数字、布尔值，
 * 不记录聊天原文、地点原文、API Key 或个人信息。
 */
import {
  CLARIFIABLE_FIELDS,
  CRITICAL_FIELDS,
  OCCASIONS,
  pickEnum,
  pickEnumArray,
} from "@/lib/requirements/schema";

export const REQUIREMENT_EVENT_NAMES = [
  "requirement_extraction_started",
  "requirement_extraction_succeeded",
  "requirement_extraction_failed",
  "requirement_clarification_requested",
  "requirement_clarification_answered",
  "requirement_confirmation_shown",
  "requirement_confirmed",
  "requirement_modified",
  "requirement_cancelled",
  "requirement_fallback_used",
] as const;
export type RequirementEventName = (typeof REQUIREMENT_EVENT_NAMES)[number];

/** 客户端可以上报的事件（其余事件只在服务端产生） */
export const CLIENT_REQUIREMENT_EVENTS = ["requirement_modified", "requirement_cancelled"] as const;
export type ClientRequirementEvent = (typeof CLIENT_REQUIREMENT_EVENTS)[number];

export const REQUIREMENT_STAGES = ["clarification", "confirmation", "generating"] as const;

const STATUS_VALUES = ["needs_clarification", "ready_for_confirmation", "error"] as const;
const ERROR_TYPES = [
  "unauthorized",
  "invalid_input",
  "unavailable",
  "invalid_draft",
  "date_expired",
  "missing_fields",
  "generation_failed",
] as const;
const FALLBACK_REASONS = ["model_unavailable", "invalid_output", "model_disabled"] as const;
const WEATHER_STATUSES = ["available", "unavailable", "not_found", "out_of_range", "skipped"] as const;
const LOCATION_SOURCES = ["text", "current_location", "manual_city", "none"] as const;
const ANSWER_KINDS = ["option", "text", "skip"] as const;

export type RequirementEventMetadataInput = {
  status?: unknown;
  round?: unknown;
  durationMs?: unknown;
  usedModel?: unknown;
  usedFallback?: unknown;
  fallbackReason?: unknown;
  modelAttempts?: unknown;
  missingFields?: unknown;
  ambiguousFields?: unknown;
  questionFields?: unknown;
  answerKind?: unknown;
  errorType?: unknown;
  weatherStatus?: unknown;
  locationSource?: unknown;
  assumptionCount?: unknown;
  occasion?: unknown;
  dateOffset?: unknown;
  excludedCount?: unknown;
  stage?: unknown;
  hasContextLocation?: unknown;
};

function safeInt(value: unknown, max: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(max, Math.round(value)))
    : undefined;
}

function safeBool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function buildRequirementEventMetadata(
  input: RequirementEventMetadataInput
): Record<string, string | number | boolean | string[]> {
  const entries: Array<[string, string | number | boolean | string[] | null | undefined]> = [
    ["feature", "requirement"],
    ["status", pickEnum(input.status, STATUS_VALUES)],
    ["round", safeInt(input.round, 10)],
    ["durationMs", safeInt(input.durationMs, 120000)],
    ["usedModel", safeBool(input.usedModel)],
    ["usedFallback", safeBool(input.usedFallback)],
    ["fallbackReason", pickEnum(input.fallbackReason, FALLBACK_REASONS)],
    ["modelAttempts", safeInt(input.modelAttempts, 10)],
    ["missingFields", input.missingFields === undefined ? undefined : pickEnumArray(input.missingFields, CRITICAL_FIELDS, 3)],
    ["ambiguousFields", input.ambiguousFields === undefined ? undefined : pickEnumArray(input.ambiguousFields, CLARIFIABLE_FIELDS, 4)],
    ["questionFields", input.questionFields === undefined ? undefined : pickEnumArray(input.questionFields, CLARIFIABLE_FIELDS, 4)],
    ["answerKind", pickEnum(input.answerKind, ANSWER_KINDS)],
    ["errorType", pickEnum(input.errorType, ERROR_TYPES)],
    ["weatherStatus", pickEnum(input.weatherStatus, WEATHER_STATUSES)],
    ["locationSource", pickEnum(input.locationSource, LOCATION_SOURCES)],
    ["assumptionCount", safeInt(input.assumptionCount, 10)],
    ["occasion", pickEnum(input.occasion, OCCASIONS)],
    ["dateOffset", safeInt(input.dateOffset, 60)],
    ["excludedCount", safeInt(input.excludedCount, 20)],
    ["stage", pickEnum(input.stage, REQUIREMENT_STAGES)],
    ["hasContextLocation", safeBool(input.hasContextLocation)],
  ];
  const result: Record<string, string | number | boolean | string[]> = {};
  for (const [key, value] of entries) {
    if (value !== undefined && value !== null) result[key] = value;
  }
  return result;
}
