export const ANALYTICS_EVENT_NAMES = [
  "closet_item_created",
  "closet_item_failed",
  "outfit_generated",
  "recommendation_failed",
  "feedback_submitted",
  "feedback_failed",
  "travel_plan_generated",
  "travel_plan_failed",
  "shopping_check_generated",
  "shopping_check_failed",
  "commerce_product_clicked",
  "personal_profile_saved",
  "personal_profile_failed",
  "style_profile_updated",
  "style_profile_failed",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

export const FAILURE_EVENT_NAMES = [
  "recommendation_failed",
  "travel_plan_failed",
  "shopping_check_failed",
  "closet_item_failed",
  "feedback_failed",
  "personal_profile_failed",
  "style_profile_failed",
] as const;

export type AnalyticsFailureEventName = (typeof FAILURE_EVENT_NAMES)[number];

export const FEEDBACK_EVENT_NAME = "feedback_submitted" as const;

export const ANALYTICS_FEATURES = [
  "outfit",
  "travel",
  "shopping",
  "closet",
  "feedback",
  "profile",
  "style_profile",
] as const;

export type AnalyticsFeature = (typeof ANALYTICS_FEATURES)[number];

export const FAILURE_REASONS = [
  "insufficient_closet",
  "closet_read_failed",
  "weather_lookup_failed",
  "qwen_unavailable",
  "invalid_ai_output",
  "save_failed",
  "database_missing",
  "image_upload_failed",
  "not_clothing",
  "product_analysis_failed",
  "travel_generation_failed",
  "shopping_generation_failed",
  "unknown",
] as const;

export type FailureReason = (typeof FAILURE_REASONS)[number];

const FAILURE_REASON_SET = new Set<string>(FAILURE_REASONS);

const FAILURE_REASON_LABELS: Record<FailureReason, string> = {
  insufficient_closet: "衣橱数量不足",
  closet_read_failed: "读取衣橱失败",
  weather_lookup_failed: "天气查询失败",
  qwen_unavailable: "AI 服务不可用",
  invalid_ai_output: "AI 输出异常",
  save_failed: "保存结果失败",
  database_missing: "数据表未就绪",
  image_upload_failed: "图片上传失败",
  not_clothing: "非衣物图片",
  product_analysis_failed: "商品识别失败",
  travel_generation_failed: "旅行规划生成失败",
  shopping_generation_failed: "购物分析生成失败",
  unknown: "未知原因",
};

const FEATURE_EVENT_LABELS: Record<string, string> = {
  closet_item_created: "添加衣服",
  closet_item_failed: "添加衣服失败",
  outfit_generated: "穿搭推荐",
  recommendation_failed: "推荐失败",
  feedback_submitted: "反馈提交",
  feedback_failed: "反馈失败",
  travel_plan_generated: "旅行规划",
  travel_plan_failed: "旅行规划失败",
  shopping_check_generated: "购物分析",
  shopping_check_failed: "购物分析失败",
  commerce_product_clicked: "商品点击",
  personal_profile_saved: "保存个人信息",
  personal_profile_failed: "保存个人信息失败",
  style_profile_updated: "风格画像更新",
  style_profile_failed: "风格画像更新失败",
};

const LEGACY_REASON_PATTERNS: Array<{ pattern: RegExp; reason: FailureReason }> =
  [
    { pattern: /衣橱还不够|至少\s*3\s*件/, reason: "insufficient_closet" },
    { pattern: /读取衣橱/, reason: "closet_read_failed" },
    { pattern: /天气/, reason: "weather_lookup_failed" },
    { pattern: /Qwen|AI 暂时|未返回内容|API/, reason: "qwen_unavailable" },
    { pattern: /格式|内部编号|无效/, reason: "invalid_ai_output" },
    { pattern: /保存.*失败|保存推荐|保存旅行|保存购物/, reason: "save_failed" },
    {
      pattern: /shopping_checks|数据表|database/i,
      reason: "database_missing",
    },
    { pattern: /图片上传/, reason: "image_upload_failed" },
    { pattern: /商品.*识别|识别失败/, reason: "product_analysis_failed" },
    { pattern: /旅行.*计划|旅行规划/, reason: "travel_generation_failed" },
    { pattern: /购买建议|购物分析/, reason: "shopping_generation_failed" },
  ];

export function getEventLabel(eventName: string): string {
  return FEATURE_EVENT_LABELS[eventName] ?? eventName;
}

export function getFailureReasonLabel(reason: string): string {
  const normalized = normalizeFailureReason(reason);
  return FAILURE_REASON_LABELS[normalized];
}

export function normalizeFailureReason(reason: string): FailureReason {
  const trimmed = reason.trim();
  if (!trimmed) {
    return "unknown";
  }

  if (FAILURE_REASON_SET.has(trimmed)) {
    return trimmed as FailureReason;
  }

  for (const { pattern, reason: mapped } of LEGACY_REASON_PATTERNS) {
    if (pattern.test(trimmed)) {
      return mapped;
    }
  }

  return "unknown";
}

export function buildFailureMetadata(
  feature: AnalyticsFeature,
  reason: FailureReason,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  return {
    feature,
    reason,
    ...extra,
  };
}
