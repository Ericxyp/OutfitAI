import { redirect } from "next/navigation";
import { ShoppingCheckForm } from "@/components/shopping-check-form";
import { PageHeader } from "@/components/ui/page-states";
import { createClient } from "@/lib/supabase/server";

export default async function ShoppingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/shopping");
  }

  return (
    <div className="h-full overflow-y-auto overscroll-contain px-4 pt-6 pb-6">
      <PageHeader
        title="购物助手"
        subtitle="上传想买的商品图片，我会结合你的衣橱和风格画像，判断是否值得买、能搭几套。"
        backHref="/profile"
        backLabel="返回我的"
      />
      <ShoppingCheckForm />
    </div>
  );
}
