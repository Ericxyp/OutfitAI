import { NextResponse } from "next/server";
import {
  authenticateMobileRequest,
  mobileErrorResponse,
} from "@/lib/api/mobile-auth";
import { getUserPersonalProfile } from "@/lib/memory/personal-profile";
import { getUserStyleProfile } from "@/lib/memory/style-profile";

export async function GET(request: Request) {
  const authResult = await authenticateMobileRequest(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  const { supabase, user } = authResult.auth;

  const [
    profileResult,
    styleProfile,
    personalProfile,
    closetCountResult,
    recommendationCountResult,
    feedbackCountResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, display_name, avatar_url, created_at")
      .eq("id", user.id)
      .maybeSingle(),
    getUserStyleProfile(user.id, supabase),
    getUserPersonalProfile(user.id, supabase),
    supabase
      .from("closet_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "ready"),
    supabase
      .from("outfit_recommendations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("feedback")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);

  if (profileResult.error) {
    return mobileErrorResponse("读取用户信息失败", 500);
  }

  return NextResponse.json({
    success: true,
    profile: {
      id: user.id,
      email: profileResult.data?.email ?? user.email ?? null,
      displayName: profileResult.data?.display_name ?? null,
      avatarUrl: profileResult.data?.avatar_url ?? null,
      createdAt: profileResult.data?.created_at ?? null,
    },
    styleProfile,
    personalProfile,
    stats: {
      closetCount: closetCountResult.count ?? 0,
      recommendationCount: recommendationCountResult.count ?? 0,
      feedbackCount: feedbackCountResult.count ?? 0,
    },
  });
}
