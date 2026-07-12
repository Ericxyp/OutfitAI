"use server";

import { revalidatePath } from "next/cache";
import { generateStyleSummary } from "@/lib/ai/generate-style-summary";
import { formatQwenError } from "@/lib/ai/qwen";
import { trackEvent } from "@/lib/analytics/track-event";
import { trackFailureEvent } from "@/lib/analytics/track-failure";
import { getUserStyleProfile } from "@/lib/memory/style-profile";
import { createClient } from "@/lib/supabase/server";
import type { ClosetItem } from "@/types/database";

export type RegenerateStyleSummaryResponse =
  | { success: true; summary: string }
  | { success: false; error: string };

async function fetchClosetItemsByIds(
  userId: string,
  itemIds: string[]
): Promise<ClosetItem[]> {
  if (itemIds.length === 0) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("closet_items")
    .select("*")
    .eq("user_id", userId)
    .in("id", itemIds);

  return data ?? [];
}

export async function regenerateStyleSummary(): Promise<RegenerateStyleSummaryResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "请先登录" };
  }

  const profile = await getUserStyleProfile(user.id);

  if (!profile || profile.feedbackCount <= 0) {
    return {
      success: false,
      error: "请先对几套穿搭进行喜欢、收藏或反馈，我再为你生成风格总结。",
    };
  }

  try {
    const [favoriteItems, dislikedItems, feedbackResult, recommendationsResult] =
      await Promise.all([
        fetchClosetItemsByIds(user.id, profile.favoriteItemIds),
        fetchClosetItemsByIds(user.id, profile.dislikedItemIds),
        supabase
          .from("feedback")
          .select("rating, recommendation_id, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("outfit_recommendations")
          .select("id, title, summary, style_tags")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

    const feedbacks = feedbackResult.data ?? [];
    const recommendations = recommendationsResult.data ?? [];
    const recommendationMap = new Map(
      recommendations.map((rec) => [rec.id, rec])
    );

    const recentFeedback = feedbacks
      .map((fb) => {
        const rec = recommendationMap.get(fb.recommendation_id);
        return {
          rating: fb.rating,
          title: rec?.title ?? null,
          summary: rec?.summary ?? null,
          styleTags: rec?.style_tags ?? [],
        };
      })
      .slice(0, 8);

    const summary = await generateStyleSummary({
      profile,
      favoriteItems,
      dislikedItems,
      recentFeedback,
    });

    const { error: upsertError } = await supabase
      .from("user_style_profiles")
      .upsert(
        {
          user_id: user.id,
          preferred_styles: profile.preferredStyles,
          preferred_colors: profile.preferredColors,
          preferred_occasions: profile.preferredOccasions,
          avoid_styles: profile.avoidStyles,
          avoid_colors: profile.avoidColors,
          favorite_item_ids: profile.favoriteItemIds,
          disliked_item_ids: profile.dislikedItemIds,
          style_summary: summary,
          feedback_count: profile.feedbackCount,
        },
        { onConflict: "user_id" }
      );

    if (upsertError) {
      console.error("[styleProfile] save summary failed:", upsertError);
      await trackFailureEvent({
        userId: user.id,
        eventName: "style_profile_failed",
        feature: "style_profile",
        reason: "save_failed",
      });
      return { success: false, error: "保存风格总结失败，请稍后重试" };
    }

    revalidatePath("/profile");
    revalidatePath("/profile/style");

    await trackEvent({
      userId: user.id,
      eventName: "style_profile_updated",
      metadata: { source: "regenerate_summary", feature: "style_profile" },
    });

    console.log("[styleProfile] summary regenerated", {
      userId: user.id,
      summaryLength: summary.length,
    });

    return { success: true, summary };
  } catch (error) {
    console.error("[styleProfile] regenerateStyleSummary failed:", error);
    await trackFailureEvent({
      userId: user.id,
      eventName: "style_profile_failed",
      feature: "style_profile",
      reason: "qwen_unavailable",
    });
    return {
      success: false,
      error: `生成风格总结失败：${formatQwenError(error)}`,
    };
  }
}
