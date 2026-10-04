"use server";

/**
 * 需求确认 Agent 的 Server Actions。
 * - 每个 Action 都先验证当前登录用户；
 * - 衣橱只按当前 user.id 查询，客户端传入的 ID 一律重新校验；
 * - 只返回前端需要的数据，不返回模型原始输出、Key 或内部错误。
 */
import { runOutfitWorkflow } from "@/lib/ai/workflows/outfit-workflow";
import { trackEvent } from "@/lib/analytics/track-event";
import { logger, safeErrorFields } from "@/lib/logger";
import {
  analyzeRequirement,
  confirmRequirement,
  validateRequirementForGeneration,
  type RequirementAgentDeps,
} from "@/lib/requirements/agent";
import { createQwenRequirementClient } from "@/lib/requirements/llm-extractor";
import {
  buildRequirementEventMetadata,
  CLIENT_REQUIREMENT_EVENTS,
  type RequirementEventMetadataInput,
  type RequirementEventName,
} from "@/lib/requirements/telemetry";
import { isRecord, pickEnum } from "@/lib/requirements/schema";
import { createClient } from "@/lib/supabase/server";
import { lookupWeatherForDate } from "@/lib/weather";
import type { RecommendationResult } from "@/types/recommendation";
import type { OutfitRequirement, RequirementAnalysisResult } from "@/types/requirement";
import type { GenerateRecommendationOptions } from "@/types/weather";

/** 单次请求体积上限（字符），防止超大输入 */
const MAX_INPUT_CHARS = 8000;

type AuthedContext = {
  userId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
};

async function getAuthedContext(): Promise<AuthedContext | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ? { userId: user.id, supabase } : null;
  } catch {
    return null;
  }
}

function isInputTooLarge(input: unknown): boolean {
  try {
    return JSON.stringify(input ?? null).length > MAX_INPUT_CHARS;
  } catch {
    return true;
  }
}

function buildDeps(ctx: AuthedContext): RequirementAgentDeps {
  return {
    modelClient: process.env.QWEN_API_KEY?.trim() ? createQwenRequirementClient() : null,
    lookupWeather: (location, isoDate) => lookupWeatherForDate(location, isoDate),
    loadClosetItems: async () => {
      const { data, error } = await ctx.supabase
        .from("closet_items")
        .select("id, name")
        .eq("user_id", ctx.userId)
        .eq("status", "ready")
        .limit(500);
      if (error || !data) return [];
      return data;
    },
    now: () => new Date(),
  };
}

async function track(
  userId: string,
  eventName: RequirementEventName,
  metadata: RequirementEventMetadataInput
): Promise<void> {
  await trackEvent({ userId, eventName, metadata: buildRequirementEventMetadata(metadata) });
}

const UNAUTHORIZED_MESSAGE = "登录状态已失效，请重新登录后再试。";
const UNAUTHORIZED: RequirementAnalysisResult = {
  status: "error",
  errorType: "unauthorized",
  message: UNAUTHORIZED_MESSAGE,
};

/**
 * 解析 / 追问合并。不会调用最终推荐生成。
 */
export async function analyzeOutfitRequirement(input: unknown): Promise<RequirementAnalysisResult> {
  const ctx = await getAuthedContext();
  if (!ctx) return UNAUTHORIZED;

  if (!isRecord(input) || isInputTooLarge(input)) {
    return { status: "error", errorType: "invalid_input", message: "输入内容过长或格式不正确，请精简后重试。" };
  }

  const startedAt = Date.now();
  const isAnswer = input.previous !== undefined && input.previous !== null;
  const answerKind = input.skipClarification === true
    ? "skip"
    : isRecord(input.answer)
      ? pickEnum(input.answer.kind, ["option", "text"] as const)
      : null;

  await track(ctx.userId, "requirement_extraction_started", {
    round: input.round,
    hasContextLocation: Boolean(input.contextLocation),
    answerKind: answerKind ?? undefined,
  });

  try {
    const { result, telemetry } = await analyzeRequirement(input, buildDeps(ctx));
    const durationMs = Date.now() - startedAt;

    if (isAnswer && answerKind) {
      await track(ctx.userId, "requirement_clarification_answered", {
        answerKind,
        round: input.round,
        questionFields: input.pendingFields,
      });
    }
    if (telemetry.usedFallback) {
      await track(ctx.userId, "requirement_fallback_used", {
        fallbackReason: telemetry.fallbackReason,
        modelAttempts: telemetry.modelAttempts,
      });
    }

    if (result.status === "error") {
      await track(ctx.userId, "requirement_extraction_failed", {
        errorType: result.errorType,
        durationMs,
      });
      return result;
    }

    await track(ctx.userId, "requirement_extraction_succeeded", {
      status: result.status,
      round: result.round,
      durationMs,
      usedModel: telemetry.usedModel,
      usedFallback: telemetry.usedFallback,
      modelAttempts: telemetry.modelAttempts,
      missingFields: result.requirement.missingCriticalFields,
      ambiguousFields: result.requirement.ambiguousFields,
      weatherStatus: result.weather.status,
    });

    if (result.status === "needs_clarification") {
      await track(ctx.userId, "requirement_clarification_requested", {
        round: result.round,
        questionFields: result.questions.map((q) => q.field),
        missingFields: result.requirement.missingCriticalFields,
      });
    } else {
      await track(ctx.userId, "requirement_confirmation_shown", {
        round: result.round,
        assumptionCount: result.requirement.assumptions.length,
        weatherStatus: result.weather.status,
        locationSource: result.requirement.location?.source,
        occasion: result.requirement.occasion,
      });
    }

    return result;
  } catch (error) {
    logger.error("[requirementAgent] analyze failed", {
      feature: "requirement",
      ...safeErrorFields(error),
    });
    await track(ctx.userId, "requirement_extraction_failed", {
      errorType: "unavailable",
      durationMs: Date.now() - startedAt,
    });
    return { status: "error", errorType: "unavailable", message: "需求解析暂时不可用，请稍后重试。" };
  }
}

export type ValidateRequirementResponse =
  | { status: "valid"; requirement: OutfitRequirement }
  | { status: "invalid" | "unauthorized"; message: string };

/** 确认前最终校验（validating 状态），不调用模型 */
export async function validateOutfitRequirement(input: unknown): Promise<ValidateRequirementResponse> {
  const ctx = await getAuthedContext();
  if (!ctx) return { status: "unauthorized", message: UNAUTHORIZED_MESSAGE };
  if (!isRecord(input) || isInputTooLarge(input)) {
    return { status: "invalid", message: "需求格式不正确，请重新描述。" };
  }
  const deps = buildDeps(ctx);
  const outcome = await validateRequirementForGeneration(input.requirement, { timeZone: input.timeZone }, deps);
  if (outcome.status === "invalid") return { status: "invalid", message: outcome.message };
  return { status: "valid", requirement: outcome.requirement };
}

export type ConfirmRequirementResponse =
  | {
      success: true;
      recommendation: RecommendationResult;
      /** 供“换一套”复用的参数（不含任何密钥） */
      generationOptions: Pick<
        GenerateRecommendationOptions,
        "location" | "targetDate" | "excludeClosetItemIds" | "requirementNotes" | "requirementTerms"
      >;
    }
  | { success: false; error: string; needsLogin?: boolean; needsMoreClothes?: boolean; invalidRequirement?: boolean };

/**
 * 用户确认后才调用现有推荐工作流（不复制工作流）。
 * 服务端会再次完整校验需求，客户端传入的 dislikedItemIds 只保留当前用户衣橱内的 ID。
 */
export async function confirmOutfitRequirement(input: unknown): Promise<ConfirmRequirementResponse> {
  const ctx = await getAuthedContext();
  if (!ctx) return { success: false, error: UNAUTHORIZED_MESSAGE, needsLogin: true };
  if (!isRecord(input) || isInputTooLarge(input)) {
    return { success: false, error: "需求格式不正确，请重新描述。", invalidRequirement: true };
  }

  const deps = buildDeps(ctx);
  const outcome = await confirmRequirement(input.requirement, { timeZone: input.timeZone }, {
    ...deps,
    runWorkflow: async (generation, requirement) => {
      // 校验通过后才记录确认并调用现有推荐工作流
      await track(ctx.userId, "requirement_confirmed", {
        round: input.round,
        occasion: requirement.occasion,
        locationSource: requirement.location?.source,
        weatherStatus: requirement.location?.weatherStatus,
        dateOffset: requirement.date?.offsetDays,
        excludedCount: requirement.dislikedItemIds.length,
        assumptionCount: requirement.assumptions.length,
      });
      return runOutfitWorkflow({
        userId: ctx.userId,
        requestText: generation.requestText,
        options: generation.options,
        supabase: ctx.supabase,
      });
    },
  });
  if (outcome.status === "invalid") {
    await track(ctx.userId, "requirement_extraction_failed", { errorType: outcome.reason });
    return { success: false, error: outcome.message, invalidRequirement: true };
  }

  const { generation, result } = outcome;

  if (!result.success) {
    return {
      success: false,
      error: result.error,
      ...(result.needsMoreClothes ? { needsMoreClothes: true } : {}),
    };
  }

  return {
    success: true,
    recommendation: result.recommendation,
    generationOptions: {
      location: generation.options.location,
      targetDate: generation.options.targetDate,
      excludeClosetItemIds: generation.options.excludeClosetItemIds,
      requirementNotes: generation.options.requirementNotes,
      requirementTerms: generation.options.requirementTerms,
    },
  };
}

/** 客户端行为埋点（修改 / 取消）：只接受白名单事件与枚举字段 */
export async function trackRequirementAction(input: unknown): Promise<void> {
  if (!isRecord(input)) return;
  const eventName = pickEnum(input.event, CLIENT_REQUIREMENT_EVENTS);
  if (!eventName) return;
  const ctx = await getAuthedContext();
  if (!ctx) return;
  await track(ctx.userId, eventName, { stage: input.stage, round: input.round });
}
