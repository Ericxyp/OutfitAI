import type { ClosetItem } from "@/types/database";
import { createQwenClient, getQwenModel } from "@/lib/ai/qwen";

export interface OutfitAIResponse {
  title: string;
  selected_item_ids: string[];
  summary: string;
  reasoning: string;
  style_tags: string[];
  occasion: string;
  alternatives: string[];
}

function buildSystemPrompt(): string {
  return `你是 OutfitAI 的中文 AI 私人穿搭顾问。

规则：
1. 只能从用户提供的 closet_items 中选择衣服，selected_item_ids 必须是其中已有的 id
2. 不要虚构不存在的衣服，不要编造不在衣橱列表中的 id
3. 推荐理由要具体说明为什么这些衣服适合用户需求（颜色、材质、风格、场合等）
4. 搭配应完整实用，尽量包含上装、下装，必要时加外套或鞋子（若衣橱中有）
5. 输出中文
6. 必须输出严格 JSON，不要 markdown，不要代码块，不要额外说明

JSON 格式：
{
  "title": string,
  "selected_item_ids": string[],
  "summary": string,
  "reasoning": string,
  "style_tags": string[],
  "occasion": string,
  "alternatives": string[]
}`;
}

function buildUserPrompt(
  requestText: string,
  closetItems: ClosetItem[],
  options?: { excludeItemIds?: string[]; retry?: boolean }
): string {
  const wardrobe = closetItems.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    color: item.color,
    material: item.material,
    style_tags: item.style_tags,
    season_tags: item.season_tags,
    occasion_tags: item.occasion_tags,
    notes: item.notes,
  }));

  let prompt = `用户穿搭需求：${requestText}

用户衣橱（closet_items）：
${JSON.stringify(wardrobe, null, 2)}

请根据需求从以上衣橱中搭配一套穿搭，返回严格 JSON。`;

  if (options?.excludeItemIds?.length) {
    prompt += `\n\n请避免与上次完全相同的搭配组合，上次选用了 id：${options.excludeItemIds.join(", ")}，请尝试不同的搭配方案。`;
  }

  if (options?.retry) {
    prompt += `\n\n注意：上次返回的 selected_item_ids 包含无效 id，请确保所有 id 都严格来自上方 closet_items 列表。`;
  }

  return prompt;
}

function parseModelResponse(content: string): OutfitAIResponse {
  const trimmed = content.trim();
  const jsonText = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
    : trimmed;

  let parsed: OutfitAIResponse;
  try {
    parsed = JSON.parse(jsonText) as OutfitAIResponse;
  } catch {
    throw new Error("AI 返回格式异常，请稍后再试");
  }

  if (
    typeof parsed.title !== "string" ||
    !Array.isArray(parsed.selected_item_ids) ||
    typeof parsed.summary !== "string" ||
    typeof parsed.reasoning !== "string" ||
    !Array.isArray(parsed.style_tags) ||
    typeof parsed.occasion !== "string" ||
    !Array.isArray(parsed.alternatives)
  ) {
    throw new Error("AI 返回格式不正确，请稍后再试");
  }

  return parsed;
}

async function callQwen(
  requestText: string,
  closetItems: ClosetItem[],
  options?: { excludeItemIds?: string[]; retry?: boolean }
): Promise<OutfitAIResponse> {
  const client = createQwenClient();
  const startTime = Date.now();

  console.log("[generateOutfit] request start", {
    model: getQwenModel(),
    startTime: new Date(startTime).toISOString(),
  });

  const response = await client.chat.completions.create({
    model: getQwenModel(),
    messages: [
      { role: "system", content: buildSystemPrompt() },
      {
        role: "user",
        content: buildUserPrompt(requestText, closetItems, options),
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Qwen 未返回内容，请稍后再试");
  }

  console.log("[generateOutfit] request success", {
    elapsedMs: Date.now() - startTime,
  });

  return parseModelResponse(content);
}

function filterValidItemIds(
  ids: string[],
  closetItems: ClosetItem[]
): string[] {
  const validIds = new Set(closetItems.map((item) => item.id));
  return ids.filter((id) => validIds.has(id));
}

export async function generateOutfit(
  requestText: string,
  closetItems: ClosetItem[],
  options?: { excludeItemIds?: string[] }
): Promise<OutfitAIResponse> {
  let lastResponse: OutfitAIResponse | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await callQwen(requestText, closetItems, {
      ...options,
      retry: attempt > 0,
    });

    lastResponse = response;
    const validIds = filterValidItemIds(
      response.selected_item_ids,
      closetItems
    );

    if (validIds.length > 0) {
      return {
        ...response,
        selected_item_ids: validIds,
      };
    }
  }

  throw new Error(
    lastResponse
      ? "推荐结果无效，请稍后重试"
      : "生成推荐失败，请稍后重试"
  );
}
