"use server";

import {
  runTravelWorkflow,
  type TravelPlanResult,
} from "@/lib/ai/workflows/travel-workflow";
import { createClient } from "@/lib/supabase/server";

export type CreateTravelPlanResponse =
  | { success: true; plan: TravelPlanResult }
  | { success: false; error: string; needsMoreClothes?: boolean; needsLogin?: boolean };

export async function createTravelPlan(input: {
  destination: string;
  startDate?: string;
  days: number;
  purpose?: string;
  stylePreference?: string;
  packLight?: boolean;
}): Promise<CreateTravelPlanResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      error: "请先登录后再规划旅行穿搭",
      needsLogin: true,
    };
  }

  const result = await runTravelWorkflow({
    userId: user.id,
    destination: input.destination,
    startDate: input.startDate,
    days: input.days,
    purpose: input.purpose,
    stylePreference: input.stylePreference,
    packLight: input.packLight,
  });

  if (!result.success) {
    return {
      success: false,
      error: result.error,
      ...(result.needsMoreClothes ? { needsMoreClothes: true } : {}),
    };
  }

  return { success: true, plan: result.plan };
}
