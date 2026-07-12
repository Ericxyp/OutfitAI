import { redirect } from "next/navigation";
import { ProductRecommendationForm } from "@/components/product-recommendation-form";
import { ProductRecommendationList } from "@/components/product-recommendation-list";
import { PageHeader } from "@/components/ui/page-states";
import { createClient } from "@/lib/supabase/server";

export default async function ProductRecommendationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/profile/products");
  }

  const { data: products } = await supabase
    .from("product_recommendations")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="h-full overflow-y-auto overscroll-contain px-4 pt-6 pb-6">
      <PageHeader
        title="商品管理"
        subtitle="Demo 管理页：维护购物推荐商品库，支持启用/停用与基础编辑。"
        backHref="/profile"
        backLabel="返回我的"
      />

      <div className="space-y-4">
        <ProductRecommendationForm />
        <section>
          <h2 className="mb-3 text-sm font-medium text-foreground">
            商品列表（{products?.length ?? 0}）
          </h2>
          <ProductRecommendationList products={products ?? []} />
        </section>
      </div>
    </div>
  );
}
