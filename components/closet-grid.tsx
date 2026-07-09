import { PAGE_COPY } from "@/lib/constants";
import type { ClosetItem } from "@/types/database";
import { ClosetItemCard } from "@/components/closet-item-card";
import { EmptyState } from "@/components/ui/page-states";

export function ClosetGrid({
  items,
  activeCategory,
}: {
  items: ClosetItem[];
  activeCategory: string;
}) {
  if (items.length === 0) {
    const isFiltered = activeCategory !== "全部";

    return (
      <EmptyState
        icon={
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M4 7h16v13H4V7z"
              stroke="#111111"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path
              d="M9 7V5a3 3 0 0 1 6 0v2"
              stroke="#111111"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        }
        title={
          isFiltered
            ? PAGE_COPY.closet.filteredTitle
            : PAGE_COPY.closet.emptyTitle
        }
        description={
          isFiltered
            ? PAGE_COPY.closet.filteredDesc
            : PAGE_COPY.closet.emptyDesc
        }
        actionLabel={PAGE_COPY.closet.addButton}
        actionHref="/closet/new"
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 pb-2">
      {items.map((item) => (
        <ClosetItemCard key={item.id} item={item} />
      ))}
    </div>
  );
}
