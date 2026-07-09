"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ClosetItem, FeedbackRating } from "@/types/database";

export type FeedbackResponse =
  | { success: true; rating: FeedbackRating }
  | { success: false; error: string };

export type SavedOutfit = {
  id: string;
  title: string;
  summary: string;
  createdAt: string;
  savedAt: string;
  items: ClosetItem[];
};

export async function getFeedbackRating(
  recommendationId: string
): Promise<FeedbackRating | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("feedback")
    .select("rating")
    .eq("user_id", user.id)
    .eq("recommendation_id", recommendationId)
    .maybeSingle();

  return data?.rating ?? null;
}

export async function submitFeedback(
  recommendationId: string,
  rating: FeedbackRating
): Promise<FeedbackResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "请先登录" };
  }

  const { data: recommendation } = await supabase
    .from("outfit_recommendations")
    .select("id")
    .eq("id", recommendationId)
    .eq("user_id", user.id)
    .single();

  if (!recommendation) {
    return { success: false, error: "推荐不存在" };
  }

  const { data: existing } = await supabase
    .from("feedback")
    .select("id, rating")
    .eq("user_id", user.id)
    .eq("recommendation_id", recommendationId)
    .maybeSingle();

  if (existing) {
    if (existing.rating === rating) {
      return { success: true, rating };
    }

    const { error } = await supabase
      .from("feedback")
      .update({ rating })
      .eq("id", existing.id);

    if (error) {
      return { success: false, error: "提交反馈失败" };
    }
  } else {
    const { error } = await supabase.from("feedback").insert({
      user_id: user.id,
      recommendation_id: recommendationId,
      rating,
    });

    if (error) {
      return { success: false, error: "提交反馈失败" };
    }
  }

  revalidatePath("/profile");
  revalidatePath("/saved");

  return { success: true, rating };
}

export async function getSavedOutfits(): Promise<SavedOutfit[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data: feedbacks } = await supabase
    .from("feedback")
    .select("recommendation_id, created_at")
    .eq("user_id", user.id)
    .eq("rating", "save")
    .order("created_at", { ascending: false });

  if (!feedbacks?.length) return [];

  const recommendationIds = feedbacks.map((f) => f.recommendation_id);

  const { data: recommendations } = await supabase
    .from("outfit_recommendations")
    .select("*")
    .eq("user_id", user.id)
    .in("id", recommendationIds);

  if (!recommendations?.length) return [];

  const { data: closetItems } = await supabase
    .from("closet_items")
    .select("*")
    .eq("user_id", user.id);

  const closetMap = new Map(
    (closetItems ?? []).map((item) => [item.id, item])
  );

  const savedAtMap = new Map(
    feedbacks.map((f) => [f.recommendation_id, f.created_at])
  );

  return recommendations
    .map((rec) => ({
      id: rec.id,
      title: rec.title ?? "穿搭推荐",
      summary: rec.summary ?? "",
      createdAt: rec.created_at,
      savedAt: savedAtMap.get(rec.id) ?? rec.created_at,
      items: rec.selected_item_ids
        .map((id) => closetMap.get(id))
        .filter((item): item is ClosetItem => !!item),
    }))
    .sort(
      (a, b) =>
        new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
    );
}
