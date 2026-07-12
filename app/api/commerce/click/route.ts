import { NextResponse } from "next/server";
import { trackEvent } from "@/lib/analytics/track-event";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

type CommerceClickBody = {
  productRecommendationId?: string;
  shoppingCheckId?: string;
  targetUrl?: string;
  source?: string;
};

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let body: CommerceClickBody;
  try {
    body = (await request.json()) as CommerceClickBody;
  } catch {
    return NextResponse.json({ success: false, error: "请求格式无效" }, { status: 400 });
  }

  const productRecommendationId = body.productRecommendationId?.trim();
  const targetUrl = body.targetUrl?.trim();
  const source = body.source?.trim() || "shopping_check";

  if (!productRecommendationId || !targetUrl) {
    return NextResponse.json(
      { success: false, error: "缺少必要参数" },
      { status: 400 }
    );
  }

  if (!isValidHttpUrl(targetUrl)) {
    return NextResponse.json({ success: false, error: "链接无效" }, { status: 400 });
  }

  const { data: product, error: productError } = await supabase
    .from("product_recommendations")
    .select("id, title, merchant")
    .eq("id", productRecommendationId)
    .eq("is_active", true)
    .maybeSingle();

  if (productError || !product) {
    return NextResponse.json(
      { success: false, error: "商品不存在或已下架" },
      { status: 404 }
    );
  }

  const userAgent = request.headers.get("user-agent");
  const metadata: Record<string, string> = {
    productTitle: product.title,
  };
  if (product.merchant) {
    metadata.merchant = product.merchant;
  }
  if (userAgent) {
    metadata.userAgent = userAgent.slice(0, 200);
  }

  const { error: clickError } = await supabase.from("commerce_clicks").insert({
    user_id: user?.id ?? null,
    product_recommendation_id: productRecommendationId,
    shopping_check_id: body.shoppingCheckId ?? null,
    source,
    target_url: targetUrl,
    metadata,
  });

  if (clickError) {
    logger.error("[commerce click] insert failed", {
      feature: "commerce",
      reason: "click_insert_failed",
      errorName: clickError.name ?? "PostgrestError",
      errorMessage: clickError.message.slice(0, 200),
    });
    return NextResponse.json(
      { success: false, error: "记录点击失败" },
      { status: 500 }
    );
  }

  if (user) {
    await trackEvent({
      userId: user.id,
      eventName: "commerce_product_clicked",
      entityType: "product_recommendation",
      entityId: productRecommendationId,
      metadata: { source },
    });
  }

  return NextResponse.json({
    success: true,
    redirectUrl: targetUrl,
  });
}
