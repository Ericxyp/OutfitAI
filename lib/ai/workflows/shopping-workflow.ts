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
import { formatQwenError } from "@/lib/ai/qwen";
import { CLOSET_STORAGE_BUCKET, MIN_CLOSET_FOR_AI } from "@/lib/constants";
import { getUserPersonalProfile } from "@/lib/memory/personal-profile";
import { getUserStyleProfile } from "@/lib/memory/style-profile";
import { createClient } from "@/lib/supabase/server";
import type { ClosetItem } from "@/types/database";

export type ShoppingWorkflowInput = {
  userId: string;
  image: File;
  userInput?: ShoppingUserInput;
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
    console.error("[shoppingWorkflow] cleanup image failed", {
      filePath,
      message: error.message,
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
    return { success: false, error: "请上传商品图片" };
  }

  if (input.image.size > MAX_IMAGE_SIZE) {
    return { success: false, error: "图片超过 5MB" };
  }

  if (!ALLOWED_IMAGE_TYPES.has(input.image.type)) {
    return {
      success: false,
      error: "不支持的图片格式，请使用 JPG、PNG 或 WebP。",
    };
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

  const fileExt = input.image.name.split(".").pop()?.toLowerCase() || "jpg";
  const filePath = `${input.userId}/shopping/${crypto.randomUUID()}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from(CLOSET_STORAGE_BUCKET)
    .upload(filePath, input.image, {
      contentType: input.image.type,
      upsert: false,
    });

  if (uploadError) {
    console.error("[shoppingWorkflow] image upload failed", {
      message: uploadError.message,
    });
    return { success: false, error: "图片上传失败，请稍后重试" };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(CLOSET_STORAGE_BUCKET).getPublicUrl(filePath);

  console.log("[shoppingWorkflow] image upload success", {
    filePath,
    imageSize: input.image.size,
    mimeType: input.image.type,
  });

  let imageBase64: string;
  try {
    imageBase64 = await fileToBase64(input.image);
  } catch (error) {
    console.error("[shoppingWorkflow] fileToBase64 failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    await removeUploadedImage(supabase, filePath);
    return { success: false, error: PRODUCT_ANALYSIS_ERROR };
  }

  let product: ProductAnalysis;
  try {
    console.log("[shoppingWorkflow] analyzeProduct start", {
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

    console.log("[shoppingWorkflow] analyzeProduct success", {
      productName: product.name,
      category: product.category,
    });
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    console.error("[shoppingWorkflow] analyzeProduct failed", {
      errorName,
      errorMessage,
      formatted: formatQwenError(error),
    });

    await removeUploadedImage(supabase, filePath);

    if (
      errorMessage.includes("无法识别") ||
      errorMessage.includes("缺少 image")
    ) {
      return { success: false, error: errorMessage };
    }

    return { success: false, error: PRODUCT_ANALYSIS_ERROR };
  }

  const [styleProfile, personalProfile] = await Promise.all([
    getUserStyleProfile(input.userId),
    getUserPersonalProfile(input.userId),
  ]);

  let aiResult;
  try {
    console.log("[shoppingWorkflow] generateShoppingCheck start", {
      hasStyleProfile: styleProfile !== null && styleProfile.feedbackCount > 0,
      hasPersonalProfile: personalProfile !== null,
      closetCount: closetItems.length,
    });

    aiResult = await generateShoppingCheck({
      product,
      closetItems,
      styleProfile,
      personalProfile,
    });

    console.log("[shoppingWorkflow] generateShoppingCheck success", {
      compatibilityScore: aiResult.compatibility_score,
      recommendation: aiResult.recommendation,
      outfitIdeaCount: aiResult.outfit_ideas.length,
    });
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    console.error("[shoppingWorkflow] generateShoppingCheck failed", {
      errorName,
      errorMessage,
      formatted: formatQwenError(error),
    });

    await removeUploadedImage(supabase, filePath);
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
    console.error("[shoppingWorkflow] save shopping_checks failed", {
      message: saveError?.message,
      code: saveError?.code,
    });
    await removeUploadedImage(supabase, filePath);
    return { success: false, error: SAVE_SHOPPING_CHECK_ERROR };
  }

  console.log("[shoppingWorkflow] save shopping_checks success", {
    checkId: saved.id,
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
    },
  };
}
