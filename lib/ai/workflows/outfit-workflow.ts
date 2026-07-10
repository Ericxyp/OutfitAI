import { revalidatePath } from "next/cache";
import { generateOutfit } from "@/lib/ai/generate-outfit";
import { QWEN_UNAVAILABLE_RECOMMENDATION } from "@/lib/ai/qwen";
import { MIN_CLOSET_FOR_AI } from "@/lib/constants";
import { getUserPersonalProfile } from "@/lib/memory/personal-profile";
import { getUserStyleProfile } from "@/lib/memory/style-profile";
import {
  buildRecommendationContext,
  retrieveClosetCandidatesSafe,
} from "@/lib/recommendation/closet-retriever";
import { parseRecommendationRequirement } from "@/lib/recommendation/rule-engine";
import { getWeatherByCoordinates } from "@/lib/weather";
import { createClient } from "@/lib/supabase/server";
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

async function resolveWeatherContext(
  location?: GenerateRecommendationOptions["location"]
): Promise<WeatherContext | null> {
  const hasLocation = Boolean(
    location &&
      Number.isFinite(location.latitude) &&
      Number.isFinite(location.longitude)
  );

  if (!hasLocation) {
    console.log("[outfitWorkflow] weather skipped", {
      hasLocation: false,
      weatherResult: false,
    });
    return null;
  }

  try {
    const weather = await getWeatherByCoordinates(location!);
    const weatherResult = weather !== null;

    console.log("[outfitWorkflow] weather lookup finished", {
      hasLocation: true,
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
    console.error("[outfitWorkflow] weather lookup failed:", error);
    console.log("[outfitWorkflow] weather lookup finished", {
      hasLocation: true,
      weatherResult: false,
    });
    return null;
  }
}

export async function runOutfitWorkflow(
  input: OutfitWorkflowInput
): Promise<OutfitWorkflowResult> {
  const { userId, requestText, options } = input;
  const trimmed = requestText.trim();

  const supabase = await createClient();

  const { data: closetItems, error: closetError } = await supabase
    .from("closet_items")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "ready")
    .order("created_at", { ascending: false });

  if (closetError || !closetItems) {
    return { success: false, error: "读取衣橱失败，请稍后重试" };
  }

  if (closetItems.length < MIN_CLOSET_FOR_AI) {
    return {
      success: false,
      error: INSUFFICIENT_CLOSET_MESSAGE,
      needsMoreClothes: true,
    };
  }

  const weatherContext = await resolveWeatherContext(options?.location);
  const [styleProfile, personalProfile] = await Promise.all([
    getUserStyleProfile(userId),
    getUserPersonalProfile(userId),
  ]);

  const retrieval = retrieveClosetCandidatesSafe({
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

  console.log("[outfitWorkflow] calling generateOutfit", {
    hasLocation: Boolean(options?.location),
    hasWeather: weatherContext !== null,
    hasStyleProfile: styleProfile !== null && styleProfile.feedbackCount > 0,
    hasPersonalProfile: personalProfile !== null,
    candidateCount: candidateItems.length,
    totalClosetCount: closetItems.length,
    usedRetrievalFallback: retrieval.usedFallback,
  });

  try {
    const aiResult = await generateOutfit(trimmed, candidateItems, {
      excludeItemIds: options?.excludeItemIds,
      weatherContext,
      styleProfile,
      personalProfile,
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
      .select("id")
      .single();

    if (saveError || !saved) {
      console.error("[outfitWorkflow] save failed", saveError);
      return { success: false, error: "保存推荐失败，请稍后重试" };
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

    console.log("[outfitWorkflow] success", { recommendationId: saved.id });

    return { success: true, recommendation };
  } catch (error) {
    console.error("[outfitWorkflow] generateOutfit failed:", error);
    return { success: false, error: QWEN_UNAVAILABLE_RECOMMENDATION };
  }
}
