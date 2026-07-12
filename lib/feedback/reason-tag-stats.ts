export type ReasonTagStat = {
  tag: string;
  count: number;
};

export function aggregateReasonTagStats(
  feedbackRows: Array<{ reason_tags: string[] | null }>,
  limit = 5
): ReasonTagStat[] {
  const counts = new Map<string, number>();

  for (const row of feedbackRows) {
    for (const tag of row.reason_tags ?? []) {
      const trimmed = tag.trim();
      if (!trimmed) continue;
      counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));
}
