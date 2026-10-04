import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { upsertClosetItemEmbedding } from "@/lib/closet/upsert-closet-embedding";
import { buildClosetItemEmbeddingText } from "@/lib/recommendation/embedding-text";
import type { ClosetItem, Database } from "@/types/database";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, "utf8");

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function main() {
  loadEnvLocal();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "[backfill-closet-embeddings] missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
    process.exit(1);
  }

  if (!process.env.QWEN_API_KEY?.trim()) {
    console.error("[backfill-closet-embeddings] missing QWEN_API_KEY");
    process.exit(1);
  }

  const limit = Number(process.env.BACKFILL_LIMIT ?? 50);
  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey);

  // BACKFILL_MODE=stale：重算 embedding_text 与当前构造规则不一致的衣物
  // （例如编辑自定义标签时 Embedding 生成失败留下的旧向量）。默认只补全缺失的 embedding。
  const staleMode = process.env.BACKFILL_MODE === "stale";
  const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 50;

  let query = supabase
    .from("closet_items")
    .select("*")
    .eq("status", "ready")
    .order("created_at", { ascending: true });
  if (!staleMode) query = query.is("embedding", null);
  const { data, error } = await query.limit(staleMode ? 1000 : safeLimit);

  if (error) {
    console.error("[backfill-closet-embeddings] query failed:", error.message);
    process.exit(1);
  }

  const items = ((data ?? []) as ClosetItem[])
    .filter((item) => !staleMode || item.embedding_text !== buildClosetItemEmbeddingText(item))
    .slice(0, safeLimit);
  if (items.length === 0) {
    console.log("[backfill-closet-embeddings] no items need backfill");
    return;
  }

  let successCount = 0;
  let failureCount = 0;

  for (const item of items) {
    const ok = await upsertClosetItemEmbedding(supabase, item);
    if (ok) {
      successCount += 1;
      console.log(`[ok] ${item.id} ${item.name ?? "未命名"}`);
    } else {
      failureCount += 1;
      console.warn(`[fail] ${item.id} ${item.name ?? "未命名"}`);
    }
  }

  console.log(
    `\n[backfill-closet-embeddings] done: success=${successCount}, failed=${failureCount}, total=${items.length}`
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[backfill-closet-embeddings] fatal: ${message}`);
  process.exit(1);
});
