import type { ProductAnalysis } from "@/lib/ai/analyze-product";
import type { ProductRecommendationRow } from "@/types/database";
import { getProductRecommendationsForShoppingCheck } from "@/lib/commerce/product-recommendations";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const catalog: ProductRecommendationRow[] = [
  {
    id: "c3000003-0003-4000-8000-000000000001",
    title: "米色针织开衫",
    brand: "Uniqlo",
    category: "外套",
    color: "米色",
    style_tags: ["温柔", "简约", "通勤"],
    occasion_tags: ["上班", "约会"],
    price_min: 199,
    price_max: 299,
    image_url: null,
    product_url: "https://example.com/products/beige-cardigan",
    affiliate_url: "https://example.com/aff/beige-cardigan",
    merchant: "Uniqlo 官方",
    commission_type: "demo",
    source: "manual",
    recommendation_reason: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "c3000003-0003-4000-8000-000000000002",
    title: "白色棉质 T 恤",
    brand: "MUJI",
    category: "上衣",
    color: "白色",
    style_tags: ["简约", "休闲"],
    occasion_tags: ["日常"],
    price_min: 79,
    price_max: 129,
    image_url: null,
    product_url: "https://example.com/products/white-tee",
    affiliate_url: null,
    merchant: "MUJI 官方",
    commission_type: "demo",
    source: "manual",
    recommendation_reason: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

function createMockSupabase() {
  return {
    from(table: string) {
      if (table !== "product_recommendations") {
        throw new Error(`unexpected table: ${table}`);
      }

      return {
        select: () => ({
          eq: () => ({
            order: async () => ({ data: catalog, error: null }),
          }),
        }),
      };
    },
  };
}

async function testRecommendationsForCardiganLikeProduct() {
  const productAnalysis: ProductAnalysis = {
    name: "米色针织开衫",
    category: "外套",
    color: "米色",
    material: "针织",
    style_tags: ["温柔", "简约"],
    season: "秋",
    season_tags: ["秋"],
    silhouette: "宽松",
    occasion_tags: ["上班"],
    notes: "",
    confidence: 0.9,
  };

  const recommendations = await getProductRecommendationsForShoppingCheck({
    supabase: createMockSupabase() as never,
    productAnalysis,
    styleProfile: null,
    limit: 6,
  });

  assert(recommendations.length > 0, "should return at least one product");
  assert(
    recommendations[0].title.includes("开衫"),
    "top result should match cardigan"
  );
  assert(recommendations[0].score !== undefined, "should include score");
  assert(
    recommendations[0].productUrl.includes("/aff/"),
    "should prefer affiliate_url when present"
  );

  console.log("[PASS] product recommendations for cardigan-like product");
}

function testEmptyCatalogReturnsEmptyArray() {
  const emptySupabase = {
    from() {
      return {
        select: () => ({
          eq: () => ({
            order: async () => ({ data: [], error: null }),
          }),
        }),
      };
    },
  };

  return getProductRecommendationsForShoppingCheck({
    supabase: emptySupabase as never,
    productAnalysis: {
      name: "测试",
      category: "上衣",
      color: "白色",
      material: "",
      style_tags: ["简约"],
      season: "",
      season_tags: [],
      silhouette: "",
      occasion_tags: ["日常"],
      notes: "",
      confidence: 0.8,
    },
    styleProfile: null,
  }).then((result) => {
    assert(result.length === 0, "empty catalog should return empty array");
    console.log("[PASS] empty catalog returns empty array");
  });
}

function printManualTestGuide() {
  console.log("\n手动测试建议：");
  console.log("1. 在 Supabase 执行 schema.sql 新增表 + seed-products.sql 商品数据");
  console.log("2. 打开 /shopping 上传商品图并完成分析");
  console.log("3. 结果下方应出现「可以看看这些单品」");
  console.log("4. 点击「去购买」应打开商品链接，并写入 commerce_clicks");
  console.log("5. /profile/metrics 查看购物转化指标");
  console.log("6. /profile/products 可新增/停用商品（Demo 管理页）");
}

async function main() {
  await testRecommendationsForCardiganLikeProduct();
  await testEmptyCatalogReturnsEmptyArray();
  printManualTestGuide();
  console.log("\nAll commerce recommendation tests passed.");
}

void main();
