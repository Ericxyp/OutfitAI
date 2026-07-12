"use server";

import { trackEvent } from "@/lib/analytics/track-event";
import { normalizeRecommendationScore } from "@/lib/analytics/user-effect-metrics";
import { createClient } from "@/lib/supabase/server";

export type WearConfirmationResponse =
  | { success: true; confirmed: true; alreadyConfirmed?: boolean }
  | { success: false; error: string };

export type RecommendationRatingResponse =
  | { success: true; rating: number; updated: boolean }
  | { success: false; error: string };

async function verifyOwnRecommendation(
  recommendationId: string,
  userId: string
): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("outfit_recommendations")
    .select("id")
    .eq("id", recommendationId)
    .eq("user_id", userId)
    .maybeSingle();

  return Boolean(data);
}

export async function getWearConfirmation(
  recommendationId: string
): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  const { data } = await supabase
    .from("recommendation_wear_confirmations")
    .select("id")
    .eq("user_id", user.id)
    .eq("recommendation_id", recommendationId)
    .maybeSingle();

  return Boolean(data);
}

export async function confirmRecommendationWorn(
  recommendationId: string
): Promise<WearConfirmationResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "请先登录" };
  }

  const ownsRecommendation = await verifyOwnRecommendation(
    recommendationId,
    user.id
  );

  if (!ownsRecommendation) {
    return { success: false, error: "推荐不存在" };
  }

  const { data: existing } = await supabase
    .from("recommendation_wear_confirmations")
    .select("id")
    .eq("user_id", user.id)
    .eq("recommendation_id", recommendationId)
    .maybeSingle();

  if (existing) {
    return { success: true, confirmed: true, alreadyConfirmed: true };
  }

  const { error } = await supabase
    .from("recommendation_wear_confirmations")
    .insert({
      user_id: user.id,
      recommendation_id: recommendationId,
    });

  if (error) {
    if (error.code === "23505") {
      return { success: true, confirmed: true, alreadyConfirmed: true };
    }

    return { success: false, error: "确认穿着失败，请稍后重试" };
  }

  try {
    await trackEvent({
      userId: user.id,
      eventName: "recommendation_worn",
      entityType: "outfit_recommendation",
      entityId: recommendationId,
      metadata: {
        feature: "outfit",
        recommendationId,
      },
    });
  } catch (error) {
    console.warn("[recommendation-effects] wear event failed:", error);
  }

  return { success: true, confirmed: true };
}

export async function getRecommendationScore(
  recommendationId: string
): Promise<number | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("recommendation_ratings")
    .select("rating")
    .eq("user_id", user.id)
    .eq("recommendation_id", recommendationId)
    .maybeSingle();

  return data?.rating ?? null;
}

export async function submitRecommendationScore(
  recommendationId: string,
  rawRating: number
): Promise<RecommendationRatingResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "请先登录" };
  }

  const rating = normalizeRecommendationScore(rawRating);
  if (rating === null) {
    return { success: false, error: "评分必须是 1 到 5 的整数" };
  }

  const ownsRecommendation = await verifyOwnRecommendation(
    recommendationId,
    user.id
  );

  if (!ownsRecommendation) {
    return { success: false, error: "推荐不存在" };
  }

  const { data: existing } = await supabase
    .from("recommendation_ratings")
    .select("id, rating")
    .eq("user_id", user.id)
    .eq("recommendation_id", recommendationId)
    .maybeSingle();

  if (existing) {
    if (existing.rating === rating) {
      return { success: true, rating, updated: true };
    }

    const { error } = await supabase
      .from("recommendation_ratings")
      .update({ rating })
      .eq("id", existing.id);

    if (error) {
      return { success: false, error: "更新评分失败，请稍后重试" };
    }

    try {
      await trackEvent({
        userId: user.id,
        eventName: "recommendation_rating_updated",
        entityType: "outfit_recommendation",
        entityId: recommendationId,
        metadata: {
          feature: "outfit",
          recommendationId,
          rating,
        },
      });
    } catch (error) {
      console.warn("[recommendation-effects] rating update event failed:", error);
    }

    return { success: true, rating, updated: true };
  }

  const { error } = await supabase.from("recommendation_ratings").insert({
    user_id: user.id,
    recommendation_id: recommendationId,
    rating,
  });

  if (error) {
    return { success: false, error: "提交评分失败，请稍后重试" };
  }

  try {
    await trackEvent({
      userId: user.id,
      eventName: "recommendation_rated",
      entityType: "outfit_recommendation",
      entityId: recommendationId,
      metadata: {
        feature: "outfit",
        recommendationId,
        rating,
      },
    });
  } catch (error) {
    console.warn("[recommendation-effects] rating event failed:", error);
  }

  return { success: true, rating, updated: false };
}
