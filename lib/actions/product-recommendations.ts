"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ProductRecommendationRow } from "@/types/database";

export type ProductActionResult =
  | { success: true }
  | { success: false; error: string };

function parseOptionalText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function parseRequiredText(
  value: FormDataEntryValue | null,
  label: string
): string | { error: string } {
  if (typeof value !== "string" || !value.trim()) {
    return { error: `${label}不能为空` };
  }
  return value.trim();
}

function parseOptionalNumber(
  value: FormDataEntryValue | null
): number | null | { error: string } {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return { error: "价格格式无效" };
  }
  return parsed;
}

function parseCommaTags(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, error: "请先登录" as const };
  }

  return { supabase, user, error: null };
}

export async function listProductRecommendations(): Promise<
  ProductRecommendationRow[]
> {
  const { supabase, error } = await requireUser();
  if (error) return [];

  const { data } = await supabase
    .from("product_recommendations")
    .select("*")
    .order("created_at", { ascending: false });

  return data ?? [];
}

export async function createProductRecommendation(
  formData: FormData
): Promise<ProductActionResult> {
  const auth = await requireUser();
  if (auth.error) return { success: false, error: auth.error };

  const title = parseRequiredText(formData.get("title"), "标题");
  if (typeof title === "object") return { success: false, error: title.error };

  const productUrl = parseRequiredText(formData.get("product_url"), "商品链接");
  if (typeof productUrl === "object") {
    return { success: false, error: productUrl.error };
  }
  if (!isValidHttpUrl(productUrl)) {
    return { success: false, error: "商品链接必须是 http/https" };
  }

  const affiliateUrl = parseOptionalText(formData.get("affiliate_url"));
  if (affiliateUrl && !isValidHttpUrl(affiliateUrl)) {
    return { success: false, error: "联盟链接必须是 http/https" };
  }

  const imageUrl = parseOptionalText(formData.get("image_url"));
  if (imageUrl && !isValidHttpUrl(imageUrl)) {
    return { success: false, error: "图片链接必须是 http/https" };
  }

  const priceMin = parseOptionalNumber(formData.get("price_min"));
  if (typeof priceMin === "object" && priceMin !== null) {
    return { success: false, error: priceMin.error };
  }
  const priceMax = parseOptionalNumber(formData.get("price_max"));
  if (typeof priceMax === "object" && priceMax !== null) {
    return { success: false, error: priceMax.error };
  }

  const { error } = await auth.supabase.from("product_recommendations").insert({
    title,
    product_url: productUrl,
    affiliate_url: affiliateUrl,
    image_url: imageUrl,
    brand: parseOptionalText(formData.get("brand")),
    merchant: parseOptionalText(formData.get("merchant")),
    category: parseOptionalText(formData.get("category")),
    color: parseOptionalText(formData.get("color")),
    style_tags: parseCommaTags(formData.get("style_tags")),
    occasion_tags: parseCommaTags(formData.get("occasion_tags")),
    price_min: typeof priceMin === "number" ? priceMin : null,
    price_max: typeof priceMax === "number" ? priceMax : null,
    commission_type: "demo",
    source: "manual",
    is_active: true,
  });

  if (error) {
    return { success: false, error: "新增商品失败，请稍后重试" };
  }

  revalidatePath("/profile/products");
  revalidatePath("/shopping");
  return { success: true };
}

export async function updateProductRecommendation(
  formData: FormData
): Promise<ProductActionResult> {
  const auth = await requireUser();
  if (auth.error) return { success: false, error: auth.error };

  const id = parseRequiredText(formData.get("id"), "商品 ID");
  if (typeof id === "object") return { success: false, error: id.error };

  const title = parseRequiredText(formData.get("title"), "标题");
  if (typeof title === "object") return { success: false, error: title.error };

  const productUrl = parseRequiredText(formData.get("product_url"), "商品链接");
  if (typeof productUrl === "object") {
    return { success: false, error: productUrl.error };
  }
  if (!isValidHttpUrl(productUrl)) {
    return { success: false, error: "商品链接必须是 http/https" };
  }

  const affiliateUrl = parseOptionalText(formData.get("affiliate_url"));
  if (affiliateUrl && !isValidHttpUrl(affiliateUrl)) {
    return { success: false, error: "联盟链接必须是 http/https" };
  }

  const imageUrl = parseOptionalText(formData.get("image_url"));
  if (imageUrl && !isValidHttpUrl(imageUrl)) {
    return { success: false, error: "图片链接必须是 http/https" };
  }

  const priceMin = parseOptionalNumber(formData.get("price_min"));
  if (typeof priceMin === "object" && priceMin !== null) {
    return { success: false, error: priceMin.error };
  }
  const priceMax = parseOptionalNumber(formData.get("price_max"));
  if (typeof priceMax === "object" && priceMax !== null) {
    return { success: false, error: priceMax.error };
  }

  const isActiveRaw = formData.get("is_active");
  const isActive =
    isActiveRaw === "true" || isActiveRaw === "on" || isActiveRaw === "1";

  const { error } = await auth.supabase
    .from("product_recommendations")
    .update({
      title,
      product_url: productUrl,
      affiliate_url: affiliateUrl,
      image_url: imageUrl,
      merchant: parseOptionalText(formData.get("merchant")),
      price_min: typeof priceMin === "number" ? priceMin : null,
      price_max: typeof priceMax === "number" ? priceMax : null,
      is_active: isActive,
    })
    .eq("id", id);

  if (error) {
    return { success: false, error: "更新商品失败，请稍后重试" };
  }

  revalidatePath("/profile/products");
  revalidatePath("/shopping");
  return { success: true };
}

export async function toggleProductRecommendationActive(
  productId: string,
  isActive: boolean
): Promise<ProductActionResult> {
  const auth = await requireUser();
  if (auth.error) return { success: false, error: auth.error };

  if (!productId.trim()) {
    return { success: false, error: "商品 ID 无效" };
  }

  const { error } = await auth.supabase
    .from("product_recommendations")
    .update({ is_active: isActive })
    .eq("id", productId);

  if (error) {
    return { success: false, error: "更新状态失败，请稍后重试" };
  }

  revalidatePath("/profile/products");
  revalidatePath("/shopping");
  return { success: true };
}
