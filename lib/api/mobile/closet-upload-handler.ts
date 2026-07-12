import { analyzeClothing } from "@/lib/ai/analyze-clothing";
import { formatQwenError, isQwenTimeoutError } from "@/lib/ai/qwen";
import { upsertClosetItemEmbedding } from "@/lib/closet/upsert-closet-embedding";
import {
  getClothingRejectionError,
  isAcceptableClothing,
} from "@/lib/closet/clothing-gate";
import { CLOSET_STORAGE_BUCKET, PAGE_COPY } from "@/lib/constants";
import { trackEvent } from "@/lib/analytics/track-event";
import { trackFailureEvent } from "@/lib/analytics/track-failure";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ClosetItem } from "@/types/database";

const ALLOWED_CLOSET_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const MAX_CLOSET_IMAGE_SIZE = 5 * 1024 * 1024;

export async function uploadMobileClosetItem(
  supabase: SupabaseClient<Database>,
  userId: string,
  image: File
): Promise<
  | { success: true; item: ClosetItem }
  | { success: false; error: string }
> {
  if (image.size === 0) {
    return { success: false, error: "请上传衣服图片" };
  }

  if (image.size > MAX_CLOSET_IMAGE_SIZE) {
    return { success: false, error: "图片超过 5MB，请换一张更小的图片。" };
  }

  if (!ALLOWED_CLOSET_IMAGE_TYPES.has(image.type)) {
    return { success: false, error: "不支持的图片格式，请使用 JPG、PNG 或 WebP。" };
  }

  const arrayBuffer = await image.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  let analysis;
  try {
    analysis = await analyzeClothing({
      image_base64: base64,
      mimeType: image.type || "image/jpeg",
    });
  } catch (error) {
    console.error("[mobile closet upload] analyze failed:", error);
    if (isQwenTimeoutError(error)) {
      return { success: false, error: PAGE_COPY.addClothing.aiTimeout };
    }
    return {
      success: false,
      error: `识别失败：${formatQwenError(error)}`,
    };
  }

  if (!isAcceptableClothing(analysis)) {
    await trackFailureEvent({
      userId,
      eventName: "closet_item_failed",
      feature: "closet",
      reason: "not_clothing",
      metadata: { hasImage: true, source: "mobile" },
    });
    return { success: false, error: getClothingRejectionError(analysis) };
  }

  const fileExt = image.name.split(".").pop()?.toLowerCase() || "jpg";
  const filePath = `${userId}/${crypto.randomUUID()}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from(CLOSET_STORAGE_BUCKET)
    .upload(filePath, image, {
      contentType: image.type,
      upsert: false,
    });

  if (uploadError) {
    await trackFailureEvent({
      userId,
      eventName: "closet_item_failed",
      feature: "closet",
      reason: "image_upload_failed",
      metadata: { hasImage: true, source: "mobile" },
    });
    return { success: false, error: `图片上传失败：${uploadError.message}` };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(CLOSET_STORAGE_BUCKET).getPublicUrl(filePath);

  const name = analysis.name || "新衣服";
  const category = analysis.category || "上衣";
  const color = analysis.color || null;
  const material = analysis.material || null;
  const styleTags = analysis.style_tags ?? [];
  const seasonTags = analysis.season_tags ?? [];
  const occasionTags = analysis.occasion_tags ?? [];
  const notes = analysis.notes || null;

  const { data, error } = await supabase
    .from("closet_items")
    .insert({
      user_id: userId,
      image_url: publicUrl,
      name,
      category,
      color,
      material,
      style_tags: styleTags,
      season_tags: seasonTags,
      occasion_tags: occasionTags,
      notes,
      status: "ready",
    })
    .select("*")
    .single();

  if (error || !data) {
    await supabase.storage.from(CLOSET_STORAGE_BUCKET).remove([filePath]);
    await trackFailureEvent({
      userId,
      eventName: "closet_item_failed",
      feature: "closet",
      reason: "save_failed",
      metadata: { hasImage: true, category, source: "mobile" },
    });
    return { success: false, error: "保存失败，请稍后重试" };
  }

  try {
    await upsertClosetItemEmbedding(supabase, data);
  } catch (embeddingError) {
    console.warn("[mobile closet upload] embedding update skipped:", embeddingError);
  }

  await trackEvent({
    userId,
    eventName: "closet_item_added",
    entityType: "closet_item",
    entityId: data.id,
    metadata: { category, source: "mobile" },
  });

  return { success: true, item: data };
}
