import { NextResponse } from "next/server";
import { runOutfitWorkflow } from "@/lib/ai/workflows/outfit-workflow";
import {
  authenticateMobileRequest,
  mobileErrorResponse,
} from "@/lib/api/mobile-auth";

type RecommendationsBody = {
  requestText?: string;
  location?: { latitude: number; longitude: number };
};

export async function POST(request: Request) {
  const authResult = await authenticateMobileRequest(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  const { supabase, user } = authResult.auth;

  let body: RecommendationsBody;
  try {
    body = (await request.json()) as RecommendationsBody;
  } catch {
    return mobileErrorResponse("请求格式无效");
  }

  const requestText = body.requestText?.trim();
  if (!requestText) {
    return mobileErrorResponse("请描述你的穿搭需求");
  }

  const location = body.location;
  if (
    location &&
    (typeof location.latitude !== "number" ||
      typeof location.longitude !== "number")
  ) {
    return mobileErrorResponse("位置信息格式无效");
  }

  const result = await runOutfitWorkflow({
    userId: user.id,
    requestText,
    options: location ? { location } : undefined,
    supabase,
  });

  if (!result.success) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    recommendation: result.recommendation,
  });
}
