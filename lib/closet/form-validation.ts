import { DEFAULT_CATEGORIES } from "@/lib/constants/clothing-options";
import {
  normalizeCustomTagList,
  type CustomTagErrorType,
} from "@/lib/closet/custom-tags";
import type { ClosetItemFormValues } from "@/types/closet";

function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const tag of tags) {
    const trimmed = tag.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
}

export type ClosetFormValidationResult =
  | {
      ok: true;
      values: ClosetItemFormValues;
      /** 被丢弃的非法自定义标签数量（不阻止保存，仅用于聚合埋点） */
      customTagRejectedCount: number;
      customTagErrorType: CustomTagErrorType | null;
    }
  | { ok: false; error: string };

export function validateClosetItemFormValues(
  input: Partial<Omit<ClosetItemFormValues, "custom_style_tags" | "custom_occasion_tags">> & {
    name?: string | null;
    category?: string | null;
    /** 来自客户端的自定义标签：服务端一律重新校验，不信任客户端结果 */
    custom_style_tags?: unknown;
    custom_occasion_tags?: unknown;
  }
): ClosetFormValidationResult {
  const name = input.name?.toString().trim() ?? "";
  const category = input.category?.toString().trim() ?? "";

  if (!name) {
    return { ok: false, error: "请填写衣服名称" };
  }

  if (!category) {
    return { ok: false, error: "请选择分类" };
  }

  if (!(DEFAULT_CATEGORIES as readonly string[]).includes(category)) {
    return { ok: false, error: "分类无效，请重新选择" };
  }

  const customStyle = normalizeCustomTagList(input.custom_style_tags ?? [], "style");
  const customOccasion = normalizeCustomTagList(input.custom_occasion_tags ?? [], "occasion");

  return {
    ok: true,
    customTagRejectedCount: customStyle.rejectedCount + customOccasion.rejectedCount,
    customTagErrorType: customStyle.firstError ?? customOccasion.firstError,
    values: {
      name,
      category,
      color: input.color?.toString().trim() ?? "",
      material: input.material?.toString().trim() ?? "",
      style_tags: dedupeTags(input.style_tags ?? []),
      season_tags: dedupeTags(input.season_tags ?? []),
      occasion_tags: dedupeTags(input.occasion_tags ?? []),
      custom_style_tags: customStyle.tags,
      custom_occasion_tags: customOccasion.tags,
      notes: input.notes?.toString().trim() ?? "",
    },
  };
}

export function formatBatchAnalysisError(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message;
    if (
      message.includes("超时") ||
      message.toLowerCase().includes("timeout")
    ) {
      return "识别服务暂时不可用，请稍后重试。";
    }
    if (
      message.includes("格式") ||
      message.includes("JSON") ||
      message.includes("识别结果异常")
    ) {
      return "识别结果异常，请重试。";
    }
    if (
      message === "请先登录" ||
      message.includes("5MB") ||
      message.includes("不支持") ||
      message.includes("HEIC")
    ) {
      return message;
    }
  }

  return "识别服务暂时不可用，请稍后重试。";
}
