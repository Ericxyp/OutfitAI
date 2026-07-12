import { NextResponse } from "next/server";
import {
  authenticateMobileRequest,
  mobileErrorResponse,
} from "@/lib/api/mobile-auth";

export async function GET(request: Request) {
  const authResult = await authenticateMobileRequest(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  const { supabase, user } = authResult.auth;

  const { data, error } = await supabase
    .from("closet_items")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "ready")
    .order("created_at", { ascending: false });

  if (error) {
    return mobileErrorResponse("读取衣橱失败，请稍后重试", 500);
  }

  return NextResponse.json({
    success: true,
    items: data ?? [],
  });
}
