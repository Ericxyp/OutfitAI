import { redirect } from "next/navigation";
import Link from "next/link";
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
        action={
          <Link
            href="/closet/batch"
            className="flex h-10 items-center rounded-full bg-card px-3 text-sm font-medium text-foreground ring-1 ring-border/60 transition-colors hover:bg-accent"
          >
            批量添加
          </Link>
        }
      />

      <AddClothingForm options={options} />
    </div>
  );
}
