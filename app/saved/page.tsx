import { redirect } from "next/navigation";
import { PAGE_COPY } from "@/lib/constants";
import { getSavedOutfits } from "@/lib/actions/feedback";
import { createClient } from "@/lib/supabase/server";
import { EmptyState, PageHeader } from "@/components/ui/page-states";

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
  });
}

export default async function SavedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/saved");
  }

  const savedOutfits = await getSavedOutfits();

  return (
    <div className="h-full overflow-y-auto overscroll-contain px-4 pt-6 pb-6">
      <PageHeader
        title={PAGE_COPY.saved.title}
        subtitle={PAGE_COPY.saved.count(savedOutfits.length)}
        backHref="/profile"
        backLabel="返回我的"
      />

      {savedOutfits.length === 0 ? (
        <EmptyState
          icon={
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 3l2.5 5.5L20 9.5l-4.5 3.5L17 19l-5-3-5 3 1.5-6L4 9.5l5.5-1L12 3z"
                stroke="#111111"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
          }
          title={PAGE_COPY.saved.emptyTitle}
          description={PAGE_COPY.saved.emptyDesc}
          actionLabel={PAGE_COPY.saved.emptyAction}
          actionHref="/"
        />
      ) : (
        <div className="space-y-4">
          {savedOutfits.map((outfit) => (
            <article
              key={outfit.id}
              className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border/60"
            >
              <div className="px-4 pt-4 pb-2">
                <p className="text-base font-semibold text-foreground">
                  {outfit.title}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {formatDate(outfit.savedAt)} 收藏
                </p>
              </div>

              {outfit.items.length > 0 && (
                <div className="flex gap-2 overflow-x-auto px-4 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {outfit.items.map((item) => (
                    <div key={item.id} className="w-[4.5rem] shrink-0">
                      <div className="aspect-[3/4] overflow-hidden rounded-xl bg-accent ring-1 ring-border/40">
                        {item.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.image_url}
                            alt={item.name ?? "衣服"}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[10px] text-muted">
                            无图
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {outfit.summary && (
                <div className="border-t border-border/50 px-4 py-3">
                  <p className="text-sm leading-relaxed text-foreground/90">
                    {outfit.summary}
                  </p>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
