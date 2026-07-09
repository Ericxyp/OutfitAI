import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DeleteClothingButton } from "@/components/delete-clothing-button";
import { createClient } from "@/lib/supabase/server";

function TagList({ label, tags }: { label: string; tags: string[] }) {
  if (tags.length === 0) return null;

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-accent px-3 py-1 text-sm text-foreground"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;

  return (
    <div className="flex items-center justify-between border-b border-border py-3 last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}

export default async function ClosetItemDetailPage({
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
    redirect(`/login?next=/closet/${id}`);
  }

  const { data: item } = await supabase
    .from("closet_items")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!item) {
    notFound();
  }

  return (
    <div className="h-full overflow-y-auto overscroll-contain px-4 pt-6 pb-6">
      <header className="mb-4 flex items-center gap-3">
        <Link
          href="/closet"
          aria-label="返回衣橱"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card ring-1 ring-border/60"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 6l-6 6 6 6"
              stroke="#111111"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <h1 className="truncate text-lg font-semibold text-foreground">
          {item.name ?? "衣服详情"}
        </h1>
      </header>

      <div className="mb-4 overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border/60">
        <div className="aspect-[3/4] bg-accent">
          {item.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.image_url}
              alt={item.name ?? "衣服"}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted">
              暂无图片
            </div>
          )}
        </div>
      </div>

      <section className="mb-4 space-y-4 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <InfoRow label="分类" value={item.category} />
        <InfoRow label="颜色" value={item.color} />
        <InfoRow label="材质" value={item.material} />
        <TagList label="风格标签" tags={item.style_tags} />
        <TagList label="季节" tags={item.season_tags} />
        <TagList label="适合场景" tags={item.occasion_tags} />
        {item.notes && (
          <div>
            <p className="mb-1 text-sm text-muted">备注</p>
            <p className="text-sm leading-relaxed text-foreground">{item.notes}</p>
          </div>
        )}
      </section>

      <DeleteClothingButton itemId={item.id} />
    </div>
  );
}
