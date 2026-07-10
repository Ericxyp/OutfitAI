import { createQwenClient, getQwenModel } from "@/lib/ai/qwen";
import type { ClosetItem } from "@/types/database";
import type { StyleProfileContext } from "@/lib/memory/style-profile";

export type StyleSummaryInput = {
  profile: StyleProfileContext | null;
  favoriteItems: ClosetItem[];
  dislikedItems: ClosetItem[];
  recentFeedback: {
    rating: string;
    title: string | null;
    summary: string | null;
    styleTags: string[];
  }[];
};

function buildStyleSummaryPrompt(input: StyleSummaryInput): string {
  const profile = input.profile;
  const lines: string[] = [
    "请根据以下真实用户反馈数据，生成一段中文个人风格总结。",
    "",
    "要求：",
    "- 80-160 字",
    "- 温和、实用，像私人造型师",
    "- 提到风格、颜色、场景和避免元素（如有）",
    "- 不要夸张，不要编造用户没有表现出的偏好",
    "- 只输出总结正文，不要 markdown，不要标题",
    "",
    "用户风格画像数据：",
  ];

  if (profile) {
    lines.push(`反馈次数：${profile.feedbackCount}`);
    if (profile.preferredStyles.length > 0) {
      lines.push(`偏好风格：${profile.preferredStyles.join("、")}`);
    }
    if (profile.preferredColors.length > 0) {
      lines.push(`偏好颜色：${profile.preferredColors.join("、")}`);
    }
    if (profile.preferredOccasions.length > 0) {
      lines.push(`常用场景：${profile.preferredOccasions.join("、")}`);
    }
    if (profile.avoidStyles.length > 0) {
      lines.push(`避免风格：${profile.avoidStyles.join("、")}`);
    }
    if (profile.avoidColors.length > 0) {
      lines.push(`避免颜色：${profile.avoidColors.join("、")}`);
    }
  }

  if (input.favoriteItems.length > 0) {
    lines.push(
      "",
      "常出现在喜欢/收藏中的单品：",
      ...input.favoriteItems.map(
        (item) =>
          `- ${item.name ?? "未命名"}（${item.category ?? "未分类"}，${item.color ?? "未知颜色"}）`
      )
    );
  }

  if (input.dislikedItems.length > 0) {
    lines.push(
      "",
      "出现在不喜欢反馈中的单品：",
      ...input.dislikedItems.map(
        (item) =>
          `- ${item.name ?? "未命名"}（${item.category ?? "未分类"}，${item.color ?? "未知颜色"}）`
      )
    );
  }

  if (input.recentFeedback.length > 0) {
    lines.push("", "最近反馈摘要：");
    for (const fb of input.recentFeedback) {
      const parts = [
        `[${fb.rating}]`,
        fb.title ?? "穿搭推荐",
        fb.styleTags.length > 0 ? `风格：${fb.styleTags.join("、")}` : null,
        fb.summary ? `摘要：${fb.summary}` : null,
      ].filter(Boolean);
      lines.push(`- ${parts.join(" | ")}`);
    }
  }

  return lines.join("\n");
}

export async function generateStyleSummary(
  input: StyleSummaryInput
): Promise<string> {
  const client = createQwenClient();
  const prompt = buildStyleSummaryPrompt(input);

  const response = await client.chat.completions.create({
    model: getQwenModel(),
    messages: [
      {
        role: "system",
        content:
          "你是 OutfitAI 的中文私人造型师，擅长根据用户真实反馈总结个人风格。只输出一段中文总结正文。",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.6,
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("Qwen 未返回风格总结");
  }

  return content.replace(/^["']|["']$/g, "").trim();
}
