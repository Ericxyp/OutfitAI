"use server";

import { revalidatePath } from "next/cache";
import { generateOutfit } from "@/lib/ai/generate-outfit";
import { QWEN_UNAVAILABLE_RECOMMENDATION } from "@/lib/ai/qwen";
import { createClient } from "@/lib/supabase/server";
import {
  MIN_CLOSET_FOR_AI,
} from "@/lib/constants";
import type { ClosetItem } from "@/types/database";

export type RecommendationResult = {
  id: string;
  requestText: string;
  title: string;
  selectedItemIds: string[];
  summary: string;
  reasoning: string;
  styleTags: string[];
  occasion: string;
  alternatives: string[];
  items: ClosetItem[];
};

export type GenerateRecommendationResponse =
  | { success: true; recommendation: RecommendationResult }
  | { success: false; error: string; needsLogin?: boolean; needsMoreClothes?: boolean };

const INSUFFICIENT_CLOSET_MESSAGE =
  "你的衣橱还不够丰富，建议先添加至少 3 件衣服，我才能更好地帮你搭配。";

export async function generateRecommendation(
  requestText: string,
  options?: { excludeItemIds?: string[] }
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

  const { data: closetItems, error: closetError } = await supabase
    .from("closet_items")
    .select("*")
    .eq("user_id", user.id)
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

  try {
    const aiResult = await generateOutfit(trimmed, closetItems, {
      excludeItemIds: options?.excludeItemIds,
    });

    const selectedItems = closetItems.filter((item) =>
      aiResult.selected_item_ids.includes(item.id)
    );

    const { data: saved, error: saveError } = await supabase
      .from("outfit_recommendations")
      .insert({
        user_id: user.id,
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
        },
      })
      .select("id")
      .single();

    if (saveError || !saved) {
      return { success: false, error: "保存推荐失败，请稍后重试" };
    }

    revalidatePath("/profile");
    revalidatePath("/saved");

    return {
      success: true,
      recommendation: {
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
      },
    };
  } catch (error) {
    console.error("generateRecommendation error:", error);
    return { success: false, error: QWEN_UNAVAILABLE_RECOMMENDATION };
  }
}

export async function regenerateRecommendation(
  requestText: string,
  previousItemIds: string[]
): Promise<GenerateRecommendationResponse> {
  return generateRecommendation(requestText, {
    excludeItemIds: previousItemIds,
  });
}
