"use server";

import { runOutfitWorkflow } from "@/lib/ai/workflows/outfit-workflow";
import { createClient } from "@/lib/supabase/server";
import type { RecommendationResult } from "@/types/recommendation";
import type { GenerateRecommendationOptions } from "@/types/weather";

export type { RecommendationResult } from "@/types/recommendation";

export type GenerateRecommendationResponse =
  | { success: true; recommendation: RecommendationResult }
  | { success: false; error: string; needsLogin?: boolean; needsMoreClothes?: boolean };

export async function generateRecommendation(
  requestText: string,
  options?: GenerateRecommendationOptions
): Promise<GenerateRecommendationResponse> {
  const trimmed = requestText.trim();
  if (!trimmed) {
    return { success: false, error: "请输入穿搭需求" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      error: "请先登录后再获取穿搭推荐",
      needsLogin: true,
    };
  }

  const result = await runOutfitWorkflow({
    userId: user.id,
    requestText: trimmed,
    options,
  });

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
  };
}

export async function regenerateRecommendation(
  requestText: string,
  previousItemIds: string[],
  options?: Pick<GenerateRecommendationOptions, "location">
): Promise<GenerateRecommendationResponse> {
  return generateRecommendation(requestText, {
    excludeItemIds: previousItemIds,
    location: options?.location,
  });
}
