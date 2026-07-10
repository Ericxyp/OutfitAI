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

export type AnalyzeProductInput = {
  image_base64?: string;
  image_url?: string;
  mimeType?: string;
  productName?: string;
};

export type ShoppingUserInput = {
  productName?: string;
  price?: string;
  brand?: string;
  productUrl?: string;
  question?: string;
};

export type ProductAnalysis = {
  name: string;
  category: string;
  color: string;
  material: string;
  style_tags: string[];
  season: string;
  season_tags: string[];
  silhouette: string;
  occasion_tags: string[];
  notes: string;
  confidence: number;
  user_input?: ShoppingUserInput;
};

function buildSystemPrompt(): string {
  return `你是 OutfitAI 的中文购物商品识别助手。
请根据图片识别想购买的服饰商品属性，只输出严格 JSON，不要 markdown，不要解释。

JSON 格式：
{
  "name": string,
  "category": string,
  "color": string,
  "material": string,
  "style_tags": string[],
  "season": string,
  "silhouette": string,
  "season_tags": string[],
  "occasion_tags": string[],
  "notes": string,
  "confidence": number
}

分类只能从：${DEFAULT_CATEGORIES.join("、")}
风格只能从：${DEFAULT_STYLE_TAGS.join("、")}
季节只能从：${DEFAULT_SEASON_TAGS.join("、")}
场景只能从：${DEFAULT_OCCASION_TAGS.join("、")}
silhouette 描述版型轮廓，例如：修身、宽松、直筒、A字、短款、长款`;
}

function parseJsonContent<T>(content: string, context = "analyzeProduct"): T {
  const trimmed = content.trim();
  const jsonText = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
    : trimmed;

  try {
    return JSON.parse(jsonText) as T;
  } catch (parseError) {
    console.error(`[${context}] JSON parse failed`);
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
  if (!Array.isArray(values)) {
    return fallback;
  }

  const allowedSet = new Set<string>(allowed);
  return values
    .filter((value): value is string => typeof value === "string")
    .filter((value) => allowedSet.has(value));
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

function normalizeSeason(value: unknown): string {
  if (
    typeof value === "string" &&
    DEFAULT_SEASON_TAGS.includes(value as (typeof DEFAULT_SEASON_TAGS)[number])
  ) {
    return value;
  }

  return DEFAULT_SEASON_TAGS[0];
}

function normalizeAnalysis(raw: Partial<ProductAnalysis>): ProductAnalysis {
  const seasonTags = pickFromAllowed(raw.season_tags, DEFAULT_SEASON_TAGS);
  const season = normalizeSeason(raw.season ?? seasonTags[0]);

  return {
    name:
      typeof raw.name === "string" && raw.name.trim()
        ? raw.name.trim()
        : "未命名商品",
    category: normalizeCategory(raw.category),
    color: typeof raw.color === "string" ? raw.color.trim() : "",
    material: typeof raw.material === "string" ? raw.material.trim() : "",
    style_tags: pickFromAllowed(raw.style_tags, DEFAULT_STYLE_TAGS),
    season,
    season_tags: seasonTags.length > 0 ? seasonTags : [season],
    silhouette:
      typeof raw.silhouette === "string" ? raw.silhouette.trim() : "",
    occasion_tags: pickFromAllowed(raw.occasion_tags, DEFAULT_OCCASION_TAGS),
    notes: typeof raw.notes === "string" ? raw.notes.trim() : "",
    confidence:
      typeof raw.confidence === "number" &&
      raw.confidence >= 0 &&
      raw.confidence <= 1
        ? raw.confidence
        : 0.5,
  };
}

export function mergeProductUserInput(
  product: ProductAnalysis,
  userInput?: ShoppingUserInput
): ProductAnalysis {
  if (!userInput) {
    return product;
  }

  const merged: ProductAnalysis = {
    ...product,
    user_input: userInput,
  };

  if (userInput.productName?.trim()) {
    merged.name = userInput.productName.trim();
  }

  if (userInput.brand?.trim()) {
    merged.notes = merged.notes
      ? `${merged.notes}；品牌：${userInput.brand.trim()}`
      : `品牌：${userInput.brand.trim()}`;
  }

  if (userInput.price?.trim()) {
    merged.notes = merged.notes
      ? `${merged.notes}；参考价格：${userInput.price.trim()}`
      : `参考价格：${userInput.price.trim()}`;
  }

  if (userInput.productUrl?.trim()) {
    merged.notes = merged.notes
      ? `${merged.notes}；链接备注：${userInput.productUrl.trim()}`
      : `链接备注：${userInput.productUrl.trim()}`;
  }

  return merged;
}

function resolveImageUrl(input: AnalyzeProductInput): string {
  if (input.image_base64) {
    const mime = input.mimeType || "image/jpeg";
    return `data:${mime};base64,${input.image_base64}`;
  }

  if (input.image_url) {
    return input.image_url;
  }

  throw new Error("缺少 image_url 或 image_base64");
}

async function requestVisionAnalysis(
  input: AnalyzeProductInput
): Promise<string> {
  const model = getQwenModel();
  const mimeType = input.mimeType || "image/jpeg";
  const base64Length = input.image_base64?.length ?? 0;
  const systemPrompt = buildSystemPrompt();
  const imageUrl = resolveImageUrl(input);
  const startTime = Date.now();

  console.log("[analyzeProduct] request start", {
    model,
    base64Length,
    mimeType,
    hasImageBase64: Boolean(input.image_base64),
    hasImageUrl: Boolean(input.image_url),
    startTime: new Date(startTime).toISOString(),
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
              text: "请识别这件想购买的商品，只输出严格 JSON。",
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
    console.log("[analyzeProduct] request success", {
      elapsedMs,
      contentLength: content.length,
    });

    return content;
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    const details = getQwenErrorDetails(error);
    console.error("[analyzeProduct] request failed", {
      elapsedMs,
      errorName: details.name,
      errorMessage: details.message,
      errorStatus: details.status,
      formatted: formatQwenError(error),
    });
    throw error;
  }
}

export async function analyzeProduct(
  input: AnalyzeProductInput
): Promise<ProductAnalysis> {
  const content = await requestVisionAnalysis(input);
  const parsed = parseJsonContent<Partial<ProductAnalysis>>(content);

  const normalized = normalizeAnalysis(parsed);
  const hasUserName = Boolean(input.productName?.trim());
  const hasVisionName =
    normalized.name && normalized.name !== "未命名商品";

  if (!hasVisionName && !hasUserName) {
    throw new Error("无法识别这件商品，请换一张更清晰的图片或填写商品名称");
  }

  if (!hasVisionName && hasUserName) {
    normalized.name = input.productName?.trim() ?? normalized.name;
  }

  return normalized;
}
