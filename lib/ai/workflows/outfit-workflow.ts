import { revalidatePath } from "next/cache";
import { generateOutfit } from "@/lib/ai/generate-outfit";
import { QWEN_UNAVAILABLE_RECOMMENDATION } from "@/lib/ai/qwen";
import { trackEvent } from "@/lib/analytics/track-event";
import {
  getRegenerationWindowStartIso,
  resolveRegenerationTracking,
} from "@/lib/analytics/regeneration-tracking";
import { trackFailureEvent } from "@/lib/analytics/track-failure";
import type { FailureReason } from "@/lib/analytics/event-schema";
import { retrieveStyleKnowledge } from "@/lib/knowledge/retrieve-style-knowledge";
import { MIN_CLOSET_FOR_AI } from "@/lib/constants";
import { getUserPersonalProfile } from "@/lib/memory/personal-profile";
import { getUserStyleProfile } from "@/lib/memory/style-profile";
import {
  buildRecommendationContext,
  retrieveClosetCandidatesHybridSafe,
} from "@/lib/recommendation/closet-retriever";
import { parseRecommendationRequirement } from "@/lib/recommendation/rule-engine";
import { getWeatherByCity, getWeatherByCoordinates } from "@/lib/weather";
import {
  buildWeatherLocationEventMetadata,
  normalizeWeatherLocationInput,
} from "@/lib/weather-location";
import { createClient } from "@/lib/supabase/server";
import { logger, safeErrorFields } from "@/lib/logger";
import type {
  OutfitWorkflowInput,
  OutfitWorkflowResult,
  RecommendationResult,
} from "@/types/recommendation";
import type {
  GenerateRecommendationOptions,
  WeatherContext,
} from "@/types/weather";

const INSUFFICIENT_CLOSET_MESSAGE =
  "你的衣橱还不够丰富，建议先添加至少 3 件衣服，我才能更好地帮你搭配。";

async function trackRecommendationFailed(
  userId: string,
  reason: FailureReason,
  context: {
    hasWeather: boolean;
    requestLength?: number;
    hasStyleProfile?: boolean;
    hasPersonalProfile?: boolean;
  }
) {
  await trackFailureEvent({
    userId,
    eventName: "recommendation_failed",
    feature: "outfit",
    reason,
    metadata: {
      hasWeather: context.hasWeather,
      requestLength: context.requestLength ?? 0,
      hasStyleProfile: context.hasStyleProfile ?? false,
      hasPersonalProfile: context.hasPersonalProfile ?? false,
    },
  });
}

/**
 * 根据位置输入解析天气：
 * - coordinates → getWeatherByCoordinates
 * - city → getWeatherByCity
 * - undefined / 非法 → null
 * 任何失败都返回 null，调用方继续走无天气推荐，不会让推荐整体失败。
 */
export async function resolveWeatherContext(
  location?: GenerateRecommendationOptions["location"]
): Promise<WeatherContext | null> {
  const normalized = location ? normalizeWeatherLocationInput(location) : null;

  if (!normalized) {
    logger.debug("[outfitWorkflow] weather skipped", {
      hasLocation: false,
      invalidLocation: Boolean(location),
      weatherResult: false,
    });
    return null;
  }

  try {
    const weather =
      normalized.type === "city"
        ? await getWeatherByCity(normalized.city)
        : await getWeatherByCoordinates(normalized);
    const weatherResult = weather !== null;

    logger.debug("[outfitWorkflow] weather lookup finished", {
      hasLocation: true,
      locationType: normalized.type,
      weatherResult,
      ...(weather
        ? {
            locationName: weather.locationName,
            temperatureC: weather.temperatureC,
            condition: weather.condition,
          }
        : {}),
    });

    return weather;
  } catch (error) {
    logger.error("[outfitWorkflow] weather lookup failed", {
      feature: "outfit",
      reason: "weather_lookup_failed",
      ...safeErrorFields(error),
    });
    logger.debug("[outfitWorkflow] weather lookup finished", {
      hasLocation: true,
      locationType: normalized.type,
      weatherResult: false,
    });
    return null;
  }
}

export async function runOutfitWorkflow(
  input: OutfitWorkflowInput
): Promise<OutfitWorkflowResult> {
  const { userId, requestText, options, supabase: supabaseOverride } = input;
  const trimmed = requestText.trim();

  const supabase = supabaseOverride ?? (await createClient());

  const { data: closetItems, error: closetError } = await supabase
    .from("closet_items")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "ready")
    .order("created_at", { ascending: false });

  if (closetError || !closetItems) {
    await trackRecommendationFailed(userId, "closet_read_failed", {
      hasWeather: false,
      requestLength: trimmed.length,
    });
    return { success: false, error: "读取衣橱失败，请稍后重试" };
  }

  if (closetItems.length < MIN_CLOSET_FOR_AI) {
    await trackRecommendationFailed(userId, "insufficient_closet", {
      hasWeather: false,
      requestLength: trimmed.length,
    });
    return {
      success: false,
      error: INSUFFICIENT_CLOSET_MESSAGE,
      needsMoreClothes: true,
    };
  }

  const weatherContext = await resolveWeatherContext(options?.location);
  const locationType = options?.location
    ? normalizeWeatherLocationInput(options.location)?.type
    : undefined;

  if (locationType === "city") {
    await trackEvent({
      userId,
      eventName: "weather_manual_city_used",
      metadata: buildWeatherLocationEventMetadata({
        source: "manual_city",
        hasWeather: weatherContext !== null,
      }),
    });
  }
  const [styleProfile, personalProfile] = await Promise.all([
    getUserStyleProfile(userId, supabase),
    getUserPersonalProfile(userId, supabase),
  ]);

  const retrieval = await retrieveClosetCandidatesHybridSafe({
    supabase,
    userId,
    closetItems,
    requestText: trimmed,
    weatherContext,
    styleProfile,
  });

  const requirement = parseRecommendationRequirement(trimmed);
  const recommendationContext = buildRecommendationContext(
    retrieval,
    requirement,
    closetItems.length
  );

  const candidateItems =
    retrieval.candidateItems.length >= MIN_CLOSET_FOR_AI
      ? retrieval.candidateItems
      : closetItems;

  const styleKnowledge = await retrieveStyleKnowledge({
    supabase,
    query: trimmed,
    occasion: requirement.occasionHints.join("、"),
    weatherSummary: weatherContext
      ? `${weatherContext.condition}，${weatherContext.temperatureC}°C`
      : undefined,
    styleProfile,
    personalProfile,
  });

  logger.info("[outfitWorkflow] calling generateOutfit", {
    hasLocation: Boolean(options?.location),
    locationType: locationType ?? "none",
    hasWeather: weatherContext !== null,
    hasStyleProfile: styleProfile !== null && styleProfile.feedbackCount > 0,
    hasPersonalProfile: personalProfile !== null,
    styleKnowledgeCount: styleKnowledge.length,
    candidateCount: candidateItems.length,
    totalClosetCount: closetItems.length,
    usedRetrievalFallback: retrieval.usedFallback,
    usedEmbeddingRetrieval: retrieval.usedEmbeddingRetrieval ?? false,
    embeddingCandidateCount: retrieval.embeddingCandidateCount ?? 0,
  });

  try {
    const aiResult = await generateOutfit(trimmed, candidateItems, {
      excludeItemIds: options?.excludeItemIds,
      weatherContext,
      styleProfile,
      personalProfile,
      styleKnowledge,
      recommendationContext,
      rankingDebug: retrieval.debugScores,
      fullClosetItems: closetItems,
    });

    const selectedItems = closetItems.filter((item) =>
      aiResult.selected_item_ids.includes(item.id)
    );

    const { data: saved, error: saveError } = await supabase
      .from("outfit_recommendations")
      .insert({
        user_id: userId,
        request_text: trimmed,
        title: aiResult.title,
        selected_item_ids: aiResult.selected_item_ids,
        summary: aiResult.summary,
        reasoning: aiResult.reasoning,
        style_tags: aiResult.style_tags,
        occasion: aiResult.occasion,
        model_output: {
          alternatives: aiResult.alternatives,
          raw_selected_item_ids: aiResult.selected_item_ids,
          weather: weatherContext,
          recommendation: {
            retrievalReason: retrieval.retrievalReason,
            candidateCount: candidateItems.length,
            categoryCoverage: retrieval.categoryCoverage,
            usedFallback: retrieval.usedFallback,
          },
        },
      })
      .select("id, created_at")
      .single();

    if (saveError || !saved) {
      logger.error("[outfitWorkflow] save failed", {
        feature: "outfit",
        reason: "save_failed",
        errorName: saveError?.name ?? "PostgrestError",
        errorMessage: saveError?.message?.slice(0, 200) ?? "missing row",
      });
      await trackRecommendationFailed(userId, "save_failed", {
        hasWeather: weatherContext !== null,
        requestLength: trimmed.length,
        hasStyleProfile:
          styleProfile !== null && styleProfile.feedbackCount > 0,
        hasPersonalProfile: personalProfile !== null,
      });
      return { success: false, error: "保存推荐失败，请稍后重试" };
    }

    await trackEvent({
      userId,
      eventName: "outfit_generated",
      entityType: "outfit_recommendation",
      entityId: saved.id,
      metadata: {
        hasWeather: weatherContext !== null,
        hasStyleProfile:
          styleProfile !== null && styleProfile.feedbackCount > 0,
        hasPersonalProfile: personalProfile !== null,
        candidateCount: candidateItems.length,
        totalClosetCount: closetItems.length,
        occasion: aiResult.occasion,
        feature: "outfit",
      },
    });

    const windowStartIso = getRegenerationWindowStartIso();
    const { data: recentRecommendations } = await supabase
      .from("outfit_recommendations")
      .select("id, created_at")
      .eq("user_id", userId)
      .gte("created_at", windowStartIso)
      .order("created_at", { ascending: false });

    const regeneration = resolveRegenerationTracking({
      previousRecommendations: (recentRecommendations ?? []).map((row) => ({
        id: row.id,
        createdAt: row.created_at,
      })),
      currentRecommendationId: saved.id,
      currentCreatedAt: saved.created_at,
    });

    if (regeneration.shouldTrack && regeneration.previousRecommendationId) {
      await trackEvent({
        userId,
        eventName: "recommendation_regenerated",
        entityType: "outfit_recommendation",
        entityId: saved.id,
        metadata: {
          feature: "outfit",
          previousRecommendationId: regeneration.previousRecommendationId,
          currentRecommendationId: saved.id,
          elapsedSeconds: regeneration.elapsedSeconds ?? 0,
        },
      });
    }

    revalidatePath("/profile");
    revalidatePath("/saved");

    const recommendation: RecommendationResult = {
      id: saved.id,
      requestText: trimmed,
      title: aiResult.title,
      selectedItemIds: aiResult.selected_item_ids,
      summary: aiResult.summary,
      reasoning: aiResult.reasoning,
      styleTags: aiResult.style_tags,
      occasion: aiResult.occasion,
      alternatives: aiResult.alternatives,
      items: selectedItems,
    };

    logger.info("[outfitWorkflow] success", { recommendationId: saved.id });

    return { success: true, recommendation };
  } catch (error) {
    logger.error("[outfitWorkflow] generateOutfit failed", {
      feature: "outfit",
      reason: "qwen_unavailable",
      ...safeErrorFields(error),
    });
    await trackRecommendationFailed(userId, "qwen_unavailable", {
      hasWeather: weatherContext !== null,
      requestLength: trimmed.length,
      hasStyleProfile:
        styleProfile !== null && styleProfile.feedbackCount > 0,
      hasPersonalProfile: personalProfile !== null,
    });
    return { success: false, error: QWEN_UNAVAILABLE_RECOMMENDATION };
  }
}
