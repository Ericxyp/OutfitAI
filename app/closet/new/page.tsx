import { redirect } from "next/navigation";
import { getClothingOptions } from "@/lib/actions/clothing-options";
import { PAGE_COPY } from "@/lib/constants";
import { AddClothingForm } from "@/components/add-clothing-form";
import { PageHeader } from "@/components/ui/page-states";
import { createClient } from "@/lib/supabase/server";

export default async function NewClothingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/closet/new");
  }

  const options = await getClothingOptions(user.id);

  return (
    <div className="h-full overflow-y-auto overscroll-contain px-4 pt-6 pb-6">
      <PageHeader
        title={PAGE_COPY.addClothing.title}
        subtitle={PAGE_COPY.addClothing.subtitle}
        backHref="/closet"
        backLabel="返回衣橱"
      />

      <AddClothingForm options={options} />
    </div>
  );
}
