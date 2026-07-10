import { redirect } from "next/navigation";
import { HistorySection } from "@/components/history-section";
import { PageHeader } from "@/components/ui/page-states";
import { getUserHistory } from "@/lib/history/get-history";
import { createClient } from "@/lib/supabase/server";

export default async function HistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/history");
  }

  const history = await getUserHistory(user.id);
  const totalCount =
    history.outfits.length +
    history.travelPlans.length +
    history.shoppingChecks.length;

  return (
    <div className="h-full overflow-y-auto overscroll-contain px-4 pt-6 pb-6">
      <PageHeader
        title="历史记录"
        subtitle={
          totalCount > 0
            ? `共 ${totalCount} 条生成记录`
            : "查看你生成过的穿搭推荐、旅行规划和购物分析"
        }
        backHref="/profile"
        backLabel="返回我的"
      />

      <div className="space-y-8">
        <HistorySection
          title="穿搭推荐"
          emptyTitle="暂无穿搭推荐"
          emptyDescription="在首页发起搭配后，记录会出现在这里。"
          records={history.outfits}
        />

        <HistorySection
          title="旅行规划"
          emptyTitle="暂无旅行规划"
          emptyDescription="使用旅行穿搭规划后，记录会出现在这里。"
          records={history.travelPlans}
        />

        <HistorySection
          title="购物分析"
          emptyTitle="暂无购物分析"
          emptyDescription="使用购物助手分析商品后，记录会出现在这里。"
          records={history.shoppingChecks.map((record) => ({
            id: record.id,
            title: record.title,
            summary: record.summary,
            createdAt: record.createdAt,
            items: record.items,
            leadingImage: record.productImageUrl,
            leadingAlt: record.title,
          }))}
        />
      </div>
    </div>
  );
}
