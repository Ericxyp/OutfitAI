import type { ClosetItem } from "@/types/database";
import type { StyleKnowledgeEntry } from "@/lib/knowledge/style-knowledge";
import { readCustomTags } from "@/lib/closet/custom-tags";

function joinTags(tags: string[] | null | undefined): string {
  return (tags ?? []).filter(Boolean).join("、");
}

/** 衣物 Embedding 文本长度上限（字符），避免超长备注 / 标签挤占向量语义 */
export const CLOSET_EMBEDDING_TEXT_MAX_LENGTH = 600;
const NOTES_MAX_LENGTH = 300;

/**
 * 衣物 Embedding 文本。
 * - 系统标签沿用原有字段与格式；没有自定义标签（且备注不超长）时文本与旧版一致，旧向量无需重算；
 * - 自定义标签作为“自定义风格 / 自定义场景”补充语义，读取时再次清洗，旧数据缺字段按空数组处理；
 * - 只包含衣物本身的描述，不包含任何密钥或内部 Prompt。
 */
export function buildClosetItemEmbeddingText(item: ClosetItem): string {
  const { customStyleTags, customOccasionTags } = readCustomTags(item);
  const notes = item.notes ? item.notes.slice(0, NOTES_MAX_LENGTH) : null;
  const parts = [
    item.name ? `衣物：${item.name}` : null,
    item.category ? `类别：${item.category}` : null,
    item.color ? `颜色：${item.color}` : null,
    item.material ? `材质：${item.material}` : null,
    item.style_tags?.length ? `风格：${joinTags(item.style_tags)}` : null,
    item.season_tags?.length ? `季节：${joinTags(item.season_tags)}` : null,
    item.occasion_tags?.length ? `场景：${joinTags(item.occasion_tags)}` : null,
    customStyleTags.length ? `自定义风格：${joinTags(customStyleTags)}` : null,
    customOccasionTags.length ? `自定义场景：${joinTags(customOccasionTags)}` : null,
    notes ? `备注：${notes}` : null,
  ].filter((part): part is string => Boolean(part));

  const text = parts.join("。") + (parts.length > 0 ? "。" : "");
  return text.slice(0, CLOSET_EMBEDDING_TEXT_MAX_LENGTH);
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
