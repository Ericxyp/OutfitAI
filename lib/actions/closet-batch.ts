"use server";

import { revalidatePath } from "next/cache";
import { analyzeClothing } from "@/lib/ai/analyze-clothing";
import { formatQwenError, isQwenTimeoutError } from "@/lib/ai/qwen";
import { trackEvent } from "@/lib/analytics/track-event";
import { trackFailureEvent } from "@/lib/analytics/track-failure";
import {
  BATCH_ALLOWED_MIME_TYPES,
  MAX_BATCH_IMAGE_SIZE,
} from "@/lib/batch/file-validation";
import {
  getClothingRejectionError,
  isAcceptableClothing,
} from "@/lib/closet/clothing-gate";
import { upsertClosetItemEmbedding } from "@/lib/closet/upsert-closet-embedding";
import { validateClosetItemFormValues } from "@/lib/closet/form-validation";
import { CLOSET_STORAGE_BUCKET } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { ClothingAnalysis } from "@/types/closet";

export type BatchAnalyzeResponse =
  | { success: true; data: ClothingAnalysis }
  | { success: false; error: string; notClothing?: boolean };

export type BatchSaveResponse =
  | { success: true; closetItemId: string }
  | { success: false; error: string };

function sanitizeAnalysisError(error: unknown): string {
  if (isQwenTimeoutError(error)) {
    return "识别服务暂时不可用，请稍后重试。";
  }

  const message = formatQwenError(error);
  if (
    message.includes("格式") ||
    message.toLowerCase().includes("json") ||
    message.includes("无效")
  ) {
    return "识别结果异常，请重试。";
  }

  return "识别服务暂时不可用，请稍后重试。";
}

function validateBatchImage(image: File): string | null {
  if (!(image instanceof File) || image.size === 0) {
    return "请上传衣服图片";
  }

  if (image.size > MAX_BATCH_IMAGE_SIZE) {
    return "图片超过 5MB，请换一张更小的图片。";
  }

  const type = (image.type || "").toLowerCase();
  const name = image.name.toLowerCase();

  if (
    type === "image/heic" ||
    type === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  ) {
    return "暂不支持 HEIC，请在相册中转换为 JPG 后重试。";
  }

  if (!BATCH_ALLOWED_MIME_TYPES.has(type)) {
    return "不支持的图片格式，请使用 JPG、PNG 或 WebP。";
  }

  return null;
}

/**
 * 批量上传：单张图片独立识别。
 * 不接受前端 userId；每张图单独校验 MIME/大小。
 */
export async function analyzeBatchClothingImage(
  formData: FormData
): Promise<BatchAnalyzeResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "请先登录" };
  }

  const imageBase64 = formData.get("image_base64")?.toString();
  const mimeType = formData.get("mime_type")?.toString() || "image/jpeg";

  if (!imageBase64) {
    return { success: false, error: "请上传图片" };
  }

  if (!BATCH_ALLOWED_MIME_TYPES.has(mimeType)) {
    return { success: false, error: "不支持的图片格式，请使用 JPG、PNG 或 WebP。" };
  }

  // Rough size check on base64 payload (~4/3 expansion)
  const approxBytes = Math.floor((imageBase64.length * 3) / 4);
  if (approxBytes > MAX_BATCH_IMAGE_SIZE) {
    return { success: false, error: "图片超过 5MB，请换一张更小的图片。" };
  }

  try {
    const data = await analyzeClothing({
      image_base64: imageBase64,
      mimeType,
    });

    if (!isAcceptableClothing(data)) {
      await trackFailureEvent({
        userId: user.id,
        eventName: "closet_item_failed",
        feature: "closet",
        reason: "not_clothing",
        metadata: { hasImage: true, source: "batch" },
      });

      return {
        success: false,
        notClothing: true,
        error: getClothingRejectionError(data) || "未识别为可穿戴衣物",
      };
    }

    return { success: true, data };
  } catch (error) {
    console.error("[batch] analyze failed:", {
      message: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return { success: false, error: sanitizeAnalysisError(error) };
  }
}

/**
 * 批量上传：逐件保存（上传 Storage + 写 closet_items）。
 * 使用用户编辑后的字段，不再次调用 AI。
 * 幂等主要依赖前端 completed/saving 状态；无 DB client_request_id。
 */
export async function saveBatchClosetItem(
  formData: FormData
): Promise<BatchSaveResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "请先登录" };
  }

  const image = formData.get("image");
  if (!(image instanceof File)) {
    return { success: false, error: "请上传衣服图片" };
  }

  const imageError = validateBatchImage(image);
  if (imageError) {
    return { success: false, error: imageError };
  }

  const validation = validateClosetItemFormValues({
    name: formData.get("name")?.toString(),
    category: formData.get("category")?.toString(),
    color: formData.get("color")?.toString(),
    material: formData.get("material")?.toString(),
    notes: formData.get("notes")?.toString(),
    style_tags: formData.getAll("style_tags").map(String),
    season_tags: formData.getAll("season_tags").map(String),
    occasion_tags: formData.getAll("occasion_tags").map(String),
  });

  if (!validation.ok) {
    return { success: false, error: validation.error };
  }

  const values = validation.values;
  const fileExt = image.name.split(".").pop()?.toLowerCase() || "jpg";
  const safeExt = ["jpg", "jpeg", "png", "webp"].includes(fileExt)
    ? fileExt
    : "jpg";
  const filePath = `${user.id}/${crypto.randomUUID()}.${safeExt}`;

  const { error: uploadError } = await supabase.storage
    .from(CLOSET_STORAGE_BUCKET)
    .upload(filePath, image, {
      contentType: image.type,
      upsert: false,
    });

  if (uploadError) {
    console.error("[batch] storage upload failed:", {
      message: uploadError.message,
    });
    await trackFailureEvent({
      userId: user.id,
      eventName: "closet_item_failed",
      feature: "closet",
      reason: "image_upload_failed",
      metadata: { hasImage: true, source: "batch" },
    });
    return { success: false, error: "图片上传失败，请稍后重试" };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(CLOSET_STORAGE_BUCKET).getPublicUrl(filePath);

  const { data, error } = await supabase
    .from("closet_items")
    .insert({
      user_id: user.id,
      image_url: publicUrl,
      name: values.name,
      category: values.category,
      color: values.color || null,
      material: values.material || null,
      style_tags: values.style_tags,
      season_tags: values.season_tags,
      occasion_tags: values.occasion_tags,
      notes: values.notes || null,
      status: "ready",
    })
    .select("id")
    .single();

  if (error || !data) {
    try {
      await supabase.storage.from(CLOSET_STORAGE_BUCKET).remove([filePath]);
    } catch (cleanupError) {
      console.warn("[batch] orphan storage cleanup failed:", {
        message:
          cleanupError instanceof Error
            ? cleanupError.message.slice(0, 200)
            : "unknown",
      });
    }

    await trackFailureEvent({
      userId: user.id,
      eventName: "closet_item_failed",
      feature: "closet",
      reason: "save_failed",
      metadata: {
        hasImage: true,
        category: values.category,
        source: "batch",
      },
    });
    return { success: false, error: "保存失败，请稍后重试" };
  }

  try {
    const { data: fullItem } = await supabase
      .from("closet_items")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", user.id)
      .single();

    if (fullItem) {
      await upsertClosetItemEmbedding(supabase, fullItem);
    }
  } catch (embeddingError) {
    console.warn("[batch] embedding update skipped:", embeddingError);
  }

  await trackEvent({
    userId: user.id,
    eventName: "closet_item_created",
    entityType: "closet_item",
    entityId: data.id,
    metadata: {
      category: values.category,
      hasImage: true,
      source: "batch",
    },
  });

  revalidatePath("/closet");
  revalidatePath("/profile");

  return { success: true, closetItemId: data.id };
}

export async function trackClosetBatchEvent(input: {
  eventName:
    | "closet_batch_started"
    | "closet_batch_analysis_completed"
    | "closet_batch_completed"
    | "closet_batch_failed";
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    await trackEvent({
      userId: user.id,
      eventName: input.eventName,
      entityType: "closet_batch",
      metadata: {
        feature: "closet",
        ...input.metadata,
      },
    });
  } catch (error) {
    console.warn("[batch] analytics failed:", error);
  }
}
