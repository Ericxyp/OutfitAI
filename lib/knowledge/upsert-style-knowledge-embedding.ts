import { generateEmbeddingSafe } from "@/lib/ai/embeddings";
import { buildStyleKnowledgeEmbeddingText } from "@/lib/recommendation/embedding-text";
import type { StyleKnowledgeEntry } from "@/lib/knowledge/style-knowledge";
import type { Database } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function upsertStyleKnowledgeEmbedding(
  supabase: SupabaseClient<Database>,
  entry: Pick<
    StyleKnowledgeEntry,
    "id" | "title" | "category" | "tags" | "content"
  >
): Promise<boolean> {
  const embeddingText = buildStyleKnowledgeEmbeddingText(entry);
  const embedding = await generateEmbeddingSafe(embeddingText);
  if (!embedding) {
    return false;
  }

  const { error } = await supabase
    .from("style_knowledge_entries")
    .update({
      embedding_text: embeddingText,
      embedding,
      embedding_updated_at: new Date().toISOString(),
    })
    .eq("id", entry.id);

  if (error) {
    console.warn("[styleKnowledgeEmbedding] update failed:", {
      entryId: entry.id,
      message: error.message,
    });
    return false;
  }

  return true;
}
