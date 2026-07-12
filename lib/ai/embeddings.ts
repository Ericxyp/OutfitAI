import { createQwenClient } from "@/lib/ai/qwen";

const MAX_EMBEDDING_TEXT_LENGTH = 2000;

export function getEmbeddingModel(): string {
  return process.env.EMBEDDING_MODEL?.trim() || "text-embedding-v4";
}

export function getEmbeddingDimensions(): number {
  const raw = Number(process.env.EMBEDDING_DIMENSIONS ?? 1024);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1024;
}

function truncateEmbeddingText(text: string): string {
  return text.trim().slice(0, MAX_EMBEDDING_TEXT_LENGTH);
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const input = truncateEmbeddingText(text);
  if (!input) {
    throw new Error("embedding input is empty");
  }

  const client = createQwenClient();
  const dimensions = getEmbeddingDimensions();

  const response = await client.embeddings.create({
    model: getEmbeddingModel(),
    input,
    dimensions,
  });

  const embedding = response.data[0]?.embedding;
  if (!embedding?.length) {
    throw new Error("embedding API returned empty vector");
  }

  return embedding;
}

export async function generateEmbeddingSafe(
  text: string
): Promise<number[] | null> {
  const input = truncateEmbeddingText(text);
  if (!input) {
    return null;
  }

  if (!process.env.QWEN_API_KEY?.trim()) {
    return null;
  }

  try {
    return await generateEmbedding(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[embeddings] generateEmbeddingSafe failed:", message);
    return null;
  }
}
