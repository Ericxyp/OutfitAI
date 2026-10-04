import { notFound, redirect } from "next/navigation";
import { EditClothingForm } from "@/components/edit-clothing-form";
import { PageHeader } from "@/components/ui/page-states";
import { getClothingOptions } from "@/lib/actions/clothing-options";
import { readCustomTags } from "@/lib/closet/custom-tags";
import { createClient } from "@/lib/supabase/server";

export default async function EditClothingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/closet/${id}/edit`);
  }

  // 只读取当前用户自己的衣物（RLS 同样限制）
  const { data: item } = await supabase
    .from("closet_items")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!item) {
    notFound();
  }

  const options = await getClothingOptions(user.id);
  // 旧数据（迁移前）缺少自定义字段时按空数组处理
  const { customStyleTags, customOccasionTags } = readCustomTags(item);

  return (
    <div className="h-full overflow-y-auto overscroll-contain px-4 pt-6 pb-6">
      <PageHeader
        title="编辑衣服"
        subtitle="修改信息或添加你自己的风格、场景描述。"
        backHref={`/closet/${id}`}
        backLabel="返回详情"
      />
      <EditClothingForm
        itemId={item.id}
        options={options}
        initialValues={{
          name: item.name ?? "",
          category: item.category ?? "",
          color: item.color ?? "",
          material: item.material ?? "",
          style_tags: item.style_tags ?? [],
          season_tags: item.season_tags ?? [],
          occasion_tags: item.occasion_tags ?? [],
          custom_style_tags: customStyleTags,
          custom_occasion_tags: customOccasionTags,
          notes: item.notes ?? "",
        }}
      />
    </div>
  );
}
