import { createClient } from "@/lib/supabase/server";
import {
  FAILURE_EVENT_NAMES,
  getEventLabel,
  getFailureReasonLabel,
  normalizeFailureReason,
} from "@/lib/analytics/event-schema";
import {
  NEGATIVE_FEEDBACK_REASON_TAGS,
  POSITIVE_FEEDBACK_REASON_TAGS,
} from "@/lib/feedback/reason-tags";
import type { Json } from "@/types/database";

const TREND_DAYS = 7;

const POSITIVE_FEEDBACK_TYPES = new Set(["like", "save"]);
const NEGATIVE_FEEDBACK_TYPES = new Set(["dislike"]);

export type RecentEvent = {
  id: string;
  eventName: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type FeatureUsage = {
  eventName: string;
  label: string;
  count: number;
};

export type AcceptanceTrendPoint = {
  date: string;
  generated: number;
  accepted: number;
  acceptanceRate: number;
};

export type FailureReasonMetric = {
  reason: string;
  label: string;
  count: number;
};

export type ReasonTagMetric = {
  tag: string;
  count: number;
};

export type ClickedProductMetric = {
  productId: string;
  title: string;
  count: number;
};

export type MerchantClickMetric = {
  merchant: string;
  count: number;
};

export type UserMetrics = {
  totalClosetItems: number;
  totalOutfitGenerated: number;
  totalLiked: number;
  totalDisliked: number;
  totalSaved: number;
  positiveFeedbackCount: number;
  negativeFeedbackCount: number;
  satisfactionScore: number | null;
  acceptanceRate: number;
  acceptanceTrend: AcceptanceTrendPoint[];
  totalTravelPlans: number;
  totalShoppingChecks: number;
  totalCommerceClicks: number;
  shoppingToClickRate: number;
  topClickedProducts: ClickedProductMetric[];
  topMerchants: MerchantClickMetric[];
  totalFailures: number;
  failureReasons: FailureReasonMetric[];
  topPositiveReasons: ReasonTagMetric[];
  topNegativeReasons: ReasonTagMetric[];
  mostUsedFeatures: FeatureUsage[];
  recentEvents: RecentEvent[];
};

function metadataToRecord(metadata: Json | null): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return metadata as Record<string, unknown>;
}

function toDateKey(isoString: string): string {
  return isoString.slice(0, 10);
}

function getLastNDates(days: number): string[] {
  const dates: string[] = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - offset);
    dates.push(date.toISOString().slice(0, 10));
  }

  return dates;
}

function getFeedbackType(metadata: Record<string, unknown>): string | null {
  if (typeof metadata.feedbackType === "string") {
    return metadata.feedbackType;
  }

  if (typeof metadata.rating === "string") {
    return metadata.rating;
  }

  return null;
}

async function countEvents(
  userId: string,
  eventName: string
): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("event_logs")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("event_name", eventName);

  if (error) {
    console.warn("[analytics] countEvents failed:", {
      eventName,
      message: error.message,
    });
    return 0;
  }

  return count ?? 0;
}

async function countFeedbackByType(
  userId: string,
  feedbackType: string
): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_logs")
    .select("metadata")
    .eq("user_id", userId)
    .eq("event_name", "feedback_submitted");

  if (error) {
    console.warn("[analytics] countFeedbackByType failed:", {
      feedbackType,
      message: error.message,
    });
    return 0;
  }

  return (data ?? []).filter((row) => {
    const metadata = metadataToRecord(row.metadata);
    return getFeedbackType(metadata) === feedbackType;
  }).length;
}

function buildMostUsedFeatures(
  rows: Array<{ event_name: string }>
): FeatureUsage[] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    counts.set(row.event_name, (counts.get(row.event_name) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([eventName, count]) => ({
      eventName,
      label: getEventLabel(eventName),
      count,
    }));
}

function buildAcceptanceTrend(
  generatedRows: Array<{ created_at: string }>,
  feedbackRows: Array<{ created_at: string; metadata: Json | null }>
): AcceptanceTrendPoint[] {
  const dateKeys = getLastNDates(TREND_DAYS);
  const generatedByDate = new Map<string, number>();
  const acceptedByDate = new Map<string, number>();

  for (const date of dateKeys) {
    generatedByDate.set(date, 0);
    acceptedByDate.set(date, 0);
  }

  for (const row of generatedRows) {
    const date = toDateKey(row.created_at);
    if (!generatedByDate.has(date)) continue;
    generatedByDate.set(date, (generatedByDate.get(date) ?? 0) + 1);
  }

  for (const row of feedbackRows) {
    const metadata = metadataToRecord(row.metadata);
    const feedbackType = getFeedbackType(metadata);
    if (!feedbackType || !POSITIVE_FEEDBACK_TYPES.has(feedbackType)) {
      continue;
    }

    const date = toDateKey(row.created_at);
    if (!acceptedByDate.has(date)) continue;
    acceptedByDate.set(date, (acceptedByDate.get(date) ?? 0) + 1);
  }

  return dateKeys.map((date) => {
    const generated = generatedByDate.get(date) ?? 0;
    const accepted = acceptedByDate.get(date) ?? 0;

    return {
      date,
      generated,
      accepted,
      acceptanceRate: generated > 0 ? accepted / generated : 0,
    };
  });
}

function buildFailureReasons(
  rows: Array<{ metadata: Json | null }>
): FailureReasonMetric[] {
  const counts = new Map<FailureReasonMetric["reason"], number>();

  for (const row of rows) {
    const metadata = metadataToRecord(row.metadata);
    const reasonValue =
      typeof metadata.reason === "string" ? metadata.reason : "unknown";
    const reason = normalizeFailureReason(reasonValue);
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([reason, count]) => ({
      reason,
      label: getFailureReasonLabel(reason),
      count,
    }));
}

function aggregateReasonTags(
  rows: Array<{ rating: string; reason_tags?: string[] | null }>,
  allowedTags: readonly string[],
  limit = 5
): ReasonTagMetric[] {
  const allowed = new Set(allowedTags);
  const counts = new Map<string, number>();

  for (const row of rows) {
    for (const tag of row.reason_tags ?? []) {
      const trimmed = tag.trim();
      if (!trimmed || !allowed.has(trimmed)) continue;
      counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));
}

function aggregateClickedProducts(
  rows: Array<{
    product_recommendation_id: string | null;
    metadata: Json | null;
  }>
): ClickedProductMetric[] {
  const counts = new Map<string, { title: string; count: number }>();

  for (const row of rows) {
    if (!row.product_recommendation_id) continue;
    const metadata = metadataToRecord(row.metadata);
    const title =
      typeof metadata.productTitle === "string" && metadata.productTitle.trim()
        ? metadata.productTitle.trim()
        : "未命名商品";
    const existing = counts.get(row.product_recommendation_id);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(row.product_recommendation_id, { title, count: 1 });
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([productId, value]) => ({
      productId,
      title: value.title,
      count: value.count,
    }));
}

function aggregateMerchants(
  rows: Array<{ metadata: Json | null }>
): MerchantClickMetric[] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const metadata = metadataToRecord(row.metadata);
    const merchant =
      typeof metadata.merchant === "string" && metadata.merchant.trim()
        ? metadata.merchant.trim()
        : "未知商家";
    counts.set(merchant, (counts.get(merchant) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([merchant, count]) => ({ merchant, count }));
}

export async function getUserMetrics(userId: string): Promise<UserMetrics> {
  const supabase = await createClient();
  const trendStart = new Date();
  trendStart.setUTCHours(0, 0, 0, 0);
  trendStart.setUTCDate(trendStart.getUTCDate() - (TREND_DAYS - 1));
  const trendStartIso = trendStart.toISOString();

  const [
    closetCountResult,
    totalOutfitGenerated,
    totalLiked,
    totalDisliked,
    totalSaved,
    totalTravelPlans,
    totalShoppingChecks,
    totalFailures,
    allEventsResult,
    recentEventsResult,
    trendGeneratedResult,
    trendFeedbackResult,
    failureEventsResult,
    feedbackReasonRowsResult,
    commerceClicksCountResult,
    commerceClicksDetailResult,
  ] = await Promise.all([
    supabase
      .from("closet_items")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId),
    countEvents(userId, "outfit_generated"),
    countFeedbackByType(userId, "like"),
    countFeedbackByType(userId, "dislike"),
    countFeedbackByType(userId, "save"),
    countEvents(userId, "travel_plan_generated"),
    countEvents(userId, "shopping_check_generated"),
    supabase
      .from("event_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("event_name", [...FAILURE_EVENT_NAMES]),
    supabase.from("event_logs").select("event_name").eq("user_id", userId),
    supabase
      .from("event_logs")
      .select("id, event_name, entity_type, entity_id, metadata, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("event_logs")
      .select("created_at")
      .eq("user_id", userId)
      .eq("event_name", "outfit_generated")
      .gte("created_at", trendStartIso),
    supabase
      .from("event_logs")
      .select("created_at, metadata")
      .eq("user_id", userId)
      .eq("event_name", "feedback_submitted")
      .gte("created_at", trendStartIso),
    supabase
      .from("event_logs")
      .select("metadata")
      .eq("user_id", userId)
      .in("event_name", [...FAILURE_EVENT_NAMES]),
    supabase
      .from("feedback")
      .select("rating, reason_tags")
      .eq("user_id", userId),
    supabase
      .from("commerce_clicks")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("commerce_clicks")
      .select("product_recommendation_id, metadata")
      .eq("user_id", userId),
  ]);

  const totalClosetItems = closetCountResult.count ?? 0;
  const positiveFeedbackCount = totalLiked + totalSaved;
  const negativeFeedbackCount = totalDisliked;
  const totalFeedbackCount = positiveFeedbackCount + negativeFeedbackCount;
  const satisfactionScore =
    totalFeedbackCount > 0
      ? (positiveFeedbackCount / totalFeedbackCount) * 100
      : null;
  const acceptanceRate =
    totalOutfitGenerated > 0
      ? positiveFeedbackCount / totalOutfitGenerated
      : 0;

  const acceptanceTrend = buildAcceptanceTrend(
    trendGeneratedResult.data ?? [],
    trendFeedbackResult.data ?? []
  );

  const failureReasons = buildFailureReasons(failureEventsResult.data ?? []);

  const feedbackRows = feedbackReasonRowsResult.data ?? [];
  const topPositiveReasons = aggregateReasonTags(
    feedbackRows.filter((row) => POSITIVE_FEEDBACK_TYPES.has(row.rating)),
    POSITIVE_FEEDBACK_REASON_TAGS
  );
  const topNegativeReasons = aggregateReasonTags(
    feedbackRows.filter((row) => NEGATIVE_FEEDBACK_TYPES.has(row.rating)),
    NEGATIVE_FEEDBACK_REASON_TAGS
  );

  const recentEvents: RecentEvent[] = (recentEventsResult.data ?? []).map(
    (row) => ({
      id: row.id,
      eventName: row.event_name,
      entityType: row.entity_type,
      entityId: row.entity_id,
      metadata: metadataToRecord(row.metadata),
      createdAt: row.created_at,
    })
  );

  const totalCommerceClicks = commerceClicksCountResult.count ?? 0;
  const shoppingToClickRate =
    totalShoppingChecks > 0 ? totalCommerceClicks / totalShoppingChecks : 0;
  const topClickedProducts = aggregateClickedProducts(
    commerceClicksDetailResult.data ?? []
  );
  const topMerchants = aggregateMerchants(commerceClicksDetailResult.data ?? []);

  return {
    totalClosetItems,
    totalOutfitGenerated,
    totalLiked,
    totalDisliked,
    totalSaved,
    positiveFeedbackCount,
    negativeFeedbackCount,
    satisfactionScore,
    acceptanceRate,
    acceptanceTrend,
    totalTravelPlans,
    totalShoppingChecks,
    totalCommerceClicks,
    shoppingToClickRate,
    topClickedProducts,
    topMerchants,
    totalFailures: totalFailures.count ?? 0,
    failureReasons,
    topPositiveReasons,
    topNegativeReasons,
    mostUsedFeatures: buildMostUsedFeatures(allEventsResult.data ?? []),
    recentEvents,
  };
}
