import {
  analyzeProduct,
  mergeProductUserInput,
  type ProductAnalysis,
  type ShoppingUserInput,
} from "@/lib/ai/analyze-product";
import {
  generateShoppingCheck,
  type ShoppingOutfitIdea,
} from "@/lib/ai/generate-shopping-check";
import { trackEvent } from "@/lib/analytics/track-event";
import { trackFailureEvent } from "@/lib/analytics/track-failure";
import type { FailureReason } from "@/lib/analytics/event-schema";
import { CLOSET_STORAGE_BUCKET, MIN_CLOSET_FOR_AI } from "@/lib/constants";
import { retrieveStyleKnowledge } from "@/lib/knowledge/retrieve-style-knowledge";
import {
  getProductRecommendationsForShoppingCheck,
  type ProductRecommendation,
} from "@/lib/commerce/product-recommendations";
import { getUserPersonalProfile } from "@/lib/memory/personal-profile";
import { getUserStyleProfile } from "@/lib/memory/style-profile";
import { createClient } from "@/lib/supabase/server";
import { logger, safeErrorFields } from "@/lib/logger";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClosetItem, Database } from "@/types/database";

export type ShoppingWorkflowInput = {
  userId: string;
  image: File;
  userInput?: ShoppingUserInput;
  /** Bearer-authenticated client for mobile API routes */
  supabase?: SupabaseClient<Database>;
};

export type ShoppingWorkflowOutfitIdea = {
  title: string;
  selectedItemIds: string[];
  summary: string;
  items: ClosetItem[];
};

export type ShoppingWorkflowResult = {
  id: string;
  productImageUrl: string | null;
  product: ProductAnalysis;
  compatibilityScore: number;
  matchCount: number;
  suitableStyles: string[];
  purchaseRecommendation: "buy" | "consider" | "skip";
  reasons: string[];
  risks: string[];
  outfitIdeas: ShoppingWorkflowOutfitIdea[];
  recommendedProducts: ProductRecommendation[];
};

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const INSUFFICIENT_CLOSET_MESSAGE =
  "你的衣橱还不够丰富，建议先添加至少 3 件衣服，我才能帮你分析搭配效果。";

const PRODUCT_ANALYSIS_ERROR =
  "商品图片识别失败，请换一张更清晰的商品图";

const GENERATE_RECOMMENDATION_ERROR =
  "AI 暂时无法生成购买建议，请稍后重试";

const SAVE_SHOPPING_CHECK_ERROR =
  "保存购物分析失败，请确认 shopping_checks 表已创建";

async function trackShoppingCheckFailed(
  userId: string,
  reason: FailureReason,
  metadata?: Record<string, unknown>
) {
  await trackFailureEvent({
    userId,
    eventName: "shopping_check_failed",
    feature: "shopping",
    reason,
    metadata,
  });
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return buffer.toString("base64");
}

function collectMatchedItemIds(ideas: ShoppingOutfitIdea[]): string[] {
  const seen = new Set<string>();
  const matched: string[] = [];

  for (const idea of ideas) {
    for (const id of idea.selected_item_ids) {
      if (!seen.has(id)) {
        seen.add(id);
        matched.push(id);
      }
    }
  }

  return matched;
}

async function removeUploadedImage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  filePath: string
): Promise<void> {
  const { error } = await supabase.storage
    .from(CLOSET_STORAGE_BUCKET)
    .remove([filePath]);

  if (error) {
    logger.error("[shoppingWorkflow] cleanup image failed", {
      feature: "shopping",
      reason: "cleanup_failed",
      errorName: "StorageError",
      errorMessage: error.message.slice(0, 200),
    });
  }
}

export async function runShoppingWorkflow(
  input: ShoppingWorkflowInput
): Promise<
  | { success: true; result: ShoppingWorkflowResult }
  | { success: false; error: string; needsMoreClothes?: boolean }
> {
  if (!(input.image instanceof File) || input.image.size === 0) {
    await trackShoppingCheckFailed(input.userId, "unknown", { hasImage: false });
    return { success: false, error: "请上传商品图片" };
  }

  if (input.image.size > MAX_IMAGE_SIZE) {
    await trackShoppingCheckFailed(input.userId, "unknown", { hasImage: true });
    return { success: false, error: "图片超过 5MB" };
  }

  if (!ALLOWED_IMAGE_TYPES.has(input.image.type)) {
    await trackShoppingCheckFailed(input.userId, "unknown", { hasImage: true });
    return {
      success: false,
      error: "不支持的图片格式，请使用 JPG、PNG 或 WebP。",
    };
  }

  const supabase = input.supabase ?? (await createClient());

  const { data: closetItems, error: closetError } = await supabase
    .from("closet_items")
    .select("*")
    .eq("user_id", input.userId)
    .eq("status", "ready")
    .order("created_at", { ascending: false });

  if (closetError || !closetItems) {
    await trackShoppingCheckFailed(input.userId, "closet_read_failed", {
      hasImage: true,
    });
    return { success: false, error: "读取衣橱失败，请稍后重试" };
  }

  if (closetItems.length < MIN_CLOSET_FOR_AI) {
    await trackShoppingCheckFailed(input.userId, "insufficient_closet", {
      hasImage: true,
    });
    return {
      success: false,
      error: INSUFFICIENT_CLOSET_MESSAGE,
      needsMoreClothes: true,
    };
  }

  const fileExt = input.image.name.split(".").pop()?.toLowerCase() || "jpg";
  const filePath = `${input.userId}/shopping/${crypto.randomUUID()}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from(CLOSET_STORAGE_BUCKET)
    .upload(filePath, input.image, {
      contentType: input.image.type,
      upsert: false,
    });

  if (uploadError) {
    logger.error("[shoppingWorkflow] image upload failed", {
      feature: "shopping",
      reason: "image_upload_failed",
      errorName: "StorageError",
      errorMessage: uploadError.message.slice(0, 200),
    });
    await trackShoppingCheckFailed(input.userId, "image_upload_failed", {
      hasImage: true,
    });
    return { success: false, error: "图片上传失败，请稍后重试" };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(CLOSET_STORAGE_BUCKET).getPublicUrl(filePath);

  logger.debug("[shoppingWorkflow] image upload success", {
    imageSize: input.image.size,
    mimeType: input.image.type,
  });

  let imageBase64: string;
  try {
    imageBase64 = await fileToBase64(input.image);
  } catch (error) {
    logger.error("[shoppingWorkflow] fileToBase64 failed", {
      feature: "shopping",
      reason: "file_read_failed",
      ...safeErrorFields(error),
    });
    await removeUploadedImage(supabase, filePath);
    await trackShoppingCheckFailed(input.userId, "product_analysis_failed", {
      hasImage: true,
    });
    return { success: false, error: PRODUCT_ANALYSIS_ERROR };
  }

  let product: ProductAnalysis;
  try {
    logger.debug("[shoppingWorkflow] analyzeProduct start", {
      base64Length: imageBase64.length,
      mimeType: input.image.type,
      hasProductName: Boolean(input.userInput?.productName),
    });

    const visionProduct = await analyzeProduct({
      image_base64: imageBase64,
      mimeType: input.image.type,
      productName: input.userInput?.productName,
    });

    product = mergeProductUserInput(visionProduct, input.userInput);

    logger.info("[shoppingWorkflow] analyzeProduct success", {
      category: product.category,
    });
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    logger.error("[shoppingWorkflow] analyzeProduct failed", {
      feature: "shopping",
      reason: "analyze_failed",
      errorName,
      errorMessage: errorMessage.slice(0, 200),
    });

    await removeUploadedImage(supabase, filePath);

    if (
      errorMessage.includes("无法识别") ||
      errorMessage.includes("缺少 image")
    ) {
      await trackShoppingCheckFailed(input.userId, "product_analysis_failed", {
        hasImage: true,
      });
      return { success: false, error: errorMessage };
    }

    await trackShoppingCheckFailed(input.userId, "product_analysis_failed", {
      hasImage: true,
    });
    return { success: false, error: PRODUCT_ANALYSIS_ERROR };
  }

  const [styleProfile, personalProfile] = await Promise.all([
    getUserStyleProfile(input.userId, supabase),
    getUserPersonalProfile(input.userId, supabase),
  ]);

  const styleKnowledge = await retrieveStyleKnowledge({
    supabase,
    query: [
      product.name,
      product.category,
      product.color,
      ...(product.style_tags ?? []),
      input.userInput?.productName,
      input.userInput?.question,
    ]
      .filter(Boolean)
      .join(" "),
    occasion:
      product.occasion_tags?.join("、") ||
      product.category ||
      input.userInput?.question ||
      undefined,
    weatherSummary: undefined,
    styleProfile,
    personalProfile,
    limit: 6,
  });

  let aiResult;
  try {
    logger.info("[shoppingWorkflow] generateShoppingCheck start", {
      hasStyleProfile: styleProfile !== null && styleProfile.feedbackCount > 0,
      hasPersonalProfile: personalProfile !== null,
      styleKnowledgeCount: styleKnowledge.length,
      closetCount: closetItems.length,
    });

    aiResult = await generateShoppingCheck({
      product,
      closetItems,
      styleProfile,
      personalProfile,
      styleKnowledge,
    });

    logger.info("[shoppingWorkflow] generateShoppingCheck success", {
      compatibilityScore: aiResult.compatibility_score,
      recommendation: aiResult.recommendation,
      outfitIdeaCount: aiResult.outfit_ideas.length,
    });
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    logger.error("[shoppingWorkflow] generateShoppingCheck failed", {
      feature: "shopping",
      reason: "generate_failed",
      errorName,
      errorMessage: errorMessage.slice(0, 200),
    });

    await removeUploadedImage(supabase, filePath);
    await trackShoppingCheckFailed(input.userId, "shopping_generation_failed", {
      hasImage: true,
      hasStyleProfile: styleProfile !== null && styleProfile.feedbackCount > 0,
      hasPersonalProfile: personalProfile !== null,
    });
    return { success: false, error: GENERATE_RECOMMENDATION_ERROR };
  }

  const closetMap = new Map(closetItems.map((item) => [item.id, item]));
  const matchedItemIds = collectMatchedItemIds(aiResult.outfit_ideas);

  const outfitIdeas: ShoppingWorkflowOutfitIdea[] = aiResult.outfit_ideas
    .filter((idea) => idea.selected_item_ids.length > 0)
    .map((idea) => ({
      title: idea.title,
      selectedItemIds: idea.selected_item_ids,
      summary: idea.summary,
      items: idea.selected_item_ids
        .map((id) => closetMap.get(id))
        .filter((item): item is ClosetItem => Boolean(item)),
    }));

  const outfitIdeasForDb = outfitIdeas.map((idea) => ({
    title: idea.title,
    selected_item_ids: idea.selectedItemIds,
    summary: idea.summary,
  }));

  const { data: saved, error: saveError } = await supabase
    .from("shopping_checks")
    .insert({
      user_id: input.userId,
      product_image_url: publicUrl,
      product_analysis: product,
      compatibility_score: aiResult.compatibility_score,
      matched_item_ids: matchedItemIds,
      outfit_ideas: outfitIdeasForDb,
      recommendation: aiResult.recommendation,
    })
    .select("id")
    .single();

  if (saveError || !saved) {
    logger.error("[shoppingWorkflow] save shopping_checks failed", {
      feature: "shopping",
      reason: "save_failed",
      errorName: saveError?.name ?? "PostgrestError",
      errorMessage: (saveError?.message ?? "missing row").slice(0, 200),
    });
    await removeUploadedImage(supabase, filePath);
    await trackShoppingCheckFailed(input.userId, "database_missing", {
      hasImage: true,
    });
    return { success: false, error: SAVE_SHOPPING_CHECK_ERROR };
  }

  await trackEvent({
    userId: input.userId,
    eventName: "shopping_check_generated",
    entityType: "shopping_check",
    entityId: saved.id,
    metadata: {
      compatibilityScore: aiResult.compatibility_score,
      recommendation: aiResult.recommendation,
      matchCount: aiResult.match_count,
      hasStyleProfile:
        styleProfile !== null && styleProfile.feedbackCount > 0,
      hasPersonalProfile: personalProfile !== null,
    },
  });

  logger.info("[shoppingWorkflow] save shopping_checks success", {
    checkId: saved.id,
  });

  let recommendedProducts: ProductRecommendation[] = [];
  try {
    recommendedProducts = await getProductRecommendationsForShoppingCheck({
      supabase,
      productAnalysis: product,
      styleProfile,
      personalProfile,
      limit: 4,
    });
  } catch (recommendationError) {
    logger.warn("[shoppingWorkflow] product recommendations skipped", {
      ...safeErrorFields(recommendationError),
    });
  }

  logger.debug("[shoppingWorkflow] recommendedProductCount", {
    count: recommendedProducts.length,
  });

  return {
    success: true,
    result: {
      id: saved.id,
      productImageUrl: publicUrl,
      product,
      compatibilityScore: aiResult.compatibility_score,
      matchCount: aiResult.match_count,
      suitableStyles: aiResult.suitable_styles,
      purchaseRecommendation: aiResult.recommendation,
      reasons: aiResult.reasons,
      risks: aiResult.risks,
      outfitIdeas,
      recommendedProducts,
    },
  };
}
