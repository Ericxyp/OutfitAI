import { generateEmbeddingSafe } from "@/lib/ai/embeddings";
import { buildClosetItemEmbeddingText } from "@/lib/recommendation/embedding-text";
import type { ClosetItem } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/** Embedding 刷新失败原因（枚举，不含衣物内容或密钥） */
export type ClosetEmbeddingFailureReason = "empty_text" | "embedding_unavailable" | "update_failed";

export type ClosetEmbeddingUpsertResult =
  | { ok: true }
  | { ok: false; reason: ClosetEmbeddingFailureReason; errorMessage?: string };

/**
 * 生成并写入衣物 Embedding。失败时不改动衣物行（原 embedding / embedding_text 保留），
 * 只返回失败原因，由调用方记录日志。
 */
export async function upsertClosetItemEmbeddingDetailed(
  supabase: SupabaseClient<Database>,
  item: ClosetItem
): Promise<ClosetEmbeddingUpsertResult> {
  const embeddingText = buildClosetItemEmbeddingText(item);
  if (!embeddingText.trim()) {
    return { ok: false, reason: "empty_text" };
  }

  const embedding = await generateEmbeddingSafe(embeddingText);
  if (!embedding) {
    return { ok: false, reason: "embedding_unavailable" };
  }

  const { error } = await supabase
    .from("closet_items")
    .update({
      embedding_text: embeddingText,
      embedding,
      embedding_updated_at: new Date().toISOString(),
    })
    .eq("id", item.id);

  if (error) {
    return { ok: false, reason: "update_failed", errorMessage: error.message.slice(0, 200) };
  }

  return { ok: true };
}

export async function upsertClosetItemEmbedding(
  supabase: SupabaseClient<Database>,
  item: ClosetItem
): Promise<boolean> {
  const result = await upsertClosetItemEmbeddingDetailed(supabase, item);
  if (!result.ok && result.reason === "update_failed") {
    console.warn("[closetEmbedding] update failed:", {
      itemId: item.id,
      message: result.errorMessage,
    });
  }
  return result.ok;
}
