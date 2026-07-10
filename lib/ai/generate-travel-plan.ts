import type { ClosetItem } from "@/types/database";
import type { WeatherContext } from "@/types/weather";
import { createQwenClient, getQwenModel } from "@/lib/ai/qwen";
import { formatStyleProfileForPrompt, type StyleProfileContext } from "@/lib/memory/style-profile";
import {
  formatPersonalProfileForPrompt,
  hasPersonalProfileData,
  PERSONAL_PROFILE_SAFETY_RULES,
  type PersonalProfileContext,
} from "@/lib/memory/personal-profile";
import {
  containsVisibleId,
  sanitizeVisibleAiText,
} from "@/lib/text/sanitize-visible-ai-text";
import { buildWeatherGuidance, formatWeatherContextBlock } from "@/lib/weather-guidance";

export type TravelPackingList = {
  tops: string[];
  bottoms: string[];
  outerwear: string[];
  shoes: string[];
  accessories: string[];
  notes: string[];
};

export type TravelDayAIResult = {
  day_index: number;
  title: string;
  selected_item_ids: string[];
  summary: string;
  reasoning: string;
};

export type TravelPlanAIResponse = {
  packing_list: TravelPackingList;
  days: TravelDayAIResult[];
};

export type GenerateTravelPlanInput = {
  destination: string;
  startDate?: string;
  days: number;
  purpose?: string;
  stylePreference?: string;
  packLight?: boolean;
  weatherForecast: WeatherContext[] | null;
  styleProfile: StyleProfileContext | null;
  personalProfile?: PersonalProfileContext | null;
  closetItems: ClosetItem[];
};

export type GenerateTravelPlanRetryContext = {
  invalidIds?: boolean;
  visibleIds?: boolean;
};

function buildSystemPrompt(
  hasWeather: boolean,
  hasStyleProfile: boolean,
  hasPersonalProfile: boolean,
  packLight: boolean
): string {
  const packLightRules = packLight
    ? `
- 尽量少带衣服：尽量复用鞋子、外套、包；上衣可以更多变化；避免每天完全不同导致行李过多`
    : "";

  const weatherRules = hasWeather
    ? `
- 每一天必须考虑对应日期的天气预报`
    : "";

  const styleRules = hasStyleProfile
    ? `
- 参考用户风格画像，优先贴合偏好，避免不喜欢的元素`
    : "";

  const personalRules = hasPersonalProfile
    ? `
- 参考用户个人信息与穿衣目标优化每日搭配
- ${PERSONAL_PROFILE_SAFETY_RULES}`
    : "";

  return `你是 OutfitAI 的中文旅行穿搭规划师。

规则：
1. 只能从用户提供的 closet_items 中选择衣服
2. selected_item_ids 必须是 closet_items 中存在的 id
3. title、summary、reasoning、packing_list 中禁止出现 UUID、数据库 id、「id:」「item_id」
4. 用户可见文案只能使用衣服 name 称呼单品
5. 每一天尽量完整：上装、下装、鞋子，必要时外套/配饰
6. 避免每天完全相同，也避免毫无复用${packLightRules}${weatherRules}${styleRules}${personalRules}
7. 如果衣橱不足以满足所有天数，在 packing_list.notes 中说明复用策略
8. reasoning 必须解释天气、场景、风格适配（如有天气数据）
9. 输出中文，必须输出严格 JSON，不要 markdown

JSON 格式：
{
  "packing_list": {
    "tops": string[],
    "bottoms": string[],
    "outerwear": string[],
    "shoes": string[],
    "accessories": string[],
    "notes": string[]
  },
  "days": [
    {
      "day_index": number,
      "title": string,
      "selected_item_ids": string[],
      "summary": string,
      "reasoning": string
    }
  ]
}`;
}

function mapItemIdsToNames(
  itemIds: string[],
  closetItems: ClosetItem[]
): string[] {
  const nameById = new Map(
    closetItems.map((item) => [item.id, item.name?.trim() || "未命名衣物"])
  );
  return itemIds
    .map((id) => nameById.get(id))
    .filter((name): name is string => Boolean(name));
}

function buildUserPrompt(
  input: GenerateTravelPlanInput,
  retryContext?: GenerateTravelPlanRetryContext
): string {
  const wardrobe = input.closetItems.map((item) => ({
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

  let prompt = `旅行目的地：${input.destination}
旅行天数：${input.days} 天`;

  if (input.startDate) {
    prompt += `\n出发日期：${input.startDate}`;
  }
  if (input.purpose) {
    prompt += `\n旅行目的：${input.purpose}`;
  }
  if (input.stylePreference) {
    prompt += `\n风格偏好：${input.stylePreference}`;
  }
  if (input.packLight) {
    prompt += `\n尽量少带衣服：是`;
  }

  const profile = input.styleProfile;
  const styleBlock = formatStyleProfileForPrompt(profile, {
    favoriteItemNames: profile
      ? mapItemIdsToNames(profile.favoriteItemIds, input.closetItems)
      : undefined,
    dislikedItemNames: profile
      ? mapItemIdsToNames(profile.dislikedItemIds, input.closetItems)
      : undefined,
  });
  if (styleBlock) {
    prompt += `\n\n${styleBlock}`;
  }

  const personalBlock = formatPersonalProfileForPrompt(
    input.personalProfile ?? null
  );
  if (personalBlock) {
    prompt += `\n\n${personalBlock}`;
  }

  if (input.weatherForecast && input.weatherForecast.length > 0) {
    prompt += `\n\n每日天气预报：`;
    for (let i = 0; i < input.weatherForecast.length; i++) {
      const w = input.weatherForecast[i];
      prompt += `\n\nDay ${i + 1}${w.date ? `（${w.date}）` : ""}：
${formatWeatherContextBlock(w)}
天气穿搭提示：${buildWeatherGuidance(w)}`;
    }
  }

  prompt += `

用户衣橱（closet_items）：
${JSON.stringify(wardrobe, null, 2)}

请生成 ${input.days} 天的旅行穿搭计划（day_index 从 1 到 ${input.days}）和打包清单，返回严格 JSON。

重要：
- selected_item_ids 必须填写 closet_items 中的 id 字段，不能填写衣服名称
- 如果你在文案中使用衣服名称，对应的 selected_item_ids 仍必须是该衣服的 id
- 用户可见字段只能使用 name，不能出现 id 或 UUID`;

  if (retryContext?.visibleIds) {
    prompt += `\n\n上次返回的用户可见文案包含内部 id / UUID。请重新生成：selected_item_ids 仍用真实 id，但所有用户可见文本只能使用衣服名称。`;
  }
  if (retryContext?.invalidIds) {
    prompt += `\n\n上次返回的 selected_item_ids 无效。请确保每个 selected_item_ids 都使用 closet_items 里的 id 字段（UUID），不要填写衣服名称或自造编号。`;
  }

  return prompt;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function normalizePackingList(value: unknown): TravelPackingList {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  return {
    tops: normalizeStringArray(source.tops),
    bottoms: normalizeStringArray(source.bottoms),
    outerwear: normalizeStringArray(source.outerwear),
    shoes: normalizeStringArray(source.shoes),
    accessories: normalizeStringArray(source.accessories),
    notes: normalizeStringArray(source.notes),
  };
}

function normalizeDay(day: unknown, index: number): TravelDayAIResult {
  const fallbackIndex = index + 1;

  if (!day || typeof day !== "object") {
    return {
      day_index: fallbackIndex,
      title: `第${fallbackIndex}天穿搭`,
      selected_item_ids: [],
      summary: "根据你的衣橱搭配了一套适合当天的穿搭。",
      reasoning: "结合旅行场景与衣橱单品进行选择。",
    };
  }

  const record = day as Record<string, unknown>;
  const dayIndex =
    typeof record.day_index === "number" && Number.isFinite(record.day_index)
      ? record.day_index
      : fallbackIndex;

  return {
    day_index: dayIndex,
    title:
      typeof record.title === "string" && record.title.trim()
        ? record.title
        : `第${fallbackIndex}天穿搭`,
    selected_item_ids: normalizeStringArray(record.selected_item_ids),
    summary:
      typeof record.summary === "string" && record.summary.trim()
        ? record.summary
        : "根据你的衣橱搭配了一套适合当天的穿搭。",
    reasoning:
      typeof record.reasoning === "string" && record.reasoning.trim()
        ? record.reasoning
        : "结合旅行场景与衣橱单品进行选择。",
  };
}

function sanitizePackingList(list: TravelPackingList): TravelPackingList {
  return {
    tops: list.tops.map(sanitizeVisibleAiText),
    bottoms: list.bottoms.map(sanitizeVisibleAiText),
    outerwear: list.outerwear.map(sanitizeVisibleAiText),
    shoes: list.shoes.map(sanitizeVisibleAiText),
    accessories: list.accessories.map(sanitizeVisibleAiText),
    notes: list.notes.map(sanitizeVisibleAiText),
  };
}

function assertNoVisibleIdsInTravelResponse(parsed: TravelPlanAIResponse): void {
  const dayTexts = parsed.days.flatMap((day) => [
    day.title,
    day.summary,
    day.reasoning,
  ]);

  const packingTexts = [
    ...parsed.packing_list.tops,
    ...parsed.packing_list.bottoms,
    ...parsed.packing_list.outerwear,
    ...parsed.packing_list.shoes,
    ...parsed.packing_list.accessories,
    ...parsed.packing_list.notes,
  ];

  for (const text of [...dayTexts, ...packingTexts]) {
    if (containsVisibleId(text)) {
      throw new Error("AI 返回包含内部编号，请重新生成");
    }
  }
}

function parseTravelResponse(content: string): TravelPlanAIResponse {
  const trimmed = content.trim();
  const jsonText = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
    : trimmed;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("AI 返回格式异常，请稍后再试");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("AI 返回格式不正确，请稍后再试");
  }

  const record = parsed as Record<string, unknown>;

  if (!Array.isArray(record.days)) {
    throw new Error("AI 返回格式不正确，请稍后再试");
  }

  const normalized: TravelPlanAIResponse = {
    packing_list: normalizePackingList(record.packing_list),
    days: record.days.map((day, index) => normalizeDay(day, index)),
  };

  assertNoVisibleIdsInTravelResponse(normalized);

  return {
    packing_list: sanitizePackingList(normalized.packing_list),
    days: normalized.days.map((day) => ({
      day_index: day.day_index,
      selected_item_ids: day.selected_item_ids,
      title: sanitizeVisibleAiText(day.title),
      summary: sanitizeVisibleAiText(day.summary),
      reasoning: sanitizeVisibleAiText(day.reasoning),
    })),
  };
}

const MAX_RESOLVED_ITEMS = 6;

function normalizeMatchText(text: string): string {
  return text.replace(/\s+/g, "").trim();
}

function matchItemByName(
  rawValue: string,
  closetItems: ClosetItem[]
): ClosetItem | undefined {
  const raw = rawValue.trim();
  if (!raw) {
    return undefined;
  }

  const rawNormalized = normalizeMatchText(raw);

  const exactMatch = closetItems.find(
    (item) => (item.name?.trim() ?? "") === raw
  );
  if (exactMatch) {
    return exactMatch;
  }

  const normalizedMatch = closetItems.find(
    (item) => normalizeMatchText(item.name ?? "") === rawNormalized
  );
  if (normalizedMatch) {
    return normalizedMatch;
  }

  const rawContainsName = closetItems.find((item) => {
    const name = item.name?.trim();
    return Boolean(name && raw.includes(name));
  });
  if (rawContainsName) {
    return rawContainsName;
  }

  const nameContainsRaw = closetItems.find((item) => {
    const name = item.name?.trim();
    return Boolean(name && name.includes(raw));
  });
  if (nameContainsRaw) {
    return nameContainsRaw;
  }

  return undefined;
}

function resolveSelectedItemIds(
  rawIds: string[],
  closetItems: ClosetItem[],
  visibleTexts?: string[]
): string[] {
  const validIds = new Set(closetItems.map((item) => item.id));
  const resolved: string[] = [];
  const seen = new Set<string>();

  const addId = (id: string) => {
    if (!validIds.has(id) || seen.has(id) || resolved.length >= MAX_RESOLVED_ITEMS) {
      return;
    }
    seen.add(id);
    resolved.push(id);
  };

  for (const raw of rawIds) {
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }

    if (validIds.has(trimmed)) {
      addId(trimmed);
      continue;
    }

    const matched = matchItemByName(trimmed, closetItems);
    if (matched) {
      addId(matched.id);
    }
  }

  if (resolved.length === 0 && visibleTexts && visibleTexts.length > 0) {
    const combinedText = visibleTexts.join(" ");
    const itemsByNameLength = [...closetItems]
      .filter((item) => item.name?.trim())
      .sort((a, b) => (b.name?.length ?? 0) - (a.name?.length ?? 0));

    for (const item of itemsByNameLength) {
      const name = item.name?.trim();
      if (name && combinedText.includes(name)) {
        addId(item.id);
      }
    }
  }

  return resolved;
}

function resolveDaySelectedItemIds(
  day: TravelDayAIResult,
  closetItems: ClosetItem[]
): string[] {
  const resolved = resolveSelectedItemIds(
    day.selected_item_ids,
    closetItems,
    [day.title, day.summary, day.reasoning]
  );

  const validIds = new Set(closetItems.map((item) => item.id));
  const validRawCount = day.selected_item_ids.filter((id) =>
    validIds.has(id.trim())
  ).length;

  if (resolved.length > 0 && resolved.length !== validRawCount) {
    console.warn("[generateTravelPlan] resolved item ids from names", {
      dayIndex: day.day_index,
      rawCount: day.selected_item_ids.length,
      resolvedCount: resolved.length,
    });
  }

  return resolved;
}

async function callQwenTravelPlan(
  input: GenerateTravelPlanInput,
  retryContext?: GenerateTravelPlanRetryContext
): Promise<TravelPlanAIResponse> {
  const client = createQwenClient();
  const hasWeather = Boolean(input.weatherForecast?.length);
  const hasStyleProfile = Boolean(
    input.styleProfile && input.styleProfile.feedbackCount > 0
  );
  const hasPersonalProfile = hasPersonalProfileData(
    input.personalProfile ?? null
  );

  console.log("[generateTravelPlan] request start", {
    model: getQwenModel(),
    days: input.days,
    hasWeather,
    hasStyleProfile,
    hasPersonalProfile,
    packLight: Boolean(input.packLight),
    retryContext,
  });

  const response = await client.chat.completions.create({
    model: getQwenModel(),
    messages: [
      {
        role: "system",
        content: buildSystemPrompt(
          hasWeather,
          hasStyleProfile,
          hasPersonalProfile,
          Boolean(input.packLight)
        ),
      },
      { role: "user", content: buildUserPrompt(input, retryContext) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Qwen 未返回内容，请稍后再试");
  }

  return parseTravelResponse(content);
}

export async function generateTravelPlan(
  input: GenerateTravelPlanInput
): Promise<TravelPlanAIResponse> {
  let retryContext: GenerateTravelPlanRetryContext | undefined;
  let lastResponse: TravelPlanAIResponse | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    let response: TravelPlanAIResponse;

    try {
      response = await callQwenTravelPlan(input, retryContext);
    } catch (error) {
      const errorName = error instanceof Error ? error.name : "UnknownError";
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      console.error("[generateTravelPlan] callQwenTravelPlan failed", {
        errorName,
        errorMessage,
        attempt,
      });

      const isVisibleIdError =
        error instanceof Error &&
        error.message === "AI 返回包含内部编号，请重新生成";

      if (isVisibleIdError && attempt === 0) {
        retryContext = { ...retryContext, visibleIds: true };
        continue;
      }
      throw error;
    }

    lastResponse = response;

    const resolvedDays = response.days.map((day) => ({
      ...day,
      selected_item_ids: resolveDaySelectedItemIds(day, input.closetItems),
    }));

    const hasValidDays = resolvedDays.some(
      (day) => day.selected_item_ids.length > 0
    );

    if (hasValidDays) {
      return {
        ...response,
        days: resolvedDays,
      };
    }

    if (attempt === 0) {
      retryContext = { ...retryContext, invalidIds: true };
    }
  }

  throw new Error(
    lastResponse ? "旅行规划结果无效，请稍后重试" : "生成旅行规划失败，请稍后重试"
  );
}
