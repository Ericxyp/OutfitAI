import { redirect } from "next/navigation";
import { getClothingOptions } from "@/lib/actions/clothing-options";
import { BatchClothingUpload } from "@/components/batch-clothing-upload";
import { PageHeader } from "@/components/ui/page-states";
import { createClient } from "@/lib/supabase/server";

export default async function ClosetBatchPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/closet/batch");
  }

  const options = await getClothingOptions(user.id);

  return (
    <div className="h-full overflow-y-auto overscroll-contain px-4 pt-6 pb-6">
      <PageHeader
        title="批量添加衣物"
        subtitle="一次最多选择 10 张照片，每张照片请只包含一件衣物。"
        backHref="/closet"
        backLabel="返回衣橱"
      />

      <BatchClothingUpload options={options} />
    </div>
  );
}
