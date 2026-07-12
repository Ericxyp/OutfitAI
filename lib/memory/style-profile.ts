import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, UserStyleProfile } from "@/types/database";

export type StyleProfileContext = {
  preferredStyles: string[];
  preferredColors: string[];
  preferredOccasions: string[];
  avoidStyles: string[];
  avoidColors: string[];
  favoriteItemIds: string[];
  dislikedItemIds: string[];
  styleSummary: string | null;
  feedbackCount: number;
};

function mapRowToContext(row: UserStyleProfile): StyleProfileContext {
  return {
    preferredStyles: row.preferred_styles,
    preferredColors: row.preferred_colors,
    preferredOccasions: row.preferred_occasions,
    avoidStyles: row.avoid_styles,
    avoidColors: row.avoid_colors,
    favoriteItemIds: row.favorite_item_ids,
    dislikedItemIds: row.disliked_item_ids,
    styleSummary: row.style_summary,
    feedbackCount: row.feedback_count,
  };
}

export async function getUserStyleProfile(
  userId: string,
  supabaseClient?: SupabaseClient<Database>
): Promise<StyleProfileContext | null> {
  try {
    const supabase = supabaseClient ?? (await createClient());
    const { data, error } = await supabase
      .from("user_style_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return mapRowToContext(data);
  } catch (error) {
    console.error("[styleProfile] getUserStyleProfile failed:", error);
    return null;
  }
}

function formatTagList(label: string, tags: string[]): string | null {
  if (tags.length === 0) return null;
  return `${label}：${tags.join("、")}`;
}

export function formatStyleProfileForPrompt(
  profile: StyleProfileContext | null,
  options?: {
    favoriteItemNames?: string[];
    dislikedItemNames?: string[];
  }
): string {
  if (!profile || profile.feedbackCount <= 0) {
    return "";
  }

  const lines = ["用户风格画像："];

  const preferredStyles = formatTagList("偏好风格", profile.preferredStyles);
  if (preferredStyles) lines.push(preferredStyles);

  const preferredColors = formatTagList("偏好颜色", profile.preferredColors);
  if (preferredColors) lines.push(preferredColors);

  const preferredOccasions = formatTagList("常用场景", profile.preferredOccasions);
  if (preferredOccasions) lines.push(preferredOccasions);

  const avoidStyles = formatTagList("避免风格", profile.avoidStyles);
  if (avoidStyles) lines.push(avoidStyles);

  const avoidColors = formatTagList("避免颜色", profile.avoidColors);
  if (avoidColors) lines.push(avoidColors);

  if (options?.favoriteItemNames && options.favoriteItemNames.length > 0) {
    lines.push(`偏好单品：${options.favoriteItemNames.join("、")}`);
  }

  if (options?.dislikedItemNames && options.dislikedItemNames.length > 0) {
    lines.push(`不喜欢的单品：${options.dislikedItemNames.join("、")}`);
  }

  if (profile.styleSummary) {
    lines.push(`风格总结：${profile.styleSummary}`);
  }

  if (lines.length === 1) {
    return "";
  }

  return lines.join("\n");
}
