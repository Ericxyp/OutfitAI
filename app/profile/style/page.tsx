import Link from "next/link";
import { redirect } from "next/navigation";
import { RegenerateStyleSummaryButton } from "@/components/regenerate-style-summary-button";
import { PageHeader } from "@/components/ui/page-states";
import { getUserStyleProfile } from "@/lib/memory/style-profile";
import { createClient } from "@/lib/supabase/server";
import type { ClosetItem } from "@/types/database";

type TopItemEntry = {
  item: ClosetItem;
  count: number;
};

function renderTags(tags: string[], variant: "default" | "avoid" = "default") {
  if (tags.length === 0) {
    return (
      <p className="text-sm text-muted">暂无数据</p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className={
            variant === "avoid"
              ? "rounded-full bg-red-50 px-2.5 py-1 text-xs text-red-600 ring-1 ring-red-100"
              : "rounded-full bg-accent px-2.5 py-1 text-xs text-foreground"
          }
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

function computeTopRecommendedItems(
  recommendations: { selected_item_ids: string[] }[],
  closetMap: Map<string, ClosetItem>,
  limit = 5
): TopItemEntry[] {
  const counts = new Map<string, number>();

  for (const rec of recommendations) {
    for (const id of rec.selected_item_ids) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, count]) => {
      const item = closetMap.get(id);
      return item ? { item, count } : null;
    })
    .filter((entry): entry is TopItemEntry => entry !== null);
}

function ItemMiniCard({
  item,
  badge,
}: {
  item: ClosetItem;
  badge?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-background p-3 ring-1 ring-border/60">
      <div className="h-14 w-11 shrink-0 overflow-hidden rounded-xl bg-accent ring-1 ring-border/40">
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image_url}
            alt={item.name ?? "衣服"}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] text-muted">
            暂无
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {item.name ?? "未命名"}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {item.category ?? "未分类"}
          {item.color ? ` · ${item.color}` : ""}
        </p>
      </div>
      {badge && (
        <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs text-muted">
          {badge}
        </span>
      )}
    </div>
  );
}

export default async function StyleProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/profile/style");
  }

  const styleProfile = await getUserStyleProfile(user.id);

  const { data: recommendations } = await supabase
    .from("outfit_recommendations")
    .select("selected_item_ids")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const relatedItemIds = new Set<string>([
    ...(styleProfile?.favoriteItemIds ?? []),
    ...(styleProfile?.dislikedItemIds ?? []),
    ...(recommendations ?? []).flatMap((rec) => rec.selected_item_ids),
  ]);

  let closetItems: ClosetItem[] = [];
  if (relatedItemIds.size > 0) {
    const { data } = await supabase
      .from("closet_items")
      .select("*")
      .eq("user_id", user.id)
      .in("id", [...relatedItemIds]);

    closetItems = data ?? [];
  }

  const closetMap = new Map(closetItems.map((item) => [item.id, item]));

  const topItems = computeTopRecommendedItems(
    recommendations ?? [],
    closetMap,
    5
  );

  const favoriteItems = (styleProfile?.favoriteItemIds ?? [])
    .map((id) => closetMap.get(id))
    .filter((item): item is ClosetItem => !!item);

  const hasProfileData =
    styleProfile !== null && styleProfile.feedbackCount > 0;

  return (
    <div className="h-full overflow-y-auto overscroll-contain px-4 pt-6 pb-6">
      <PageHeader
        title="风格画像"
        subtitle="我会根据你的收藏、喜欢和不喜欢逐渐学习你的偏好。"
        backHref="/profile"
        backLabel="返回我的"
      />

      <section className="mb-4 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="text-sm font-medium text-foreground">AI 风格总结</h2>
        {styleProfile?.styleSummary ? (
          <p className="mt-3 text-sm leading-relaxed text-foreground">
            {styleProfile.styleSummary}
          </p>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-muted">
            多反馈几套穿搭后，我会生成你的风格总结。
          </p>
        )}
        <div className="mt-4">
          <RegenerateStyleSummaryButton />
        </div>
      </section>

      <section className="mb-4 space-y-4 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="text-sm font-medium text-foreground">偏好标签</h2>

        <div>
          <p className="mb-2 text-xs text-muted">常用风格</p>
          {renderTags(styleProfile?.preferredStyles ?? [])}
        </div>

        <div>
          <p className="mb-2 text-xs text-muted">偏好颜色</p>
          {renderTags(styleProfile?.preferredColors ?? [])}
        </div>

        <div>
          <p className="mb-2 text-xs text-muted">常用场景</p>
          {renderTags(styleProfile?.preferredOccasions ?? [])}
        </div>
      </section>

      <section className="mb-4 space-y-4 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="text-sm font-medium text-foreground">不喜欢的元素</h2>

        <div>
          <p className="mb-2 text-xs text-muted">避免风格</p>
          {renderTags(styleProfile?.avoidStyles ?? [], "avoid")}
        </div>

        <div>
          <p className="mb-2 text-xs text-muted">避免颜色</p>
          {renderTags(styleProfile?.avoidColors ?? [], "avoid")}
        </div>
      </section>

      <section className="mb-4 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="mb-4 text-sm font-medium text-foreground">
          最常出现的单品
        </h2>
        {topItems.length > 0 ? (
          <div className="space-y-2">
            {topItems.map(({ item, count }) => (
              <ItemMiniCard
                key={item.id}
                item={item}
                badge={`出现 ${count} 次`}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">
            还没有足够的推荐历史，先去首页获取几套穿搭吧。
          </p>
        )}
      </section>

      {favoriteItems.length > 0 && (
        <section className="mb-4 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border/60">
          <h2 className="mb-4 text-sm font-medium text-foreground">
            喜欢 / 收藏中的单品
          </h2>
          <div className="space-y-2">
            {favoriteItems.slice(0, 5).map((item) => (
              <ItemMiniCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="text-sm font-medium text-foreground">学习进度</h2>
        {hasProfileData ? (
          <p className="mt-3 text-sm text-muted">
            已从 {styleProfile.feedbackCount} 次反馈中学习
          </p>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-muted">
            多收藏或反馈几套穿搭后，我会逐渐了解你的风格。
          </p>
        )}
        {!hasProfileData && (
          <Link
            href="/"
            className="mt-4 inline-block text-sm font-medium text-foreground underline-offset-2 hover:underline"
          >
            去首页获取推荐 →
          </Link>
        )}
      </section>
    </div>
  );
}
