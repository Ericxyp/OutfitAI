import {
  DEFAULT_CATEGORIES,
  DEFAULT_OCCASION_TAGS,
  DEFAULT_SEASON_TAGS,
  DEFAULT_STYLE_TAGS,
} from "@/lib/constants/clothing-options";
import {
  createQwenClient,
  formatQwenError,
  getQwenErrorDetails,
  getQwenModel,
} from "@/lib/ai/qwen";
import type { ClothingAnalysis } from "@/types/closet";

export type { ClothingAnalysis } from "@/types/closet";

export type AnalyzeClothingInput = {
  image_url?: string;
  image_base64?: string;
  mimeType?: string;
};

const ALLOWED_WEARABLE_HINT =
  "上衣、下装、裤子、裙装、连衣裙、外套、鞋、包、帽子、围巾、首饰、腰带等穿戴类物品";

const REJECTED_SUBJECT_HINT =
  "食物、家具、宠物、风景、截图、人物自拍、家电、日用品等非穿戴类主体";

function buildSystemPrompt(): string {
  return `你是 OutfitAI 的中文衣物识别助手。
请先判断图片主体是否属于可加入衣橱的穿戴类物品，再输出严格 JSON，不要 markdown，不要解释。

允许加入衣橱：${ALLOWED_WEARABLE_HINT}
不能加入衣橱：${REJECTED_SUBJECT_HINT}

如果图片主体不是衣物/鞋包/配饰：
- 必须返回 "is_clothing": false
- 不要强行把非衣物归类为上衣/下装（例如玉米、水果、猫、沙发都不能归类为上衣）
- "rejection_reason" 用中文说明原因（例如："图片主体是玉米，属于食物，不是穿戴类物品"）
- 其他字段可留空字符串或空数组，"confidence" 填写你对判断的置信度（0-1）

如果是穿戴类物品：
- 返回 "is_clothing": true
- 正常识别 name、category、color 等字段
- 不要填写 rejection_reason

JSON 格式：
{
  "is_clothing": boolean,
  "rejection_reason": string,
  "name": string,
  "category": string,
  "color": string,
  "material": string,
  "style_tags": string[],
  "season_tags": string[],
  "occasion_tags": string[],
  "notes": string,
  "confidence": number
}

分类只能从：${DEFAULT_CATEGORIES.join("、")}
风格只能从：${DEFAULT_STYLE_TAGS.join("、")}
季节只能从：${DEFAULT_SEASON_TAGS.join("、")}
场景只能从：${DEFAULT_OCCASION_TAGS.join("、")}`;
}

function parseJsonContent<T>(content: string, context = "analyzeClothing"): T {
  const trimmed = content.trim();
  const jsonText = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
    : trimmed;

  try {
    return JSON.parse(jsonText) as T;
  } catch (parseError) {
    console.error(`[${context}] JSON parse failed`);
    console.error(`[${context}] Raw content:`, content);
    console.error(`[${context}] Parse error:`, parseError);
    throw new Error(
      `AI 返回格式异常：${parseError instanceof Error ? parseError.message : "JSON 解析失败"}`
    );
  }
}

function pickFromAllowed(
  values: unknown,
  allowed: readonly string[],
  fallback: string[] = []
): string[] {
  if (!Array.isArray(values)) return fallback;
  const allowedSet = new Set<string>(allowed);
  return values
    .filter((v): v is string => typeof v === "string")
    .filter((v) => allowedSet.has(v));
}

function normalizeCategory(value: unknown): string {
  if (
    typeof value === "string" &&
    DEFAULT_CATEGORIES.includes(value as (typeof DEFAULT_CATEGORIES)[number])
  ) {
    return value;
  }
  return DEFAULT_CATEGORIES[0];
}

function normalizeConfidence(value: unknown): number {
  return typeof value === "number" && value >= 0 && value <= 1
    ? value
    : 0.5;
}

export function normalizeClothingAnalysis(
  raw: Partial<ClothingAnalysis>
): ClothingAnalysis {
  const isClothing = raw.is_clothing === true;

  if (!isClothing) {
    return {
      name: "",
      category: "",
      color: "",
      material: "",
      style_tags: [],
      season_tags: [],
      occasion_tags: [],
      notes: "",
      confidence: normalizeConfidence(raw.confidence),
      is_clothing: false,
      rejection_reason:
        typeof raw.rejection_reason === "string" && raw.rejection_reason.trim()
          ? raw.rejection_reason.trim()
          : "图片主体不是可加入衣橱的穿戴类物品",
    };
  }

  return {
    name:
      typeof raw.name === "string" && raw.name.trim()
        ? raw.name.trim()
        : "未命名衣物",
    category: normalizeCategory(raw.category),
    color: typeof raw.color === "string" ? raw.color.trim() : "",
    material: typeof raw.material === "string" ? raw.material.trim() : "",
    style_tags: pickFromAllowed(raw.style_tags, DEFAULT_STYLE_TAGS),
    season_tags: pickFromAllowed(raw.season_tags, DEFAULT_SEASON_TAGS),
    occasion_tags: pickFromAllowed(raw.occasion_tags, DEFAULT_OCCASION_TAGS),
    notes: typeof raw.notes === "string" ? raw.notes.trim() : "",
    confidence: normalizeConfidence(raw.confidence),
    is_clothing: true,
  };
}

function resolveImageUrl(input: AnalyzeClothingInput): string {
  if (input.image_url) {
    return input.image_url;
  }

  if (input.image_base64) {
    const mime = input.mimeType || "image/jpeg";
    return `data:${mime};base64,${input.image_base64}`;
  }

  throw new Error("缺少 image_url 或 image_base64");
}

async function requestVisionAnalysis(
  input: AnalyzeClothingInput
): Promise<string> {
  const model = getQwenModel();
  const mimeType = input.mimeType || "image/jpeg";
  const base64Length = input.image_base64?.length ?? 0;
  const systemPrompt = buildSystemPrompt();
  const imageUrl = resolveImageUrl(input);
  const startTime = Date.now();

  console.log("[analyzeClothing] request start", {
    model,
    base64Length,
    mimeType,
    startTime: new Date(startTime).toISOString(),
    api: "qwen-chat-completions",
  });

  try {
    const client = createQwenClient();
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "请先判断图片主体是否为可加入衣橱的穿戴类物品，再识别属性，只输出严格 JSON。",
            },
            {
              type: "image_url",
              image_url: { url: imageUrl },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Qwen 未返回识别结果");
    }

    const elapsedMs = Date.now() - startTime;
    console.log("[analyzeClothing] request success", {
      elapsedMs,
      contentLength: content.length,
    });
    console.log("[analyzeClothing] raw content:", content);

    return content;
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    const details = getQwenErrorDetails(error);
    console.error("[analyzeClothing] request failed", {
      elapsedMs,
      errorName: details.name,
      errorMessage: details.message,
      errorStatus: details.status,
      errorCode: details.code,
      formatted: formatQwenError(error),
    });
    console.error("[analyzeClothing] full error:", error);
    throw error;
  }
}

export async function analyzeClothing(
  input: AnalyzeClothingInput
): Promise<ClothingAnalysis> {
  const content = await requestVisionAnalysis(input);
  const parsed = parseJsonContent<Partial<ClothingAnalysis>>(content);
  return normalizeClothingAnalysis(parsed);
}
