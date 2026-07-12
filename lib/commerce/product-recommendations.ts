import type { ProductAnalysis } from "@/lib/ai/analyze-product";
import type { StyleProfileContext } from "@/lib/memory/style-profile";
import type { PersonalProfileContext } from "@/lib/memory/personal-profile-shared";
import { logger } from "@/lib/logger";
import type { ProductRecommendationCard } from "@/types/commerce";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ProductRecommendationRow } from "@/types/database";

export type { ProductRecommendationCard } from "@/types/commerce";

/** @deprecated 使用 ProductRecommendationCard */
export type ProductRecommendation = ProductRecommendationCard;

export type ProductRecommendationInput = {
  supabase: SupabaseClient<Database>;
  productAnalysis: ProductAnalysis;
  styleProfile: StyleProfileContext | null;
  personalProfile?: PersonalProfileContext | null;
  limit?: number;
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function textMatches(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function intersectTags(left: string[], right: string[]): string[] {
  const rightSet = new Set(right.map((tag) => tag.trim()).filter(Boolean));
  return left
    .map((tag) => tag.trim())
    .filter((tag) => tag && rightSet.has(tag));
}

function resolveProductUrl(product: ProductRecommendationRow): string {
  const affiliate = product.affiliate_url?.trim();
  if (affiliate) return affiliate;
  return product.product_url;
}

function scoreProduct(
  product: ProductRecommendationRow,
  input: ProductRecommendationInput
): { score: number; reasons: string[] } {
  const { productAnalysis, styleProfile } = input;
  let score = 0;
  const reasons: string[] = [];

  if (textMatches(product.category, productAnalysis.category)) {
    score += 30;
    reasons.push("分类匹配");
  }

  if (textMatches(product.color, productAnalysis.color)) {
    score += 15;
    reasons.push("颜色相近");
  }

  const styleOverlap = intersectTags(
    product.style_tags ?? [],
    productAnalysis.style_tags ?? []
  );
  if (styleOverlap.length > 0) {
    score += Math.min(styleOverlap.length * 10, 30);
    reasons.push(`风格契合：${styleOverlap.slice(0, 2).join("、")}`);
  }

  const occasionOverlap = intersectTags(
    product.occasion_tags ?? [],
    productAnalysis.occasion_tags ?? []
  );
  if (occasionOverlap.length > 0) {
    score += Math.min(occasionOverlap.length * 5, 15);
    reasons.push(`场景契合：${occasionOverlap.slice(0, 2).join("、")}`);
  }

  if (styleProfile) {
    const preferredStyleHit = styleProfile.preferredStyles.some((style) =>
      (product.style_tags ?? []).some((tag) => textMatches(tag, style))
    );
    if (preferredStyleHit) {
      score += 10;
      reasons.push("符合你的偏好风格");
    }

    const preferredColorHit = styleProfile.preferredColors.some((color) =>
      textMatches(product.color, color)
    );
    if (preferredColorHit) {
      score += 8;
      reasons.push("符合你的偏好颜色");
    }

    const avoidStyleHit = styleProfile.avoidStyles.some((style) =>
      (product.style_tags ?? []).some((tag) => textMatches(tag, style))
    );
    if (avoidStyleHit) {
      score -= 25;
    }

    const avoidColorHit = styleProfile.avoidColors.some((color) =>
      textMatches(product.color, color)
    );
    if (avoidColorHit) {
      score -= 30;
    }
  }

  return { score, reasons: reasons.slice(0, 2) };
}

function mapRowToRecommendation(
  product: ProductRecommendationRow,
  score: number,
  matchReasons: string[]
): ProductRecommendationCard {
  return {
    id: product.id,
    title: product.title,
    brand: product.brand,
    category: product.category,
    color: product.color,
    styleTags: product.style_tags ?? [],
    occasionTags: product.occasion_tags ?? [],
    priceMin:
      product.price_min === null || product.price_min === undefined
        ? null
        : Number(product.price_min),
    priceMax:
      product.price_max === null || product.price_max === undefined
        ? null
        : Number(product.price_max),
    imageUrl: product.image_url,
    productUrl: resolveProductUrl(product),
    merchant: product.merchant,
    score,
    matchReasons,
  };
}

export async function getProductRecommendationsForShoppingCheck(
  input: ProductRecommendationInput
): Promise<ProductRecommendationCard[]> {
  try {
    const limit = Math.min(Math.max(input.limit ?? 4, 1), 6);

    const { data, error } = await input.supabase
      .from("product_recommendations")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      logger.warn("[productRecommendations] query failed", {
        errorMessage: error.message.slice(0, 200),
      });
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    return data
      .map((product) => {
        const { score, reasons } = scoreProduct(product, input);
        return mapRowToRecommendation(product, score, reasons);
      })
      .filter((item) => (item.score ?? 0) > 0)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, limit);
  } catch (error) {
    logger.warn("[productRecommendations] failed", {
      errorMessage:
        error instanceof Error
          ? error.message.slice(0, 200)
          : String(error).slice(0, 200),
    });
    return [];
  }
}

export function formatProductPriceRange(
  priceMin: number | null,
  priceMax: number | null
): string {
  if (priceMin !== null && priceMax !== null) {
    return `¥${priceMin}-${priceMax}`;
  }
  if (priceMin !== null) {
    return `¥${priceMin} 起`;
  }
  if (priceMax !== null) {
    return `¥${priceMax} 以内`;
  }
  return "价格待定";
}
