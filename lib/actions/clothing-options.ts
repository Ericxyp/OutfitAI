"use server";

import {
  DEFAULT_CATEGORIES,
  DEFAULT_OCCASION_TAGS,
  DEFAULT_SEASON_TAGS,
  DEFAULT_STYLE_TAGS,
} from "@/lib/constants/clothing-options";
import type { ClothingOptions } from "@/types/closet";

/**
 * 返回用户可用的衣服选项（分类、风格、季节、场景）。
 *
 * MVP：直接返回默认选项。
 * 未来：从 Supabase `user_clothing_options` 表读取用户自定义项，
 * 与 DEFAULT_* 合并去重后返回。
 */
export async function getClothingOptions(
  userId?: string
): Promise<ClothingOptions> {
  void userId;

  // Future:
  // if (userId) {
  //   const supabase = await createClient();
  //   const { data } = await supabase
  //     .from("user_clothing_options")
  //     .select("*")
  //     .eq("user_id", userId)
  //     .single();
  //   return mergeClothingOptions(DEFAULT_*, data);
  // }

  return {
    categories: [...DEFAULT_CATEGORIES],
    styleTags: [...DEFAULT_STYLE_TAGS],
    seasonTags: [...DEFAULT_SEASON_TAGS],
    occasionTags: [...DEFAULT_OCCASION_TAGS],
  };
}
