import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { PersonalProfileContext } from "@/lib/memory/personal-profile-shared";
import type { StyleProfileContext } from "@/lib/memory/style-profile";
import type {
  UserPersonalProfile,
  UserStyleProfile,
} from "@/types/database";

export type StyleKnowledgeEntry = {
  id: string;
  title: string;
  category: string;
  tags: string[];
  content: string;
  priority: number;
  is_active: boolean;
  created_at: string;
};

export type RetrieveStyleKnowledgeInput = {
  supabase: SupabaseClient<Database>;
  query: string;
  occasion?: string | null;
  weatherSummary?: string | null;
  styleProfile?: StyleProfileContext | UserStyleProfile | null;
  personalProfile?: PersonalProfileContext | UserPersonalProfile | null;
  limit?: number;
};

export type StyleKnowledgeProfileInput =
  | UserStyleProfile
  | StyleProfileContext
  | null
  | undefined;

export type PersonalKnowledgeProfileInput =
  | UserPersonalProfile
  | PersonalProfileContext
  | null
  | undefined;

export const STYLE_KNOWLEDGE_CATEGORY_LABELS: Record<string, string> = {
  occasion: "场合",
  weather: "天气",
  body_goal: "体型目标",
  style: "风格",
  color: "色彩",
  item: "单品",
};

export const STYLE_KNOWLEDGE_KNOWN_TERMS = [
  "上班",
  "通勤",
  "面试",
  "商务",
  "职场",
  "开会",
  "会议",
  "正式",
  "约会",
  "见面",
  "晚餐",
  "浪漫",
  "温柔",
  "旅行",
  "出游",
  "逛街",
  "周末",
  "日常",
  "休闲",
  "运动",
  "户外",
  "高温",
  "炎热",
  "夏天",
  "夏季",
  "低温",
  "寒冷",
  "冬季",
  "保暖",
  "雨天",
  "下雨",
  "防水",
  "显高",
  "显瘦",
  "遮肉",
  "舒适",
  "减龄",
  "成熟",
  "简约",
  "优雅",
  "精致",
  "街头",
  "韩系",
  "复古",
  "色彩",
  "配色",
  "协调",
  "同色系",
  "对比色",
  "鞋子",
  "包包",
  "配饰",
  "低饱和",
  "中性色",
  "黑白灰",
] as const;

export function getStyleKnowledgeCategoryLabel(category: string): string {
  return STYLE_KNOWLEDGE_CATEGORY_LABELS[category] ?? category;
}

export function formatStyleKnowledgeForPrompt(
  entries: StyleKnowledgeEntry[]
): string {
  if (entries.length === 0) {
    return "";
  }

  const lines = [
    "可参考的穿搭知识：",
    "以下知识仅供你内部参考，请融入推荐理由，不要原样照抄，也不要向用户暴露知识编号、知识库名称、数据库字段或 UUID。若知识与用户真实衣橱冲突，以用户衣橱为准。",
  ];

  for (const entry of entries) {
    const categoryLabel = getStyleKnowledgeCategoryLabel(entry.category);
    lines.push(`- ${entry.title}（${categoryLabel}）：${entry.content}`);
  }

  return lines.join("\n");
}

export function isStyleProfileContext(
  profile: StyleKnowledgeProfileInput
): profile is StyleProfileContext {
  return Boolean(profile && "preferredStyles" in profile);
}

export function isPersonalProfileContext(
  profile: PersonalKnowledgeProfileInput
): profile is PersonalProfileContext {
  return Boolean(profile && "fitGoals" in profile);
}
