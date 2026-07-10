import {
  generateTravelPlan,
  type TravelPackingList,
} from "@/lib/ai/generate-travel-plan";
import { QWEN_UNAVAILABLE_RECOMMENDATION } from "@/lib/ai/qwen";
import { MIN_CLOSET_FOR_AI } from "@/lib/constants";
import { getUserPersonalProfile } from "@/lib/memory/personal-profile";
import { getUserStyleProfile } from "@/lib/memory/style-profile";
import { getForecastByDestination } from "@/lib/weather";
import { createClient } from "@/lib/supabase/server";
import type { ClosetItem } from "@/types/database";
import type { WeatherContext } from "@/types/weather";

export type TravelPurpose =
  | "拍照"
  | "城市漫游"
  | "商务"
  | "约会"
  | "徒步"
  | "休闲";

export type TravelWorkflowInput = {
  userId: string;
  destination: string;
  startDate?: string;
  days: number;
  purpose?: TravelPurpose | string;
  stylePreference?: string;
  packLight?: boolean;
};

export type TravelDayResult = {
  dayIndex: number;
  date?: string;
  title: string;
  selectedItemIds: string[];
  summary: string;
  reasoning: string;
  weather?: WeatherContext | null;
  items: ClosetItem[];
};

export type TravelPlanResult = {
  id: string;
  destination: string;
  startDate?: string | null;
  days: number;
  purpose?: string | null;
  stylePreference?: string | null;
  packingList: TravelPackingList;
  weatherContext: WeatherContext[] | null;
  dayPlans: TravelDayResult[];
};

const INSUFFICIENT_CLOSET_MESSAGE =
  "你的衣橱还不够丰富，建议先添加至少 3 件衣服，我才能为你规划旅行穿搭。";

function addDaysToDate(startDate: string, offsetDays: number): string {
  const date = new Date(`${startDate}T00:00:00`);
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function classifyTravelPlanFailure(error: unknown): string {
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (
    errorMessage.includes("Qwen") ||
    errorMessage.includes("未返回内容") ||
    errorMessage.includes("API")
  ) {
    return "qwen_api";
  }

  if (errorMessage.includes("格式")) {
    return "ai_json_format";
  }

  if (errorMessage.includes("内部编号")) {
    return "visible_id_leak";
  }

  if (errorMessage.includes("无效") || error instanceof TypeError) {
    return "invalid_item_ids";
  }

  if (errorMessage.includes("失败")) {
    return "travel_plan_generation_failed";
  }

  return "unknown";
}

export async function runTravelWorkflow(
  input: TravelWorkflowInput
): Promise<
  | { success: true; plan: TravelPlanResult }
  | { success: false; error: string; needsMoreClothes?: boolean }
> {
  const destination = input.destination.trim();
  if (!destination) {
    return { success: false, error: "请填写目的地" };
  }

  const days = Math.floor(input.days);
  if (days < 1 || days > 10) {
    return { success: false, error: "旅行天数需在 1-10 天之间" };
  }

  const supabase = await createClient();

  const { data: closetItems, error: closetError } = await supabase
    .from("closet_items")
    .select("*")
    .eq("user_id", input.userId)
    .eq("status", "ready")
    .order("created_at", { ascending: false });

  if (closetError || !closetItems) {
    return { success: false, error: "读取衣橱失败，请稍后重试" };
  }

  if (closetItems.length < MIN_CLOSET_FOR_AI) {
    return {
      success: false,
      error: INSUFFICIENT_CLOSET_MESSAGE,
      needsMoreClothes: true,
    };
  }

  const [styleProfile, personalProfile] = await Promise.all([
    getUserStyleProfile(input.userId),
    getUserPersonalProfile(input.userId),
  ]);
  const weatherContext = await getForecastByDestination({ destination, days });

  console.log("[travelWorkflow] calling generateTravelPlan", {
    destination,
    days,
    hasWeather: weatherContext !== null,
    hasStyleProfile: styleProfile !== null && styleProfile.feedbackCount > 0,
    hasPersonalProfile: personalProfile !== null,
    packLight: Boolean(input.packLight),
  });

  try {
    const aiResult = await generateTravelPlan({
      destination,
      startDate: input.startDate,
      days,
      purpose: input.purpose,
      stylePreference: input.stylePreference,
      packLight: input.packLight,
      weatherForecast: weatherContext,
      styleProfile,
      personalProfile,
      closetItems,
    });

    const closetMap = new Map(closetItems.map((item) => [item.id, item]));

    const dayPlans: TravelDayResult[] = aiResult.days
      .filter((day) => day.selected_item_ids.length > 0)
      .map((day) => {
        const dayIndex = day.day_index;
        const weather =
          weatherContext && weatherContext[dayIndex - 1]
            ? weatherContext[dayIndex - 1]
            : null;

        const date = input.startDate
          ? addDaysToDate(input.startDate, dayIndex - 1)
          : weather?.date;

        const items = day.selected_item_ids
          .map((id) => closetMap.get(id))
          .filter((item): item is ClosetItem => !!item);

        return {
          dayIndex,
          date,
          title: day.title,
          selectedItemIds: day.selected_item_ids,
          summary: day.summary,
          reasoning: day.reasoning,
          weather,
          items,
        };
      })
      .sort((a, b) => a.dayIndex - b.dayIndex);

    if (dayPlans.length === 0) {
      return { success: false, error: "未能生成有效的旅行穿搭计划，请稍后重试" };
    }

    const { data: savedPlan, error: planError } = await supabase
      .from("travel_plans")
      .insert({
        user_id: input.userId,
        destination,
        start_date: input.startDate || null,
        days,
        purpose: input.purpose || null,
        style_preference: input.stylePreference || null,
        weather_context: weatherContext,
        packing_list: aiResult.packing_list,
      })
      .select("id")
      .single();

    if (planError || !savedPlan) {
      console.error("[travelWorkflow] save plan failed", planError);
      return { success: false, error: "保存旅行计划失败，请稍后重试" };
    }

    const dayRows = dayPlans.map((day) => ({
      plan_id: savedPlan.id,
      day_index: day.dayIndex,
      date: day.date || null,
      title: day.title,
      selected_item_ids: day.selectedItemIds,
      summary: day.summary,
      reasoning: day.reasoning,
      weather: day.weather,
    }));

    const { error: daysError } = await supabase
      .from("travel_plan_days")
      .insert(dayRows);

    if (daysError) {
      console.error("[travelWorkflow] save days failed", daysError);
      await supabase.from("travel_plans").delete().eq("id", savedPlan.id);
      return { success: false, error: "保存旅行计划失败，请稍后重试" };
    }

    console.log("[travelWorkflow] success", { planId: savedPlan.id });

    return {
      success: true,
      plan: {
        id: savedPlan.id,
        destination,
        startDate: input.startDate || null,
        days,
        purpose: input.purpose || null,
        stylePreference: input.stylePreference || null,
        packingList: aiResult.packing_list,
        weatherContext,
        dayPlans,
      },
    };
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    const failureReason = classifyTravelPlanFailure(error);

    console.error("[travelWorkflow] generateTravelPlan failed", {
      failureReason,
      errorName,
      errorMessage,
    });

    return { success: false, error: QWEN_UNAVAILABLE_RECOMMENDATION };
  }
}
