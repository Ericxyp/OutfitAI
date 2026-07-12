import type { ClosetItem } from "@/types/database";
import type { StyleKnowledgeEntry } from "@/lib/knowledge/style-knowledge";

function joinTags(tags: string[] | null | undefined): string {
  return (tags ?? []).filter(Boolean).join("、");
}

export function buildClosetItemEmbeddingText(item: ClosetItem): string {
  const parts = [
    item.name ? `衣物：${item.name}` : null,
    item.category ? `类别：${item.category}` : null,
    item.color ? `颜色：${item.color}` : null,
    item.material ? `材质：${item.material}` : null,
    item.style_tags?.length ? `风格：${joinTags(item.style_tags)}` : null,
    item.season_tags?.length ? `季节：${joinTags(item.season_tags)}` : null,
    item.occasion_tags?.length ? `场景：${joinTags(item.occasion_tags)}` : null,
    item.notes ? `备注：${item.notes}` : null,
  ].filter((part): part is string => Boolean(part));

  return parts.join("。") + (parts.length > 0 ? "。" : "");
}

export function buildStyleKnowledgeEmbeddingText(
  entry: Pick<
    StyleKnowledgeEntry,
    "title" | "category" | "tags" | "content"
  >
): string {
  const parts = [
    `标题：${entry.title}`,
    `类别：${entry.category}`,
    entry.tags?.length ? `标签：${joinTags(entry.tags)}` : null,
    `内容：${entry.content}`,
  ].filter((part): part is string => Boolean(part));

  return parts.join("。");
}
