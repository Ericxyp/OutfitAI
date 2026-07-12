import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { upsertStyleKnowledgeEmbedding } from "@/lib/knowledge/upsert-style-knowledge-embedding";
import type { Database } from "@/types/database";

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
      "[backfill-style-knowledge-embeddings] missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
    process.exit(1);
  }

  if (!process.env.QWEN_API_KEY?.trim()) {
    console.error("[backfill-style-knowledge-embeddings] missing QWEN_API_KEY");
    process.exit(1);
  }

  const limit = Number(process.env.BACKFILL_LIMIT ?? 50);
  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase
    .from("style_knowledge_entries")
    .select("id, title, category, tags, content")
    .eq("is_active", true)
    .is("embedding", null)
    .order("priority", { ascending: false })
    .limit(Number.isFinite(limit) && limit > 0 ? limit : 50);

  if (error) {
    console.error(
      "[backfill-style-knowledge-embeddings] query failed:",
      error.message
    );
    process.exit(1);
  }

  const entries = data ?? [];
  if (entries.length === 0) {
    console.log("[backfill-style-knowledge-embeddings] no entries need backfill");
    return;
  }

  let successCount = 0;
  let failureCount = 0;

  for (const entry of entries) {
    const ok = await upsertStyleKnowledgeEmbedding(supabase, entry);
    if (ok) {
      successCount += 1;
      console.log(`[ok] ${entry.id} ${entry.title}`);
    } else {
      failureCount += 1;
      console.warn(`[fail] ${entry.id} ${entry.title}`);
    }
  }

  console.log(
    `\n[backfill-style-knowledge-embeddings] done: success=${successCount}, failed=${failureCount}, total=${entries.length}`
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[backfill-style-knowledge-embeddings] fatal: ${message}`);
  process.exit(1);
});
