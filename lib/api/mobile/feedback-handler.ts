import { normalizeFeedbackReasonTags } from "@/lib/feedback/reason-tags";
import { updateStyleProfileFromFeedback } from "@/lib/memory/update-style-profile";
import { trackEvent } from "@/lib/analytics/track-event";
import { trackFailureEvent } from "@/lib/analytics/track-failure";
import type { FeedbackRating } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type MobileFeedbackInput = {
  recommendationId: string;
  rating: FeedbackRating;
  reasonTags?: string[];
  comment?: string;
};

function normalizeComment(comment?: string): string | null {
  const trimmed = comment?.trim();
  return trimmed ? trimmed.slice(0, 200) : null;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

export async function submitMobileFeedback(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: MobileFeedbackInput
): Promise<{ success: true; rating: FeedbackRating } | { success: false; error: string }> {
  const { recommendationId, rating } = input;
  const normalizedReasonTags = normalizeFeedbackReasonTags(
    rating,
    input.reasonTags
  );
  const normalizedComment = normalizeComment(input.comment);

  const { data: recommendation } = await supabase
    .from("outfit_recommendations")
    .select("id")
    .eq("id", recommendationId)
    .eq("user_id", userId)
    .single();

  if (!recommendation) {
    return { success: false, error: "推荐不存在" };
  }

  const { data: existing } = await supabase
    .from("feedback")
    .select("id, rating, reason_tags, comment")
    .eq("user_id", userId)
    .eq("recommendation_id", recommendationId)
    .maybeSingle();

  if (existing) {
    const sameRating = existing.rating === rating;
    const sameReasonTags = arraysEqual(
      existing.reason_tags ?? [],
      normalizedReasonTags
    );
    const sameComment = (existing.comment ?? null) === normalizedComment;

    if (sameRating && sameReasonTags && sameComment) {
      return { success: true, rating };
    }

    const { error } = await supabase
      .from("feedback")
      .update({
        rating,
        reason_tags: normalizedReasonTags,
        comment: normalizedComment,
      })
      .eq("id", existing.id);

    if (error) {
      await trackFailureEvent({
        userId,
        eventName: "feedback_failed",
        feature: "feedback",
        reason: "save_failed",
        metadata: {
          feedbackType: rating,
          reasonTagCount: normalizedReasonTags.length,
          source: "mobile",
        },
      });
      return { success: false, error: "提交反馈失败" };
    }
  } else {
    const { error } = await supabase.from("feedback").insert({
      user_id: userId,
      recommendation_id: recommendationId,
      rating,
      reason_tags: normalizedReasonTags,
      comment: normalizedComment,
    });

    if (error) {
      await trackFailureEvent({
        userId,
        eventName: "feedback_failed",
        feature: "feedback",
        reason: "save_failed",
        metadata: {
          feedbackType: rating,
          reasonTagCount: normalizedReasonTags.length,
          source: "mobile",
        },
      });
      return { success: false, error: "提交反馈失败" };
    }
  }

  await trackEvent({
    userId,
    eventName: "feedback_submitted",
    entityType: "outfit_recommendation",
    entityId: recommendationId,
    metadata: {
      feedbackType: rating,
      reasonTags: normalizedReasonTags,
      hasComment: normalizedComment !== null,
      feature: "feedback",
      source: "mobile",
    },
  });

  try {
    await updateStyleProfileFromFeedback({
      userId,
      recommendationId,
      rating,
      reasonTags: normalizedReasonTags,
    });
  } catch (error) {
    console.error("[mobile feedback] style profile update failed:", error);
  }

  return { success: true, rating };
}
