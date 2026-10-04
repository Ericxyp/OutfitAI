"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  analyzeClothing,
} from "@/lib/ai/analyze-clothing";
import { formatQwenError, isQwenTimeoutError } from "@/lib/ai/qwen";
import {
  getClothingRejectionError,
  isAcceptableClothing,
} from "@/lib/closet/clothing-gate";
import { trackEvent } from "@/lib/analytics/track-event";
import { trackFailureEvent } from "@/lib/analytics/track-failure";
import {
  getMissingCustomTagColumnsMessage,
  isMissingCustomTagColumnsError,
  refreshClosetItemEmbedding,
  updateOwnedClosetItem,
} from "@/lib/closet/closet-persistence";
import { normalizeCustomTagList } from "@/lib/closet/custom-tags";
import { trackCustomTagChange } from "@/lib/closet/custom-tag-events";
import { validateClosetItemFormValues } from "@/lib/closet/form-validation";
import { CLOSET_STORAGE_BUCKET, PAGE_COPY } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { ClothingAnalysis } from "@/types/closet";

export type ClosetActionState = {
  error?: string;
};

export type AnalyzeClothingResponse =
  | { success: true; data: ClothingAnalysis }
  | { success: false; error: string };

function getStoragePathFromUrl(imageUrl: string): string | null {
  const marker = `/storage/v1/object/public/${CLOSET_STORAGE_BUCKET}/`;
  const idx = imageUrl.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(imageUrl.slice(idx + marker.length));
}

const ALLOWED_CLOSET_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const MAX_CLOSET_IMAGE_SIZE = 5 * 1024 * 1024;

async function analyzeUploadedImage(
  image: File
): Promise<AnalyzeClothingResponse> {
  const arrayBuffer = await image.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  try {
    const data = await analyzeClothing({
      image_base64: base64,
      mimeType: image.type || "image/jpeg",
    });
    return { success: true, data };
  } catch (error) {
    console.error("analyzeUploadedImage error:", error);
    if (isQwenTimeoutError(error)) {
      return { success: false, error: PAGE_COPY.addClothing.aiTimeout };
    }
    const message = formatQwenError(error);
    return { success: false, error: `Qwen 识别失败：${message}` };
  }
}

export async function analyzeClothingFromImage(
  formData: FormData
): Promise<AnalyzeClothingResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "请先登录" };
  }

  const imageBase64 = formData.get("image_base64")?.toString();
  const imageUrl = formData.get("image_url")?.toString();
  const mimeType = formData.get("mime_type")?.toString() || "image/jpeg";

  if (!imageBase64 && !imageUrl) {
    return { success: false, error: "请上传图片" };
  }

  try {
    const data = await analyzeClothing({
      image_base64: imageBase64 || undefined,
      image_url: imageUrl || undefined,
      mimeType,
    });
    return { success: true, data };
  } catch (error) {
    console.error("analyzeClothingFromImage error:", error);
    if (isQwenTimeoutError(error)) {
      return { success: false, error: PAGE_COPY.addClothing.aiTimeout };
    }
    const message = formatQwenError(error);
    return { success: false, error: `Qwen 识别失败：${message}` };
  }
}

export async function createClosetItem(
  _prevState: ClosetActionState,
  formData: FormData
): Promise<ClosetActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "请先登录" };
  }

  const image = formData.get("image");
  if (!(image instanceof File) || image.size === 0) {
    return { error: "请上传衣服图片" };
  }

  if (image.size > MAX_CLOSET_IMAGE_SIZE) {
    return { error: "图片超过 5MB，请换一张更小的图片。" };
  }

  if (!ALLOWED_CLOSET_IMAGE_TYPES.has(image.type)) {
    return { error: "不支持的图片格式，请使用 JPG、PNG 或 WebP。" };
  }

  const analysisResult = await analyzeUploadedImage(image);
  if (!analysisResult.success) {
    return { error: analysisResult.error };
  }
  if (!isAcceptableClothing(analysisResult.data)) {
    await trackFailureEvent({
      userId: user.id,
      eventName: "closet_item_failed",
      feature: "closet",
      reason: "not_clothing",
      metadata: { hasImage: true },
    });
    return { error: getClothingRejectionError(analysisResult.data) };
  }

  const name = formData.get("name")?.toString().trim();
  const category = formData.get("category")?.toString();
  const color = formData.get("color")?.toString().trim() || null;
  const material = formData.get("material")?.toString().trim() || null;
  const notes = formData.get("notes")?.toString().trim() || null;

  if (!name) {
    return { error: "请填写衣服名称" };
  }

  if (!category) {
    return { error: "请选择分类" };
  }

  const styleTags = formData.getAll("style_tags").map(String);
  const seasonTags = formData.getAll("season_tags").map(String);
  const occasionTags = formData.getAll("occasion_tags").map(String);
  // 自定义标签：服务端重新校验；非法条目被丢弃，不影响其余字段保存
  const customStyle = normalizeCustomTagList(formData.getAll("custom_style_tags").map(String), "style");
  const customOccasion = normalizeCustomTagList(formData.getAll("custom_occasion_tags").map(String), "occasion");

  const fileExt = image.name.split(".").pop()?.toLowerCase() || "jpg";
  const filePath = `${user.id}/${crypto.randomUUID()}.${fileExt}`;

  console.log("Uploading closet image:", {
    bucket: CLOSET_STORAGE_BUCKET,
    filePath,
    imageName: image.name,
    imageType: image.type,
    imageSize: image.size,
  });

  const { error: uploadError } = await supabase.storage
    .from(CLOSET_STORAGE_BUCKET)
    .upload(filePath, image, {
      contentType: image.type,
      upsert: false,
    });

  if (uploadError) {
    console.error("Supabase storage upload failed:", {
      bucket: CLOSET_STORAGE_BUCKET,
      filePath,
      imageName: image.name,
      imageType: image.type,
      imageSize: image.size,
      message: uploadError.message,
      error: uploadError,
    });
    await trackFailureEvent({
      userId: user.id,
      eventName: "closet_item_failed",
      feature: "closet",
      reason: "image_upload_failed",
      metadata: { hasImage: true },
    });
    return { error: `图片上传失败：${uploadError.message}` };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(CLOSET_STORAGE_BUCKET).getPublicUrl(filePath);

  const { data, error } = await supabase
    .from("closet_items")
    .insert({
      user_id: user.id,
      image_url: publicUrl,
      name,
      category,
      color,
      material,
      style_tags: styleTags,
      season_tags: seasonTags,
      occasion_tags: occasionTags,
      custom_style_tags: customStyle.tags,
      custom_occasion_tags: customOccasion.tags,
      notes,
      status: "ready",
    })
    .select("*")
    .single();

  if (error || !data) {
    await supabase.storage.from(CLOSET_STORAGE_BUCKET).remove([filePath]);
    if (isMissingCustomTagColumnsError(error)) {
      console.error("[closet] custom tag columns missing, run migration");
      return { error: getMissingCustomTagColumnsMessage() };
    }
    await trackFailureEvent({
      userId: user.id,
      eventName: "closet_item_failed",
      feature: "closet",
      reason: "save_failed",
      metadata: { hasImage: true, category },
    });
    return { error: "保存失败，请稍后重试" };
  }

  const embeddingUpdated = await refreshClosetItemEmbedding(supabase, data);
  await trackCustomTagChange({
    userId: user.id,
    itemId: data.id,
    source: "single",
    previousCount: 0,
    customStyleTags: customStyle.tags,
    customOccasionTags: customOccasion.tags,
    embeddingUpdated,
    validationErrorType: customStyle.firstError ?? customOccasion.firstError,
  });

  await trackEvent({
    userId: user.id,
    eventName: "closet_item_created",
    entityType: "closet_item",
    entityId: data.id,
    metadata: {
      category,
      hasImage: true,
    },
  });

  revalidatePath("/closet");
  revalidatePath("/profile");
  redirect(`/closet/${data.id}`);
}

const CLOSET_ITEM_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 编辑衣物（含自定义标签）。只能编辑当前登录用户自己的衣物；
 * 保存后重新生成 Embedding（失败不影响保存）。
 */
export async function updateClosetItem(
  _prevState: ClosetActionState,
  formData: FormData
): Promise<ClosetActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "请先登录" };
  }

  const itemId = formData.get("id")?.toString() ?? "";
  if (!CLOSET_ITEM_ID_PATTERN.test(itemId)) {
    return { error: "衣物不存在或无权编辑" };
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
    custom_style_tags: formData.getAll("custom_style_tags").map(String),
    custom_occasion_tags: formData.getAll("custom_occasion_tags").map(String),
  });

  if (!validation.ok) {
    return { error: validation.error };
  }

  const result = await updateOwnedClosetItem(supabase, {
    userId: user.id,
    itemId,
    values: validation.values,
  });

  if (!result.ok) {
    return { error: result.error };
  }

  // 自定义标签增删都会改变 Embedding 文本，统一重新生成
  const embeddingUpdated = await refreshClosetItemEmbedding(supabase, result.item);
  const previousCount =
    (result.previous.custom_style_tags?.length ?? 0) +
    (result.previous.custom_occasion_tags?.length ?? 0);
  await trackCustomTagChange({
    userId: user.id,
    itemId,
    source: "edit",
    previousCount,
    customStyleTags: validation.values.custom_style_tags,
    customOccasionTags: validation.values.custom_occasion_tags,
    embeddingUpdated,
    validationErrorType: validation.customTagErrorType,
  });

  revalidatePath("/closet");
  revalidatePath(`/closet/${itemId}`);
  redirect(`/closet/${itemId}`);
}

export async function deleteClosetItem(
  id: string
): Promise<{ error?: string } | void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/closet");
  }

  const { data: item } = await supabase
    .from("closet_items")
    .select("id, user_id, image_url")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!item) {
    redirect("/closet");
  }

  if (item.image_url) {
    const storagePath = getStoragePathFromUrl(item.image_url);
    if (storagePath) {
      const { error: storageError } = await supabase.storage
        .from(CLOSET_STORAGE_BUCKET)
        .remove([storagePath]);

      if (storageError) {
        console.error("Supabase storage delete failed:", {
          bucket: CLOSET_STORAGE_BUCKET,
          storagePath,
          itemId: id,
          message: storageError.message,
          error: storageError,
        });
      }
    }
  }

  const { error: deleteError } = await supabase
    .from("closet_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (deleteError) {
    console.error("deleteClosetItem database error:", deleteError);
    return { error: "删除失败，请稍后重试" };
  }

  revalidatePath("/closet");
  revalidatePath("/profile");
  redirect("/closet");
}
