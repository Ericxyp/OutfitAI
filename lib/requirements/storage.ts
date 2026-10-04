/**
 * 需求草稿的会话级恢复（sessionStorage）。
 *
 * 恢复策略：
 * - 只保存“等待用户操作”的稳定状态（needs_clarification / ready_for_confirmation）；
 *   提取、校验、生成中的请求不恢复，刷新后回到上一个稳定状态；
 * - 按 Supabase user.id 隔离：outfitai.requirement.draft:${userId}；未登录不保存；
 * - 带版本号与 30 分钟有效期，过期 / 结构非法直接删除；
 * - 使用 sessionStorage 而非 localStorage：关闭标签页即清除，避免需求原文长期留存；
 * - 恢复后的草稿在确认时仍会由服务端重新完整校验。
 */
import { sanitizeRequirement } from "@/lib/requirements/draft";
import { normalizeTimeZone } from "@/lib/requirements/date";
import {
  CLARIFIABLE_FIELDS,
  REQUIREMENT_LIMITS,
  isRecord,
  pickEnum,
  sanitizeShortText,
} from "@/lib/requirements/schema";
import type { RestorableDraft } from "@/lib/requirements/flow-state";
import type {
  ClarificationQuestion,
  RequirementWeatherPreview,
} from "@/types/requirement";

export const REQUIREMENT_DRAFT_STORAGE_PREFIX = "outfitai.requirement.draft:";
export const REQUIREMENT_DRAFT_VERSION = 1;
export const REQUIREMENT_DRAFT_TTL_MS = 30 * 60 * 1000;
const MAX_RAW_LENGTH = 12000;

export type DraftStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function getRequirementDraftStorageKey(userId: string | null | undefined): string | null {
  if (typeof userId !== "string") return null;
  const trimmed = userId.trim();
  if (!trimmed || trimmed.length > 128 || /\s/.test(trimmed)) return null;
  return `${REQUIREMENT_DRAFT_STORAGE_PREFIX}${trimmed}`;
}

function parseQuestions(value: unknown): ClarificationQuestion[] | null {
  if (!Array.isArray(value) || value.length > REQUIREMENT_LIMITS.maxQuestionsPerRound) return null;
  const questions: ClarificationQuestion[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return null;
    const field = pickEnum(raw.field, CLARIFIABLE_FIELDS);
    const question = sanitizeShortText(raw.question, 80);
    if (!field || !question || !Array.isArray(raw.options) || raw.options.length > 8) return null;
    const options = raw.options.map((option) => {
      if (!isRecord(option)) return null;
      const optionField = pickEnum(option.field, CLARIFIABLE_FIELDS);
      const label = sanitizeShortText(option.label, 20);
      const optionValue = sanitizeShortText(option.value, 30);
      return optionField && label && optionValue ? { field: optionField, label, value: optionValue } : null;
    });
    if (options.some((option) => option === null)) return null;
    questions.push({
      field,
      question,
      options: options as ClarificationQuestion["options"],
      allowFreeText: raw.allowFreeText !== false,
    });
  }
  return questions;
}

const WEATHER_STATUSES = ["available", "unavailable", "not_found", "out_of_range", "skipped"] as const;

function parseWeather(value: unknown): RequirementWeatherPreview | null {
  if (!isRecord(value)) return null;
  const status = pickEnum(value.status, WEATHER_STATUSES);
  if (!status) return null;
  let summary: RequirementWeatherPreview["summary"] = null;
  if (isRecord(value.summary)) {
    const temperatureC = value.summary.temperatureC;
    const condition = sanitizeShortText(value.summary.condition, 20);
    if (typeof temperatureC !== "number" || !Number.isFinite(temperatureC) || !condition) return null;
    summary = {
      temperatureC,
      condition,
      locationName: sanitizeShortText(value.summary.locationName, 40) ?? undefined,
    };
  }
  return { status, summary, note: sanitizeShortText(value.note, 80) };
}

export function parseStoredRequirementDraft(
  raw: string | null,
  options: { now: Date; timeZone?: string }
): RestorableDraft | null {
  if (!raw || raw.length > MAX_RAW_LENGTH) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data) || data.version !== REQUIREMENT_DRAFT_VERSION) return null;
  if (typeof data.savedAt !== "number" || !Number.isFinite(data.savedAt)) return null;
  const age = options.now.getTime() - data.savedAt;
  if (age < 0 || age > REQUIREMENT_DRAFT_TTL_MS) return null;

  const status = pickEnum(data.status, ["needs_clarification", "ready_for_confirmation"] as const);
  const round = data.round;
  if (!status || typeof round !== "number" || !Number.isInteger(round) || round < 0 || round > REQUIREMENT_LIMITS.maxClarificationRounds) {
    return null;
  }

  // 客户端无法验证衣橱归属：恢复时丢弃 dislikedItemIds 以外的结构问题，ID 由服务端重新校验
  const sanitized = sanitizeRequirement(data.requirement, {
    now: options.now,
    timeZone: normalizeTimeZone(options.timeZone),
    closetItemIds: null,
  });
  if (!sanitized || sanitized.dateExpired) return null;

  const questions = parseQuestions(data.questions ?? []);
  if (!questions || (status === "needs_clarification" && questions.length === 0)) return null;

  const weather = data.weather === null || data.weather === undefined ? null : parseWeather(data.weather);
  if (data.weather && !weather) return null;

  // 保留客户端草稿中的排除单品 ID（结构校验），归属由服务端在确认时校验
  const ids = isRecord(data.requirement) && Array.isArray(data.requirement.dislikedItemIds)
    ? data.requirement.dislikedItemIds.filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{8,64}$/i.test(id)).slice(0, REQUIREMENT_LIMITS.dislikedItemMax)
    : [];

  return {
    status,
    requirement: { ...sanitized.requirement, dislikedItemIds: ids },
    questions,
    round,
    weather,
    usedFallback: data.usedFallback === true,
  };
}

export function readRequirementDraft(
  storage: DraftStorageLike | null | undefined,
  userId: string | null | undefined,
  options: { now: Date; timeZone?: string }
): RestorableDraft | null {
  const key = getRequirementDraftStorageKey(userId);
  if (!storage || !key) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;
  const parsed = parseStoredRequirementDraft(raw, options);
  if (!parsed) {
    try {
      storage.removeItem(key);
    } catch {
      // ignore
    }
  }
  return parsed;
}

export function writeRequirementDraft(
  storage: DraftStorageLike | null | undefined,
  userId: string | null | undefined,
  draft: RestorableDraft,
  now: Date
): boolean {
  const key = getRequirementDraftStorageKey(userId);
  if (!storage || !key) return false;
  try {
    storage.setItem(
      key,
      JSON.stringify({
        version: REQUIREMENT_DRAFT_VERSION,
        savedAt: now.getTime(),
        status: draft.status,
        requirement: draft.requirement,
        questions: draft.questions,
        round: draft.round,
        weather: draft.weather,
        usedFallback: draft.usedFallback,
      })
    );
    return true;
  } catch {
    return false;
  }
}

export function clearRequirementDraft(
  storage: DraftStorageLike | null | undefined,
  userId: string | null | undefined
): void {
  const key = getRequirementDraftStorageKey(userId);
  if (!storage || !key) return;
  try {
    storage.removeItem(key);
  } catch {
    // ignore
  }
}

export function getSessionStorage(): DraftStorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}
