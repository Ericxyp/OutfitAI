import type { HistoryThumbnail } from "@/lib/history/get-history";

function formatHistoryDate(dateStr: string) {
  return new Date(dateStr).toLocaleString("zh-CN", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ThumbnailStrip({
  items,
  leadingImage,
  leadingAlt,
}: {
  items: HistoryThumbnail[];
  leadingImage?: string | null;
  leadingAlt?: string;
}) {
  if (!leadingImage && items.length === 0) {
    return null;
  }

  return (
    <div className="flex gap-2 overflow-x-auto px-4 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {leadingImage && (
        <div className="w-[4.5rem] shrink-0">
          <div className="aspect-[3/4] overflow-hidden rounded-xl bg-accent ring-1 ring-border/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={leadingImage}
              alt={leadingAlt ?? "商品"}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
        </div>
      )}
      {items.map((item) => (
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
  );
}

type HistoryRecordCardProps = {
  title: string;
  createdAt: string;
  summary: string;
  items: HistoryThumbnail[];
  leadingImage?: string | null;
  leadingAlt?: string;
};

export function HistoryRecordCard({
  title,
  createdAt,
  summary,
  items,
  leadingImage,
  leadingAlt,
}: HistoryRecordCardProps) {
  return (
    <article className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border/60">
      <div className="px-4 pt-4 pb-2">
        <p className="text-base font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-xs text-muted">{formatHistoryDate(createdAt)}</p>
      </div>

      <ThumbnailStrip
        items={items}
        leadingImage={leadingImage}
        leadingAlt={leadingAlt}
      />

      {summary && (
        <div className="border-t border-border/50 px-4 py-3">
          <p className="line-clamp-3 text-sm leading-relaxed text-foreground/90">
            {summary}
          </p>
        </div>
      )}
    </article>
  );
}
