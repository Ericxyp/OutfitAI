import { NextResponse } from "next/server";
import { runTravelWorkflow } from "@/lib/ai/workflows/travel-workflow";
import {
  authenticateMobileRequest,
  mobileErrorResponse,
} from "@/lib/api/mobile-auth";

type TravelBody = {
  destination?: string;
  startDate?: string;
  days?: number;
  purpose?: string;
  stylePreference?: string;
  packLight?: boolean;
};

export async function POST(request: Request) {
  const authResult = await authenticateMobileRequest(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  const { supabase, user } = authResult.auth;

  let body: TravelBody;
  try {
    body = (await request.json()) as TravelBody;
  } catch {
    return mobileErrorResponse("请求格式无效");
  }

  const destination = body.destination?.trim();
  if (!destination) {
    return mobileErrorResponse("请填写目的地");
  }

  const days = Number(body.days);
  if (!Number.isFinite(days) || days < 1 || days > 10) {
    return mobileErrorResponse("旅行天数需在 1-10 天之间");
  }

  const result = await runTravelWorkflow({
    userId: user.id,
    destination,
    startDate: body.startDate?.trim() || undefined,
    days,
    purpose: body.purpose?.trim() || undefined,
    stylePreference: body.stylePreference?.trim() || undefined,
    packLight: body.packLight,
    supabase,
  });

  if (!result.success) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    plan: result.plan,
  });
}
