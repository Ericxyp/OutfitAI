"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CLOSET_FILTER_CATEGORIES } from "@/lib/constants";

export function ClosetCategoryFilter() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get("category") ?? "全部";

  return (
    <div className="mb-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {CLOSET_FILTER_CATEGORIES.map((category) => {
        const isActive = active === category;
        const href =
          category === "全部"
            ? pathname
            : `${pathname}?category=${encodeURIComponent(category)}`;

        return (
          <Link
            key={category}
            href={href}
            className={`shrink-0 rounded-full px-4 py-2 text-sm transition-colors ${
              isActive
                ? "bg-foreground text-background"
                : "bg-card text-foreground ring-1 ring-border hover:bg-accent"
            }`}
          >
            {category}
          </Link>
        );
      })}
    </div>
  );
}
