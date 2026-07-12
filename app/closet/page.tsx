import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  MIN_CLOSET_FOR_AI,
  PAGE_COPY,
} from "@/lib/constants";
import { ClosetCategoryFilter } from "@/components/closet-category-filter";
import { ClosetGrid } from "@/components/closet-grid";
import { DemoBanner, PageHeader } from "@/components/ui/page-states";
import { createClient } from "@/lib/supabase/server";

export default async function ClosetPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const params = await searchParams;
  const activeCategory = params.category ?? "全部";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/closet");
  }

  const { data: allItems, error } = await supabase
    .from("closet_items")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(PAGE_COPY.errors.loadFailed);
  }

  const items = (allItems ?? []).filter((item) => {
    if (activeCategory === "全部") return true;
    return item.category === activeCategory;
  });

  const totalCount = allItems?.length ?? 0;
  const remaining = MIN_CLOSET_FOR_AI - totalCount;

  return (
    <div className="h-full overflow-y-auto overscroll-contain px-4 pt-6 pb-4">
      <PageHeader
        title={PAGE_COPY.closet.title}
        subtitle={PAGE_COPY.closet.subtitle}
        action={
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/closet/batch"
              aria-label="批量添加"
              className="flex h-10 items-center rounded-full bg-card px-3 text-sm font-medium text-foreground ring-1 ring-border/60 transition-colors hover:bg-accent"
            >
              批量添加
            </Link>
            <Link
              href="/closet/new"
              aria-label={PAGE_COPY.closet.addFab}
              className="flex h-10 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M12 5v14M5 12h14"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              {PAGE_COPY.closet.addFab}
            </Link>
          </div>
        }
      />

      <p className="mb-4 text-sm text-muted">
        {PAGE_COPY.closet.count(totalCount)}
      </p>

      {remaining > 0 && totalCount > 0 && (
        <DemoBanner
          message={PAGE_COPY.closet.progress(remaining)}
          href="/closet/new"
          linkText="继续添加"
        />
      )}

      {remaining <= 0 && totalCount > 0 && (
        <DemoBanner
          message={PAGE_COPY.closet.ready}
          href="/"
          linkText="去首页"
        />
      )}

      <Suspense
        fallback={<div className="mb-4 h-9 animate-pulse rounded-full bg-accent" />}
      >
        <ClosetCategoryFilter />
      </Suspense>

      <ClosetGrid items={items} activeCategory={activeCategory} />
    </div>
  );
}
