import type { ScoredClosetItem } from "@/types/recommendation";

export type CategoryGroup =
  | "top"
  | "bottom"
  | "outerwear"
  | "shoes"
  | "accessories"
  | "other";

export type BalancedPickOptions = {
  min?: number;
  max?: number;
};

const DEFAULT_MIN = 8;
const DEFAULT_MAX = 20;

const GROUP_PICK_LIMIT: Record<CategoryGroup, number> = {
  top: 4,
  bottom: 4,
  outerwear: 3,
  shoes: 3,
  accessories: 3,
  other: 2,
};

export function getCategoryGroup(category: string | null): CategoryGroup {
  if (!category) {
    return "other";
  }

  if (category === "上衣" || category === "连衣裙") {
    return "top";
  }

  if (category === "裤子") {
    return "bottom";
  }

  if (category === "外套") {
    return "outerwear";
  }

  if (category === "鞋子") {
    return "shoes";
  }

  if (category === "配饰" || category === "包") {
    return "accessories";
  }

  return "other";
}

export function rankClosetItems(
  scoredItems: ScoredClosetItem[]
): ScoredClosetItem[] {
  return [...scoredItems].sort((a, b) => b.ruleScore - a.ruleScore);
}

export function getCategoryCoverage(
  items: ScoredClosetItem[]
): Record<string, number> {
  const coverage: Record<string, number> = {
    top: 0,
    bottom: 0,
    outerwear: 0,
    shoes: 0,
    accessories: 0,
    other: 0,
  };

  for (const scored of items) {
    const group = getCategoryGroup(scored.item.category);
    coverage[group] += 1;
  }

  return coverage;
}

export function pickBalancedCandidates(
  scoredItems: ScoredClosetItem[],
  options?: BalancedPickOptions
): ScoredClosetItem[] {
  const min = options?.min ?? DEFAULT_MIN;
  const max = options?.max ?? DEFAULT_MAX;

  if (scoredItems.length <= max) {
    return rankClosetItems(scoredItems);
  }

  const ranked = rankClosetItems(scoredItems);
  const selected: ScoredClosetItem[] = [];
  const selectedIds = new Set<string>();
  const groupCounts: Record<CategoryGroup, number> = {
    top: 0,
    bottom: 0,
    outerwear: 0,
    shoes: 0,
    accessories: 0,
    other: 0,
  };

  const addItem = (scored: ScoredClosetItem) => {
    if (selectedIds.has(scored.item.id) || selected.length >= max) {
      return;
    }
    selectedIds.add(scored.item.id);
    selected.push(scored);
    const group = getCategoryGroup(scored.item.category);
    groupCounts[group] += 1;
  };

  const groups: CategoryGroup[] = [
    "top",
    "bottom",
    "outerwear",
    "shoes",
    "accessories",
    "other",
  ];

  for (const group of groups) {
    const limit = GROUP_PICK_LIMIT[group];
    const groupItems = ranked.filter(
      (scored) => getCategoryGroup(scored.item.category) === group
    );

    for (const scored of groupItems.slice(0, limit)) {
      addItem(scored);
    }
  }

  for (const scored of ranked) {
    if (selected.length >= max) {
      break;
    }
    addItem(scored);
  }

  if (selected.length < min) {
    for (const scored of ranked) {
      if (selected.length >= min) {
        break;
      }
      addItem(scored);
    }
  }

  return rankClosetItems(selected);
}
