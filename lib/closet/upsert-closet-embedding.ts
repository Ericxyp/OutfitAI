import { generateEmbeddingSafe } from "@/lib/ai/embeddings";
import { buildClosetItemEmbeddingText } from "@/lib/recommendation/embedding-text";
import type { ClosetItem } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export async function upsertClosetItemEmbedding(
  supabase: SupabaseClient<Database>,
  item: ClosetItem
): Promise<boolean> {
  const embeddingText = buildClosetItemEmbeddingText(item);
  if (!embeddingText.trim()) {
    return false;
  }

  const embedding = await generateEmbeddingSafe(embeddingText);
  if (!embedding) {
    return false;
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
    console.warn("[closetEmbedding] update failed:", {
      itemId: item.id,
      message: error.message,
    });
    return false;
  }

  return true;
}
