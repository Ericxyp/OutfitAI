/**
 * 需求确认 Agent（受控工作流，不是开放式 Agent）：
 *
 *   用户输入 → 结构化提取（模型，失败降级关键词）→ Schema 校验
 *   → 结合已有位置 / 天气 / 衣橱补全 → 程序业务校验 → 判断是否追问
 *   → 用户补充 → 需求确认卡 → 用户确认 → 调用现有推荐工作流
 *
 * 本模块不直接访问数据库、身份或密钥：所需能力全部通过 deps 注入，
 * 由 Server Action 在验证登录用户后提供（测试中可完全 mock）。
 * 本模块不生成穿搭，最终推荐仍由 runOutfitWorkflow 完成。
 */
import {
  formatDateLabel,
  normalizeTimeZone,
  resolveDateExpression,
  todayRequirementDate,
  type DateResolution,
} from "@/lib/requirements/date";
import {
  combineModelAndKeywords,
  emptyExtraction,
  keywordExtract,
  mergeSemanticPreferences,
  type ExtractedFields,
} from "@/lib/requirements/extraction";
import {
  extractWithModel,
  type RequirementModelClient,
} from "@/lib/requirements/llm-extractor";
import {
  ACTIVITIES,
  ACTIVITY_LABELS,
  CLARIFIABLE_FIELDS,
  DURATION_LABELS,
  FORMALITY_LABELS,
  OCCASIONS,
  OCCASION_LABELS,
  REQUIREMENT_LIMITS,
  SPECIAL_REQUIREMENT_LABELS,
  isRecord,
  isSafeIdString,
  pickEnum,
  pickEnumArray,
  sanitizeShortText,
  type ClarifiableField,
  type CriticalField,
} from "@/lib/requirements/schema";
import { normalizeWeatherLocationInput } from "@/lib/weather-location";
import { sanitizeRequestText, sanitizeRequirement } from "@/lib/requirements/draft";

export { sanitizeRequirement } from "@/lib/requirements/draft";
import type {
  ClarificationQuestion,
  OutfitRequirement,
  RequirementAnalysisResult,
  RequirementAnswer,
  RequirementDate,
  RequirementLocation,
  RequirementWeatherPreview,
  RequirementWeatherStatus,
} from "@/types/requirement";
import type {
  GenerateRecommendationOptions,
  WeatherContext,
  WeatherLocationInput,
} from "@/types/weather";

// ---------------- 依赖注入 ----------------

export type WeatherForDateResult =
  | { status: "success"; weather: WeatherContext; displayName: string; query: string }
  | { status: "not_found" | "unavailable" | "invalid_input" | "out_of_range" };

export type ClosetItemRef = { id: string; name: string | null };

export type RequirementAgentDeps = {
  /** 为 null 时直接使用关键词解析（例如未配置模型 Key） */
  modelClient: RequirementModelClient | null;
  lookupWeather: (location: WeatherLocationInput, isoDate: string | null) => Promise<WeatherForDateResult>;
  /** 必须只返回当前登录用户自己的衣橱（由调用方按 user_id 查询） */
  loadClosetItems: () => Promise<ClosetItemRef[]>;
  now: () => Date;
};

export type AnalyzeRequirementInput = {
  /** 首轮的需求原文 */
  text?: unknown;
  /** 上一轮的需求草稿（来自客户端，必须重新校验） */
  previous?: unknown;
  /** 对追问的回答 */
  answer?: unknown;
  /** 上一轮追问的字段 */
  pendingFields?: unknown;
  /** 已追问的轮数 */
  round?: unknown;
  /** 用户选择跳过追问 */
  skipClarification?: unknown;
  /** 首页已有的天气位置（浏览器定位 / 手动城市） */
  contextLocation?: unknown;
  timeZone?: unknown;
};

export type AnalyzeTelemetry = {
  usedModel: boolean;
  usedFallback: boolean;
  fallbackReason: "model_unavailable" | "invalid_output" | "model_disabled" | null;
  modelAttempts: number;
};

export type AnalyzeRequirementOutput = {
  result: RequirementAnalysisResult;
  telemetry: AnalyzeTelemetry;
};

function parseAnswer(value: unknown): RequirementAnswer | null {
  if (!isRecord(value)) return null;
  if (value.kind === "option") {
    const field = pickEnum(value.field, CLARIFIABLE_FIELDS);
    const optionValue = sanitizeShortText(value.value, 30);
    return field && optionValue ? { kind: "option", field, value: optionValue } : null;
  }
  if (value.kind === "text") {
    const text = sanitizeRequestText(value.text, REQUIREMENT_LIMITS.answerTextMax);
    return text ? { kind: "text", text } : null;
  }
  return null;
}

// ---------------- 工作状态 ----------------

type LocationIssue =
  | { kind: "not_found"; name: string }
  | { kind: "city_unknown"; place: string }
  | { kind: "missing" };

type DateIssue = { kind: "past" | "too_far"; raw: string };

type WorkingState = {
  originalText: string;
  fields: ExtractedFields;
  date: RequirementDate | null;
  dateAssumed: boolean;
  dateIssue: DateIssue | null;
  location: RequirementLocation | null;
  locationIssue: LocationIssue | null;
  locationNeedsLookup: boolean;
  occasionConfidence: number;
  dateConfidence: number;
  locationConfidence: number;
  dislikedItemIds: string[];
  modelAmbiguous: ClarifiableField[];
};

function stateFromRequirement(req: OutfitRequirement): WorkingState {
  // 上一轮未解决的问题需要跨轮保留（草稿中以 ambiguousFields 表示）
  const unresolvedLocation =
    req.location?.source === "none" &&
    req.location.weatherStatus === "not_found" &&
    req.ambiguousFields.includes("location");
  const locationIssue: LocationIssue | null = unresolvedLocation
    ? req.location?.placeName
      ? { kind: "city_unknown", place: req.location.placeName }
      : { kind: "not_found", name: req.location?.displayName ?? "该地点" }
    : null;
  const dateIssue: DateIssue | null =
    req.date === null && req.ambiguousFields.includes("date") ? { kind: "past", raw: "该日期" } : null;

  const fields = emptyExtraction();
  fields.occasion = req.occasion;
  fields.activity = req.activity;
  fields.formality = req.formality;
  fields.duration = req.duration;
  fields.style = req.style;
  fields.dislikedStyles = req.dislikedStyles;
  fields.semanticPreferences = req.semanticPreferences;
  fields.specialRequirements = req.specialRequirements;
  fields.colorPreferences = req.colorPreferences;
  return {
    originalText: req.originalText,
    fields,
    date: req.date,
    dateAssumed: req.date?.raw === "未指定",
    dateIssue,
    location: unresolvedLocation ? null : req.location,
    locationIssue,
    locationNeedsLookup: Boolean(req.location?.weatherLocation),
    occasionConfidence: req.confidence.occasion,
    dateConfidence: req.confidence.date,
    locationConfidence: req.confidence.location,
    dislikedItemIds: req.dislikedItemIds,
    modelAmbiguous: [],
  };
}

function emptyState(originalText: string): WorkingState {
  return {
    originalText,
    fields: emptyExtraction(),
    date: null,
    dateAssumed: false,
    dateIssue: null,
    location: null,
    locationIssue: null,
    locationNeedsLookup: false,
    occasionConfidence: 0,
    dateConfidence: 0,
    locationConfidence: 0,
    dislikedItemIds: [],
    modelAmbiguous: [],
  };
}

function contextLocationToRequirement(location: WeatherLocationInput): RequirementLocation {
  return {
    source: location.type === "coordinates" ? "current_location" : "manual_city",
    displayName: location.type === "coordinates" ? "当前位置" : location.city,
    placeName: null,
    weatherLocation: location,
    weatherStatus: "unavailable",
  };
}

// ---------------- 应用新信息 ----------------

function applyDateResolution(state: WorkingState, resolution: DateResolution, confidence: number) {
  if (resolution.status === "ok") {
    state.date = resolution.date;
    state.dateAssumed = false;
    state.dateIssue = null;
    state.dateConfidence = confidence;
  } else if (resolution.status === "past" || resolution.status === "too_far") {
    state.date = null;
    state.dateAssumed = false;
    state.dateIssue = { kind: resolution.status, raw: resolution.raw };
    state.dateConfidence = 0;
  }
}

function applyFields(
  state: WorkingState,
  next: ExtractedFields,
  ctx: { now: Date; timeZone: string; sourceText: string; contextLocation: WeatherLocationInput | null; answeringLocation: boolean }
) {
  const f = state.fields;
  if (next.occasion) {
    f.occasion = next.occasion;
    state.occasionConfidence = next.confidence.occasion ?? 0.7;
  }
  if (next.activity) f.activity = next.activity;
  if (next.formality) f.formality = next.formality;
  if (next.duration) f.duration = next.duration;
  const union = <T>(a: T[], b: T[], max: number) => [...new Set([...a, ...b])].slice(0, max);
  f.style = union(f.style, next.style, REQUIREMENT_LIMITS.styleMax);
  f.dislikedStyles = union(f.dislikedStyles, next.dislikedStyles, REQUIREMENT_LIMITS.dislikedStyleMax);
  f.specialRequirements = union(f.specialRequirements, next.specialRequirements, REQUIREMENT_LIMITS.specialMax);
  f.colorPreferences = union(f.colorPreferences, next.colorPreferences, REQUIREMENT_LIMITS.colorMax);
  f.dislikedItemNames = union(f.dislikedItemNames, next.dislikedItemNames, REQUIREMENT_LIMITS.dislikedItemNameMax);
  f.semanticPreferences = mergeSemanticPreferences(f.semanticPreferences, next.semanticPreferences);
  state.modelAmbiguous = next.ambiguousFields;

  // 日期：模型只给原文片段，程序计算标准日期；模型片段无效时用关键词片段
  const dateResolution = resolveDateExpression(next.dateExpression, ctx.now, ctx.timeZone);
  if (dateResolution.status !== "none") {
    applyDateResolution(state, dateResolution, next.confidence.date ?? 0.9);
  } else {
    const fromText = resolveDateExpression(ctx.sourceText, ctx.now, ctx.timeZone);
    if (fromText.status !== "none") applyDateResolution(state, fromText, 0.8);
  }

  // 位置
  if (next.skipWeather) {
    state.location = {
      source: "none",
      displayName: "不考虑天气",
      placeName: next.place ?? state.location?.placeName ?? null,
      weatherLocation: null,
      weatherStatus: "skipped",
    };
    state.locationIssue = null;
    state.locationNeedsLookup = false;
    state.locationConfidence = 1;
    return;
  }

  if (next.city) {
    const place =
      next.place ??
      (state.locationIssue?.kind === "city_unknown"
        ? state.locationIssue.place
        : state.location?.placeName ?? null);
    state.location = {
      source: "text",
      displayName: place ? `${next.city} · ${place}` : next.city,
      placeName: place,
      weatherLocation: { type: "city", city: next.city },
      weatherStatus: "unavailable",
    };
    state.locationIssue = null;
    state.locationNeedsLookup = true;
    state.locationConfidence = next.confidence.location ?? 0.8;
    return;
  }

  if (next.place) {
    if (ctx.contextLocation) {
      state.location = { ...contextLocationToRequirement(ctx.contextLocation), placeName: next.place };
      state.locationIssue = null;
      state.locationNeedsLookup = true;
      state.locationConfidence = 0.6;
    } else {
      state.location = null;
      state.locationIssue = { kind: "city_unknown", place: next.place };
      state.locationConfidence = 0.2;
    }
  }
}

/** 选项答案：只接受白名单值，确定性地写入字段 */
function applyOptionAnswer(
  state: WorkingState,
  answer: Extract<RequirementAnswer, { kind: "option" }>,
  ctx: { now: Date; timeZone: string }
): boolean {
  switch (answer.field) {
    case "occasion": {
      const occasion = pickEnum(answer.value, OCCASIONS);
      if (!occasion) return false;
      state.fields.occasion = occasion;
      state.occasionConfidence = 1;
      return true;
    }
    case "activity": {
      const activity = pickEnum(answer.value, ACTIVITIES);
      if (!activity) return false;
      state.fields.activity = activity;
      return true;
    }
    case "date": {
      const expression = { today: "今天", tomorrow: "明天", day_after: "后天" }[answer.value];
      if (!expression) return false;
      applyDateResolution(state, resolveDateExpression(expression, ctx.now, ctx.timeZone), 1);
      return true;
    }
    case "location": {
      if (answer.value === "skip") {
        state.location = {
          source: "none",
          displayName: "不考虑天气",
          placeName: state.location?.placeName ?? null,
          weatherLocation: null,
          weatherStatus: "skipped",
        };
        state.locationIssue = null;
        state.locationNeedsLookup = false;
        state.locationConfidence = 1;
        return true;
      }
      const city = sanitizeShortText(answer.value, REQUIREMENT_LIMITS.shortTextMax);
      if (!city) return false;
      const place = state.locationIssue?.kind === "city_unknown" ? state.locationIssue.place : null;
      state.location = {
        source: "text",
        displayName: place ? `${city} · ${place}` : city,
        placeName: place,
        weatherLocation: { type: "city", city },
        weatherStatus: "unavailable",
      };
      state.locationIssue = null;
      state.locationNeedsLookup = true;
      state.locationConfidence = 0.9;
      return true;
    }
    default:
      return false;
  }
}

function matchDislikedItems(names: string[], closet: ClosetItemRef[]): string[] {
  if (names.length === 0) return [];
  const ids: string[] = [];
  for (const item of closet) {
    const itemName = item.name?.trim();
    if (!itemName) continue;
    if (names.some((name) => itemName.includes(name) || name.includes(itemName))) {
      ids.push(item.id);
    }
    if (ids.length >= REQUIREMENT_LIMITS.dislikedItemMax) break;
  }
  return ids;
}

// ---------------- 追问 ----------------

const SKIP_WEATHER_OPTION = { label: "不考虑天气，继续", value: "skip" };

export function buildQuestion(field: ClarifiableField, state: WorkingState): ClarificationQuestion {
  switch (field) {
    case "occasion":
      return {
        field,
        question: "这次主要是什么场合？",
        allowFreeText: true,
        options: (["commute", "date", "party", "outdoor_leisure", "sports", "daily"] as const).map((value) => ({
          field,
          value,
          label: OCCASION_LABELS[value],
        })),
      };
    case "activity":
      return {
        field,
        question: "主要是散步、运动、拍照还是约会？",
        allowFreeText: true,
        options: (["walking", "sports", "photography", "dating"] as const).map((value) => ({
          field,
          value,
          label: ACTIVITY_LABELS[value],
        })),
      };
    case "date": {
      const raw = state.dateIssue?.raw;
      return {
        field,
        question: raw
          ? state.dateIssue?.kind === "past"
            ? `「${raw}」已经过去了，想看哪天的穿搭？`
            : `「${raw}」太远了，暂时无法参考天气，想看哪天的穿搭？`
          : "是哪一天穿？",
        allowFreeText: true,
        options: [
          { field, value: "today", label: "今天" },
          { field, value: "tomorrow", label: "明天" },
          { field, value: "day_after", label: "后天" },
        ],
      };
    }
    case "location": {
      const issue = state.locationIssue;
      const question =
        issue?.kind === "not_found"
          ? `没有找到「${issue.name}」的天气，可以换个城市名，或不考虑天气继续。`
          : issue?.kind === "city_unknown"
            ? `「${issue.place}」在哪个城市？我会参考当地天气。`
            : "你会在哪个城市？我会参考当地天气。";
      return {
        field,
        question,
        allowFreeText: true,
        options: [{ field, ...SKIP_WEATHER_OPTION }],
      };
    }
  }
}

function collectIssues(state: WorkingState): ClarifiableField[] {
  const issues: ClarifiableField[] = [];
  const f = state.fields;
  if (state.locationIssue && state.locationIssue.kind !== "missing") issues.push("location");

  const hasSignal = f.style.length > 0 || f.activity !== null || f.formality !== null || f.dislikedStyles.length > 0;
  const occasionWeak = f.occasion === null ? !hasSignal : state.occasionConfidence < 0.5;
  if (occasionWeak || (f.occasion === null && state.modelAmbiguous.includes("occasion"))) {
    issues.push("occasion");
  }

  if (state.dateIssue) issues.push("date");
  if (!state.location && (!state.locationIssue || state.locationIssue.kind === "missing")) issues.push("location");

  const activityMatters = f.occasion === "outdoor_leisure" && f.activity === null;
  if (activityMatters || (state.modelAmbiguous.includes("activity") && f.activity === null)) {
    issues.push("activity");
  }

  return [...new Set(issues)];
}

// ---------------- 天气 ----------------

const WEATHER_NOTES: Record<Exclude<RequirementWeatherStatus, "available">, string> = {
  unavailable: "暂时无法获取天气，将不考虑实时天气。你可以继续生成，或修改位置。",
  not_found: "未能识别该地点，将不考虑实时天气。",
  out_of_range: "该日期超出天气预报范围，将不考虑实时天气。",
  skipped: "已选择不考虑天气。",
};

async function resolveWeather(
  state: WorkingState,
  deps: RequirementAgentDeps
): Promise<RequirementWeatherPreview> {
  const location = state.location;
  if (!location || !location.weatherLocation || location.weatherStatus === "skipped") {
    return {
      status: location?.weatherStatus === "skipped" ? "skipped" : "unavailable",
      summary: null,
      note: location?.weatherStatus === "skipped" ? WEATHER_NOTES.skipped : "未提供位置，将不考虑实时天气。",
    };
  }

  const date = state.date;
  if (date && date.offsetDays > 2) {
    location.weatherStatus = "out_of_range";
    return { status: "out_of_range", summary: null, note: WEATHER_NOTES.out_of_range };
  }

  let result: WeatherForDateResult;
  try {
    result = await deps.lookupWeather(location.weatherLocation, date && date.offsetDays > 0 ? date.iso : null);
  } catch {
    result = { status: "unavailable" };
  }

  if (result.status === "success") {
    location.weatherStatus = "available";
    if (location.weatherLocation.type === "city") {
      // 使用验证通过的查询串，保证最终推荐能查到同一地点
      location.weatherLocation = { type: "city", city: result.query };
    }
    if (location.source !== "text" || !location.placeName) {
      location.displayName = location.placeName
        ? `${result.displayName} · ${location.placeName}`
        : result.displayName;
    }
    return {
      status: "available",
      summary: {
        locationName: result.weather.locationName,
        temperatureC: result.weather.temperatureC,
        condition: result.weather.condition,
      },
      note: null,
    };
  }

  if (result.status === "not_found" || result.status === "invalid_input") {
    const name =
      location.weatherLocation.type === "city" ? location.weatherLocation.city : location.displayName;
    state.location = null;
    state.locationIssue = { kind: "not_found", name };
    state.locationConfidence = 0;
    return { status: "not_found", summary: null, note: WEATHER_NOTES.not_found };
  }

  const status = result.status === "out_of_range" ? "out_of_range" : "unavailable";
  location.weatherStatus = status;
  return { status, summary: null, note: WEATHER_NOTES[status] };
}

// ---------------- 汇总 ----------------

function finalizeRequirement(
  state: WorkingState,
  ctx: { now: Date; timeZone: string },
  options: { applyAssumptions: boolean; unresolved: ClarifiableField[] }
): OutfitRequirement {
  const assumptions: string[] = [];
  const missing: CriticalField[] = [];
  const f = state.fields;

  if (!f.occasion) missing.push("occasion");
  if (!state.date || state.dateAssumed) missing.push("date");
  if (!state.location || state.location.source === "none") {
    if (!state.location) missing.push("location");
  }

  const keepDateOpen = !options.applyAssumptions && state.dateIssue !== null;
  if (!state.date && !keepDateOpen) {
    state.date = todayRequirementDate(ctx.now, ctx.timeZone);
    state.dateAssumed = true;
    state.dateConfidence = 0.5;
    if (state.dateIssue) {
      assumptions.push("原日期无效，按今天理解");
      state.dateIssue = null;
    }
  }
  if (state.date && state.dateAssumed && !assumptions.length) assumptions.push("未指定日期，按今天理解");

  if (options.applyAssumptions) {
    if (!f.occasion) {
      f.occasion = "daily";
      state.occasionConfidence = 0.3;
      assumptions.push("场景按日常出门理解");
    }
    if (!state.location) {
      state.location = {
        source: "none",
        displayName: "未指定",
        placeName: state.locationIssue && state.locationIssue.kind === "city_unknown" ? state.locationIssue.place : null,
        weatherLocation: null,
        weatherStatus: state.locationIssue?.kind === "not_found" ? "not_found" : "skipped",
      };
      assumptions.push("未提供可识别的位置，将不考虑实时天气");
    }
    if (options.unresolved.includes("activity") && !f.activity) {
      assumptions.push("未指定具体活动，按通用出行搭配");
    }
  } else if (state.locationIssue && state.locationIssue.kind !== "missing" && !state.location) {
    // 保留未解决的地点，下一轮继续追问
    const issue = state.locationIssue;
    state.location = {
      source: "none",
      displayName: issue.kind === "not_found" ? issue.name : issue.place,
      placeName: issue.kind === "city_unknown" ? issue.place : null,
      weatherLocation: null,
      weatherStatus: "not_found",
    };
  }
  if (!options.applyAssumptions && !f.occasion && (f.style.length > 0 || f.activity || f.formality || f.dislikedStyles.length > 0)) {
    f.occasion = "daily";
    state.occasionConfidence = 0.4;
    assumptions.push("场景按日常出门理解");
  }

  if (state.location?.source === "current_location" || state.location?.source === "manual_city") {
    assumptions.push(`地点使用首页已选位置：${state.location.displayName}`);
  }

  return {
    version: 1,
    originalText: state.originalText,
    occasion: f.occasion,
    location: state.location,
    date: state.date,
    style: f.style,
    formality: f.formality,
    activity: f.activity,
    duration: f.duration,
    specialRequirements: f.specialRequirements,
    colorPreferences: f.colorPreferences,
    dislikedStyles: f.dislikedStyles,
    semanticPreferences: f.semanticPreferences,
    dislikedItemIds: state.dislikedItemIds,
    assumptions: assumptions
      .map((text) => text.slice(0, REQUIREMENT_LIMITS.assumptionTextMax))
      .slice(0, REQUIREMENT_LIMITS.assumptionMax),
    confidence: {
      occasion: state.occasionConfidence,
      date: state.dateConfidence,
      location: state.locationConfidence,
    },
    missingCriticalFields: missing,
    ambiguousFields: options.unresolved,
  };
}

function summarizeForModel(req: OutfitRequirement): string {
  const parts: string[] = [];
  if (req.occasion) parts.push(`场景=${OCCASION_LABELS[req.occasion]}`);
  if (req.date && !req.missingCriticalFields.includes("date")) parts.push(`日期=${formatDateLabel(req.date)}`);
  if (req.location && req.location.source !== "none") parts.push(`地点=${req.location.displayName}`);
  if (req.activity) parts.push(`活动=${ACTIVITY_LABELS[req.activity]}`);
  if (req.style.length) parts.push(`风格=${req.style.join("、")}`);
  return parts.join("；");
}

async function extractFields(
  text: string,
  context: { answeringFields?: ClarifiableField[]; previousSummary?: string },
  deps: RequirementAgentDeps,
  telemetry: AnalyzeTelemetry
): Promise<ExtractedFields> {
  const keywords = keywordExtract(text);
  if (!deps.modelClient) {
    telemetry.usedFallback = true;
    telemetry.fallbackReason = "model_disabled";
    return keywords;
  }
  telemetry.usedModel = true;
  const model = await extractWithModel(text, context, deps.modelClient);
  telemetry.modelAttempts += model.attempts;
  if (model.ok) return combineModelAndKeywords(model.value, keywords);
  telemetry.usedFallback = true;
  telemetry.fallbackReason = model.errorType;
  return keywords;
}

/**
 * 需求分析主流程：解析 → 校验 → 补全 → 判断是否追问。
 * 不会调用最终推荐生成。
 */
export async function analyzeRequirement(
  input: AnalyzeRequirementInput,
  deps: RequirementAgentDeps
): Promise<AnalyzeRequirementOutput> {
  const telemetry: AnalyzeTelemetry = {
    usedModel: false,
    usedFallback: false,
    fallbackReason: null,
    modelAttempts: 0,
  };
  const now = deps.now();
  const timeZone = normalizeTimeZone(input.timeZone);
  const ctx = { now, timeZone };
  const round = Math.max(
    0,
    Math.min(REQUIREMENT_LIMITS.maxClarificationRounds, typeof input.round === "number" && Number.isInteger(input.round) ? input.round : 0)
  );
  const contextLocation =
    input.contextLocation === null || input.contextLocation === undefined
      ? null
      : normalizeWeatherLocationInput(input.contextLocation);
  const pendingFields = pickEnumArray(input.pendingFields, CLARIFIABLE_FIELDS, CLARIFIABLE_FIELDS.length);

  let closet: ClosetItemRef[] = [];
  try {
    closet = (await deps.loadClosetItems()).filter((item) => isSafeIdString(item.id));
  } catch {
    closet = [];
  }
  const closetIds = new Set(closet.map((item) => item.id));

  let state: WorkingState;
  let sourceText: string;

  if (input.previous !== undefined && input.previous !== null) {
    const sanitized = sanitizeRequirement(input.previous, { now, timeZone, closetItemIds: closetIds });
    if (!sanitized) {
      return {
        telemetry,
        result: { status: "error", errorType: "invalid_input", message: "需求草稿已失效，请重新描述你的穿搭需求。" },
      };
    }
    state = stateFromRequirement(sanitized.requirement);
    if (sanitized.dateExpired) state.dateIssue = { kind: "past", raw: "原日期" };

    const answer = parseAnswer(input.answer);
    if (answer?.kind === "option") {
      if (!applyOptionAnswer(state, answer, ctx)) {
        return {
          telemetry,
          result: { status: "error", errorType: "invalid_input", message: "这个选项无效，请重新选择或直接输入。" },
        };
      }
      sourceText = "";
    } else if (answer?.kind === "text") {
      sourceText = answer.text;
      state.originalText = `${state.originalText}；补充：${answer.text}`.slice(0, REQUIREMENT_LIMITS.requestTextMax);
      const next = await extractFields(
        answer.text,
        { answeringFields: pendingFields, previousSummary: summarizeForModel(sanitized.requirement) },
        deps,
        telemetry
      );
      // 正在回答位置问题、且只给了一个城市名：直接当作城市
      const answeringLocation = pendingFields.includes("location");
      const answerHasOtherInfo =
        next.occasion !== null ||
        next.activity !== null ||
        next.formality !== null ||
        next.dateExpression !== null ||
        next.style.length > 0 ||
        next.dislikedStyles.length > 0;
      if (answeringLocation && !next.city && !next.place && !next.skipWeather && !answerHasOtherInfo) {
        const asCity = sanitizeShortText(answer.text.replace(/^(在|去|到)/, "").replace(/(市)?$/, ""), REQUIREMENT_LIMITS.shortTextMax);
        if (asCity && asCity.length <= 12 && !/[，,。\s]/.test(asCity)) {
          next.city = asCity;
          next.confidence.location = 0.8;
        }
      }
      applyFields(state, next, { ...ctx, sourceText, contextLocation, answeringLocation });
      state.dislikedItemIds = [
        ...new Set([...state.dislikedItemIds, ...matchDislikedItems(next.dislikedItemNames, closet)]),
      ].slice(0, REQUIREMENT_LIMITS.dislikedItemMax);
    } else if (input.skipClarification !== true) {
      return {
        telemetry,
        result: { status: "error", errorType: "invalid_input", message: "请回答问题，或直接确认当前理解。" },
      };
    }
  } else {
    const text = sanitizeRequestText(input.text);
    if (!text) {
      return {
        telemetry,
        result: { status: "error", errorType: "invalid_input", message: "请描述你的穿搭需求。" },
      };
    }
    sourceText = text;
    state = emptyState(text);
    const fields = await extractFields(text, {}, deps, telemetry);
    applyFields(state, fields, { ...ctx, sourceText: text, contextLocation, answeringLocation: false });
    state.dislikedItemIds = matchDislikedItems(fields.dislikedItemNames, closet);
  }

  // 文本没有位置时使用首页已选位置（浏览器定位 / 手动城市），不重复询问
  if (!state.location && !state.locationIssue && contextLocation) {
    state.location = contextLocationToRequirement(contextLocation);
    state.locationNeedsLookup = true;
    state.locationConfidence = 0.8;
  }

  const weather = await resolveWeather(state, deps);

  const issues = collectIssues(state);
  const canAsk = issues.length > 0 && round < REQUIREMENT_LIMITS.maxClarificationRounds && input.skipClarification !== true;

  if (canAsk) {
    const askFields = issues.slice(0, REQUIREMENT_LIMITS.maxQuestionsPerRound);
    const requirement = finalizeRequirement(state, ctx, { applyAssumptions: false, unresolved: askFields });
    return {
      telemetry,
      result: {
        status: "needs_clarification",
        requirement,
        questions: askFields.map((field) => buildQuestion(field, state)),
        round: round + 1,
        weather,
        usedFallback: telemetry.usedFallback,
      },
    };
  }

  const requirement = finalizeRequirement(state, ctx, { applyAssumptions: true, unresolved: issues });
  const finalWeather =
    requirement.location?.source === "none"
      ? {
          status: requirement.location.weatherStatus,
          summary: null,
          note:
            requirement.location.weatherStatus === "skipped" && state.locationIssue === null && weather.status === "skipped"
              ? WEATHER_NOTES.skipped
              : "将不考虑实时天气。",
        }
      : weather;

  return {
    telemetry,
    result: {
      status: "ready_for_confirmation",
      requirement,
      round,
      weather: finalWeather,
      usedFallback: telemetry.usedFallback,
    },
  };
}

// ---------------- 确认后：映射到现有推荐工作流 ----------------

export type GenerationRequest = {
  requestText: string;
  options: GenerateRecommendationOptions;
};

/**
 * 把已确认的结构化需求转换为现有工作流参数：
 * - requestText：原文 + 正向结构化字段（含 rule-engine 关键词，提升规则召回命中）；
 * - requirementNotes：不喜欢的风格 / 特殊需求 / 系统假设，只进入最终提示词；
 * - location / targetDate：复用天气模块；
 * - excludeClosetItemIds：已在服务端按当前用户衣橱校验。
 */
export function buildGenerationRequest(req: OutfitRequirement): GenerationRequest {
  const lines: string[] = [];
  if (req.occasion) lines.push(`场景：${OCCASION_LABELS[req.occasion]}`);
  if (req.date) lines.push(`日期：${formatDateLabel(req.date)}`);
  if (req.location && req.location.source !== "none") lines.push(`地点：${req.location.displayName}`);
  if (req.activity) lines.push(`活动：${ACTIVITY_LABELS[req.activity]}`);
  if (req.style.length) lines.push(`风格：${req.style.join("、")}`);
  if (req.formality) lines.push(`正式程度：${FORMALITY_LABELS[req.formality]}`);
  if (req.duration) lines.push(`时长：${DURATION_LABELS[req.duration]}`);

  const notes: string[] = [];
  if (req.dislikedStyles.length) notes.push(`避免：${req.dislikedStyles.join("、")}`);
  // 长尾偏好只作为补充语义进入提示词，不拼入参与规则关键词匹配的 requestText
  if (req.semanticPreferences.length) notes.push(`其他偏好：${req.semanticPreferences.join("、")}`);
  if (req.specialRequirements.length) {
    notes.push(`特殊需求：${req.specialRequirements.map((s) => SPECIAL_REQUIREMENT_LABELS[s]).join("、")}`);
  }
  if (req.colorPreferences.length) notes.push(`颜色偏好：${req.colorPreferences.join("、")}`);
  if (req.dislikedItemIds.length) notes.push("用户明确不想穿部分单品，已从候选中排除");
  if (req.assumptions.length) notes.push(`系统假设：${req.assumptions.join("；")}`);

  const useLocation =
    req.location?.weatherLocation &&
    (req.location.weatherStatus === "available" || req.location.weatherStatus === "unavailable");

  const options: GenerateRecommendationOptions = {};
  if (useLocation && req.location?.weatherLocation) {
    options.location = req.location.weatherLocation;
    if (req.date && req.date.offsetDays > 0) options.targetDate = req.date.iso;
  }
  if (req.dislikedItemIds.length) options.excludeClosetItemIds = [...req.dislikedItemIds];
  if (notes.length) options.requirementNotes = notes.join("\n");

  // 精确自定义标签匹配只读取已解析的结构化字段（不对整段原文做模糊匹配）
  const occasionTerms = [
    ...(req.occasion ? [OCCASION_LABELS[req.occasion]] : []),
    ...(req.activity ? [ACTIVITY_LABELS[req.activity]] : []),
    ...req.semanticPreferences,
  ];
  const styleTerms = [...req.style, ...req.semanticPreferences];
  if (occasionTerms.length || styleTerms.length) {
    options.requirementTerms = { occasions: occasionTerms, styles: styleTerms };
  }

  return {
    requestText: `${req.originalText}\n\n已确认需求：${lines.join("；")}`,
    options,
  };
}

export type ConfirmRequirementOutcome =
  | { status: "valid"; requirement: OutfitRequirement; generation: GenerationRequest }
  | { status: "invalid"; reason: "invalid_draft" | "date_expired" | "missing_fields"; message: string };

/** 确认前的最终业务校验（不调用模型） */
export async function validateRequirementForGeneration(
  rawRequirement: unknown,
  input: { timeZone?: unknown },
  deps: Pick<RequirementAgentDeps, "loadClosetItems" | "now">
): Promise<ConfirmRequirementOutcome> {
  const now = deps.now();
  const timeZone = normalizeTimeZone(input.timeZone);
  let closetIds = new Set<string>();
  try {
    closetIds = new Set((await deps.loadClosetItems()).map((item) => item.id));
  } catch {
    closetIds = new Set();
  }
  const sanitized = sanitizeRequirement(rawRequirement, { now, timeZone, closetItemIds: closetIds });
  if (!sanitized) {
    return { status: "invalid", reason: "invalid_draft", message: "需求草稿已失效，请重新描述你的穿搭需求。" };
  }
  if (sanitized.dateExpired) {
    return { status: "invalid", reason: "date_expired", message: "需求中的日期已经过去，请修改需求。" };
  }
  const req = sanitized.requirement;
  if (!req.occasion || !req.date || !req.location) {
    return { status: "invalid", reason: "missing_fields", message: "需求还不完整，请补充后再确认。" };
  }
  return { status: "valid", requirement: req, generation: buildGenerationRequest(req) };
}

/**
 * 确认并生成：先做最终业务校验，校验通过才调用注入的现有推荐工作流。
 * Server Action 中 runWorkflow = runOutfitWorkflow（不复制推荐工作流）。
 */
export async function confirmRequirement<T>(
  rawRequirement: unknown,
  input: { timeZone?: unknown },
  deps: Pick<RequirementAgentDeps, "loadClosetItems" | "now"> & {
    runWorkflow: (generation: GenerationRequest, requirement: OutfitRequirement) => Promise<T>;
  }
): Promise<
  | { status: "generated"; requirement: OutfitRequirement; generation: GenerationRequest; result: T }
  | Extract<ConfirmRequirementOutcome, { status: "invalid" }>
> {
  const outcome = await validateRequirementForGeneration(rawRequirement, input, deps);
  if (outcome.status === "invalid") return outcome;
  const result = await deps.runWorkflow(outcome.generation, outcome.requirement);
  return { status: "generated", requirement: outcome.requirement, generation: outcome.generation, result };
}
