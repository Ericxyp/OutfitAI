/**
 * 衣物写入的共用服务端逻辑（新增 / 编辑 / 批量共用）。
 * 不带 "use server"：由 Server Action 调用，supabase 客户端由调用方注入（便于测试）。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertClosetItemEmbeddingDetailed } from "@/lib/closet/upsert-closet-embedding";
import { logger, safeErrorFields } from "@/lib/logger";
import type { ClosetItem, Database } from "@/types/database";
import type { ClosetItemFormValues } from "@/types/closet";

export const CUSTOM_TAG_MIGRATION_FILE = "supabase/migrations/20261003_closet_custom_tags.sql";

/** 数据库尚未执行自定义标签迁移时的错误（PostgREST schema cache / Postgres undefined column） */
export function isMissingCustomTagColumnsError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    /custom_(style|occasion)_tags/.test(message) &&
    (error.code === "PGRST204" || error.code === "42703" || /column|schema cache/i.test(message))
  );
}

/** 面向用户的错误：开发环境明确指出缺少迁移，生产环境不暴露内部细节 */
export function getMissingCustomTagColumnsMessage(): string {
  return process.env.NODE_ENV === "production"
    ? "保存失败，请稍后重试"
    : `数据库缺少自定义标签字段，请先执行迁移 ${CUSTOM_TAG_MIGRATION_FILE}`;
}

/** 生成 / 更新衣物 Embedding；失败只记录安全日志，不影响衣物保存 */
export async function refreshClosetItemEmbedding(
  supabase: SupabaseClient<Database>,
  item: ClosetItem
): Promise<boolean> {
  try {
    const result = await upsertClosetItemEmbeddingDetailed(supabase, item);
    if (!result.ok) {
      // 衣物保存不受影响；原 embedding 保留，等待下次编辑或 BACKFILL_MODE=stale 回填
      logger.warn("[closet] embedding refresh failed, previous embedding kept", {
        feature: "closet",
        itemId: item.id.slice(0, 8),
        reason: result.reason,
        ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
      });
    }
    return result.ok;
  } catch (error) {
    logger.warn("[closet] embedding refresh failed, previous embedding kept", {
      feature: "closet",
      itemId: item.id.slice(0, 8),
      reason: "exception",
      ...safeErrorFields(error),
    });
    return false;
  }
}

export type UpdateClosetItemResult =
  | { ok: true; item: ClosetItem; previous: ClosetItem }
  | { ok: false; reason: "not_found" | "missing_columns" | "save_failed"; error: string };

/**
 * 编辑衣物：只允许更新当前用户自己的衣物（应用层 eq user_id + 数据库 RLS 双重保护）。
 * 不修改图片、状态和 Embedding 字段；Embedding 由调用方随后重新生成。
 */
export async function updateOwnedClosetItem(
  supabase: SupabaseClient<Database>,
  input: { userId: string; itemId: string; values: ClosetItemFormValues }
): Promise<UpdateClosetItemResult> {
  const { data: previous } = await supabase
    .from("closet_items")
    .select("*")
    .eq("id", input.itemId)
    .eq("user_id", input.userId)
    .maybeSingle();

  if (!previous) {
    return { ok: false, reason: "not_found", error: "衣物不存在或无权编辑" };
  }

  const { values } = input;
  const { data, error } = await supabase
    .from("closet_items")
    .update({
      name: values.name,
      category: values.category,
      color: values.color || null,
      material: values.material || null,
      style_tags: values.style_tags,
      season_tags: values.season_tags,
      occasion_tags: values.occasion_tags,
      custom_style_tags: values.custom_style_tags,
      custom_occasion_tags: values.custom_occasion_tags,
      notes: values.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.itemId)
    .eq("user_id", input.userId)
    .select("*")
    .single();

  if (error || !data) {
    if (isMissingCustomTagColumnsError(error)) {
      logger.error("[closet] custom tag columns missing, run migration", {
        feature: "closet",
        reason: "missing_columns",
      });
      return { ok: false, reason: "missing_columns", error: getMissingCustomTagColumnsMessage() };
    }
    logger.error("[closet] update failed", {
      feature: "closet",
      reason: "save_failed",
      errorName: error?.name ?? "PostgrestError",
      errorMessage: error?.message?.slice(0, 200) ?? "missing row",
    });
    return { ok: false, reason: "save_failed", error: "保存失败，请稍后重试" };
  }

  return { ok: true, item: data, previous };
}
