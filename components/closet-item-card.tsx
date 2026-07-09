import Link from "next/link";
import type { ClosetItem } from "@/types/database";

export function ClosetItemCard({ item }: { item: ClosetItem }) {
  return (
    <Link
      href={`/closet/${item.id}`}
      className="group min-w-0 overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border/60 transition-all hover:ring-border"
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-accent">
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image_url}
            alt={item.name ?? "衣服"}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect
                x="4"
                y="4"
                width="16"
                height="16"
                rx="2"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          </div>
        )}
        {item.category && (
          <span className="absolute bottom-2 left-2 rounded-full bg-card/90 px-2 py-0.5 text-[11px] text-foreground backdrop-blur-sm">
            {item.category}
          </span>
        )}
      </div>

      <div className="space-y-1.5 p-3">
        <p className="truncate text-sm font-medium text-foreground">
          {item.name ?? "未命名"}
        </p>

        <div className="flex flex-wrap gap-1">
          {item.color && (
            <span className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted ring-1 ring-border/80">
              {item.color}
            </span>
          )}
          {item.style_tags.slice(0, 1).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-accent px-2 py-0.5 text-[11px] text-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
