import type { ProductAnalysis } from "@/lib/ai/analyze-product";
import { createClient } from "@/lib/supabase/server";
import type { ClosetItem, Json } from "@/types/database";

const HISTORY_LIMIT = 30;

const PURCHASE_LABELS: Record<string, string> = {
  buy: "推荐购买",
  consider: "谨慎考虑",
  skip: "不建议购买",
};

export type HistoryThumbnail = Pick<ClosetItem, "id" | "name" | "image_url">;

export type OutfitHistoryRecord = {
  id: string;
  title: string;
  summary: string;
  createdAt: string;
  items: HistoryThumbnail[];
};

export type TravelHistoryRecord = {
  id: string;
  title: string;
  summary: string;
  createdAt: string;
  items: HistoryThumbnail[];
};

export type ShoppingHistoryRecord = {
  id: string;
  title: string;
  summary: string;
  createdAt: string;
  productImageUrl: string | null;
  items: HistoryThumbnail[];
};

export type UserHistory = {
  outfits: OutfitHistoryRecord[];
  travelPlans: TravelHistoryRecord[];
  shoppingChecks: ShoppingHistoryRecord[];
};

type OutfitIdeaDb = {
  title?: string;
  summary?: string;
  selected_item_ids?: string[];
};

function mapThumbnails(
  itemIds: string[],
  closetMap: Map<string, HistoryThumbnail>
): HistoryThumbnail[] {
  const seen = new Set<string>();
  const items: HistoryThumbnail[] = [];

  for (const id of itemIds) {
    if (seen.has(id)) {
      continue;
    }

    const item = closetMap.get(id);
    if (item) {
      seen.add(id);
      items.push(item);
    }
  }

  return items;
}

function parseProductName(analysis: Json | null): string {
  if (!analysis || typeof analysis !== "object" || Array.isArray(analysis)) {
    return "未知商品";
  }

  const name = (analysis as ProductAnalysis).name;
  return typeof name === "string" && name.trim() ? name.trim() : "未知商品";
}

function parseFirstOutfitSummary(outfitIdeas: Json | null): string | null {
  if (!Array.isArray(outfitIdeas) || outfitIdeas.length === 0) {
    return null;
  }

  const first = outfitIdeas[0] as OutfitIdeaDb;
  return typeof first.summary === "string" && first.summary.trim()
    ? first.summary.trim()
    : null;
}

function buildShoppingSummary(
  compatibilityScore: number | null,
  recommendation: string | null,
  outfitIdeas: Json | null
): string {
  const ideaSummary = parseFirstOutfitSummary(outfitIdeas);
  if (ideaSummary) {
    return ideaSummary;
  }

  const parts: string[] = [];
  if (compatibilityScore !== null) {
    parts.push(`匹配度 ${compatibilityScore}%`);
  }

  if (recommendation && PURCHASE_LABELS[recommendation]) {
    parts.push(PURCHASE_LABELS[recommendation]);
  }

  return parts.length > 0 ? parts.join(" · ") : "购物搭配分析";
}

function buildTravelSummary(
  days: number,
  purpose: string | null,
  firstDaySummary: string | null
): string {
  if (firstDaySummary) {
    return firstDaySummary;
  }

  const parts = [`${days} 天行程`];
  if (purpose?.trim()) {
    parts.push(purpose.trim());
  }

  return parts.join(" · ");
}

export async function getUserHistory(userId: string): Promise<UserHistory> {
  const supabase = await createClient();

  const [outfitResult, travelResult, shoppingResult] = await Promise.all([
    supabase
      .from("outfit_recommendations")
      .select("id, title, summary, selected_item_ids, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
    supabase
      .from("travel_plans")
      .select("id, destination, days, purpose, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
    supabase
      .from("shopping_checks")
      .select(
        "id, product_image_url, product_analysis, matched_item_ids, outfit_ideas, compatibility_score, recommendation, created_at"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
  ]);

  const outfits = outfitResult.data ?? [];
  const travelPlans = travelResult.data ?? [];
  const shoppingChecks = shoppingResult.data ?? [];

  const travelPlanIds = travelPlans.map((plan) => plan.id);
  let travelDays: Array<{
    plan_id: string;
    day_index: number;
    summary: string | null;
    selected_item_ids: string[];
  }> = [];

  if (travelPlanIds.length > 0) {
    const { data } = await supabase
      .from("travel_plan_days")
      .select("plan_id, day_index, summary, selected_item_ids")
      .in("plan_id", travelPlanIds)
      .order("day_index", { ascending: true });

    travelDays = data ?? [];
  }

  const allItemIds = new Set<string>();

  for (const outfit of outfits) {
    for (const id of outfit.selected_item_ids) {
      allItemIds.add(id);
    }
  }

  for (const day of travelDays) {
    for (const id of day.selected_item_ids) {
      allItemIds.add(id);
    }
  }

  for (const check of shoppingChecks) {
    for (const id of check.matched_item_ids) {
      allItemIds.add(id);
    }
  }

  let closetMap = new Map<string, HistoryThumbnail>();

  if (allItemIds.size > 0) {
    const { data: closetItems } = await supabase
      .from("closet_items")
      .select("id, name, image_url")
      .eq("user_id", userId)
      .in("id", Array.from(allItemIds));

    closetMap = new Map(
      (closetItems ?? []).map((item) => [item.id, item])
    );
  }

  const daysByPlan = new Map<string, typeof travelDays>();
  for (const day of travelDays) {
    const existing = daysByPlan.get(day.plan_id) ?? [];
    existing.push(day);
    daysByPlan.set(day.plan_id, existing);
  }

  return {
    outfits: outfits.map((record) => ({
      id: record.id,
      title: record.title?.trim() || "穿搭推荐",
      summary: record.summary?.trim() || record.title?.trim() || "暂无摘要",
      createdAt: record.created_at,
      items: mapThumbnails(record.selected_item_ids, closetMap),
    })),
    travelPlans: travelPlans.map((plan) => {
      const planDays = daysByPlan.get(plan.id) ?? [];
      const itemIds = planDays.flatMap((day) => day.selected_item_ids);
      const firstDaySummary = planDays[0]?.summary?.trim() || null;

      return {
        id: plan.id,
        title: plan.destination,
        summary: buildTravelSummary(plan.days, plan.purpose, firstDaySummary),
        createdAt: plan.created_at,
        items: mapThumbnails(itemIds, closetMap),
      };
    }),
    shoppingChecks: shoppingChecks.map((check) => ({
      id: check.id,
      title: parseProductName(check.product_analysis),
      summary: buildShoppingSummary(
        check.compatibility_score,
        check.recommendation,
        check.outfit_ideas
      ),
      createdAt: check.created_at,
      productImageUrl: check.product_image_url,
      items: mapThumbnails(check.matched_item_ids, closetMap),
    })),
  };
}
