import { NextResponse } from "next/server";
import { submitMobileFeedback } from "@/lib/api/mobile/feedback-handler";
import {
  authenticateMobileRequest,
  mobileErrorResponse,
} from "@/lib/api/mobile-auth";
import type { FeedbackRating } from "@/types/database";

type FeedbackBody = {
  recommendationId?: string;
  rating?: FeedbackRating;
  reasonTags?: string[];
  comment?: string;
};

const VALID_RATINGS = new Set<FeedbackRating>(["like", "dislike", "save"]);

export async function POST(request: Request) {
  const authResult = await authenticateMobileRequest(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  const { supabase, user } = authResult.auth;

  let body: FeedbackBody;
  try {
    body = (await request.json()) as FeedbackBody;
  } catch {
    return mobileErrorResponse("请求格式无效");
  }

  if (!body.recommendationId) {
    return mobileErrorResponse("缺少推荐 ID");
  }

  if (!body.rating || !VALID_RATINGS.has(body.rating)) {
    return mobileErrorResponse("无效的反馈类型");
  }

  const result = await submitMobileFeedback(supabase, user.id, {
    recommendationId: body.recommendationId,
    rating: body.rating,
    reasonTags: body.reasonTags,
    comment: body.comment,
  });

  if (!result.success) {
    return mobileErrorResponse(result.error, 400);
  }

  return NextResponse.json(result);
}
