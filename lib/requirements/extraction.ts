/**
 * 需求字段提取（纯函数）：
 * - validateModelExtraction：模型 JSON 输出的运行时 Schema 校验
 * - keywordExtract：模型不可用时的确定性关键词解析降级
 *
 * 两者输出同一结构 ExtractedFields，后续合并 / 业务校验逻辑共用。
 */
import { CHINESE_CITY_ALIASES } from "@/lib/weather-location";
import {
  findKnownCustomPhrases,
  mapPhraseToRequirementOccasion,
  validateCustomTag,
} from "@/lib/closet/custom-tags";
import {
  ACTIVITIES,
  CLARIFIABLE_FIELDS,
  DISLIKED_STYLE_VOCAB,
  DURATIONS,
  FORMALITIES,
  OCCASIONS,
  REQUIREMENT_LIMITS,
  SPECIAL_REQUIREMENTS,
  STYLE_VOCAB,
  clampConfidence,
  isRecord,
  isValidCityText,
  pickEnum,
  pickEnumArray,
  pickTextArray,
  sanitizeShortText,
  type Activity,
  type ClarifiableField,
  type CriticalField,
  type DislikedStyle,
  type Duration,
  type Formality,
  type Occasion,
  type SpecialRequirement,
  type StyleTag,
} from "@/lib/requirements/schema";

export type ExtractedFields = {
  occasion: Occasion | null;
  activity: Activity | null;
  formality: Formality | null;
  duration: Duration | null;
  /** 用户原文中的日期表达，由程序解析为标准日期 */
  dateExpression: string | null;
  /** 具体地点（如 朝阳公园） */
  place: string | null;
  /** 可用于天气查询的城市 */
  city: string | null;
  style: StyleTag[];
  dislikedStyles: DislikedStyle[];
  specialRequirements: SpecialRequirement[];
  colorPreferences: string[];
  /** 用户明确不想穿的衣物名称（由服务端匹配到当前用户衣橱后才变成 ID） */
  dislikedItemNames: string[];
  /** 长尾语义偏好（保留原词，经过与衣物自定义标签相同的校验） */
  semanticPreferences: string[];
  /** 用户表示不考虑天气 */
  skipWeather: boolean;
  confidence: Partial<Record<CriticalField, number>>;
  ambiguousFields: ClarifiableField[];
};

export function emptyExtraction(): ExtractedFields {
  return {
    occasion: null,
    activity: null,
    formality: null,
    duration: null,
    dateExpression: null,
    place: null,
    city: null,
    style: [],
    dislikedStyles: [],
    specialRequirements: [],
    colorPreferences: [],
    dislikedItemNames: [],
    semanticPreferences: [],
    skipWeather: false,
    confidence: {},
    ambiguousFields: [],
  };
}

// ---------------- 模型输出 Schema ----------------

/** 提供给模型的 JSON 结构说明（与 validateModelExtraction 一一对应） */
export const MODEL_EXTRACTION_SCHEMA_TEXT = `{
  "occasion": ${OCCASIONS.map((v) => `"${v}"`).join(" | ")} | null,
  "activity": ${ACTIVITIES.map((v) => `"${v}"`).join(" | ")} | null,
  "formality": ${FORMALITIES.map((v) => `"${v}"`).join(" | ")} | null,
  "duration": ${DURATIONS.map((v) => `"${v}"`).join(" | ")} | null,
  "date_expression": string | null,
  "place": string | null,
  "city": string | null,
  "style": string[],            // 只能取自：${STYLE_VOCAB.join("、")}
  "disliked_styles": string[],  // 只能取自：${DISLIKED_STYLE_VOCAB.join("、")}
  "special_requirements": string[], // 只能取自：${SPECIAL_REQUIREMENTS.join(", ")}
  "color_preferences": string[],
  "disliked_item_names": string[],
  "semantic_preferences": string[], // 可选：无法归入上述枚举的风格 / 场景原词，如“法式松弛感”“音乐节”，每个 2~12 字
  "skip_weather": boolean,
  "confidence": { "occasion": number, "date": number, "location": number },
  "ambiguous_fields": string[]  // 只能取自：${CLARIFIABLE_FIELDS.join(", ")}
}`;

const REQUIRED_MODEL_KEYS = [
  "occasion",
  "date_expression",
  "city",
  "style",
  "confidence",
  "ambiguous_fields",
] as const;

export type ModelValidationResult =
  | { ok: true; value: ExtractedFields }
  | { ok: false; error: string };

function isStringOrNull(value: unknown): boolean {
  return value === null || value === undefined || typeof value === "string";
}

function isArrayOrMissing(value: unknown): boolean {
  return value === undefined || Array.isArray(value);
}

/** 从模型原始文本中解析 JSON（允许 ```json 代码块包裹） */
export function parseModelJson(content: string): unknown {
  if (content.length > REQUIREMENT_LIMITS.modelResponseMax) {
    throw new Error("response_too_large");
  }
  const trimmed = content.trim();
  const jsonText = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;
  return JSON.parse(jsonText);
}

/**
 * 模型输出运行时校验。
 * 结构错误（非对象、缺少必需键、类型错误）视为失败，触发一次修复重试；
 * 枚举外的值会被丢弃（而不是透传），自由文本会被清洗和截断。
 */
export function validateModelExtraction(raw: unknown): ModelValidationResult {
  if (!isRecord(raw)) return { ok: false, error: "not_object" };

  for (const key of REQUIRED_MODEL_KEYS) {
    if (!(key in raw)) return { ok: false, error: `missing_${key}` };
  }

  const stringKeys = ["occasion", "activity", "formality", "duration", "date_expression", "place", "city"];
  for (const key of stringKeys) {
    if (!isStringOrNull(raw[key])) return { ok: false, error: `invalid_${key}` };
  }
  const arrayKeys = [
    "style",
    "disliked_styles",
    "special_requirements",
    "color_preferences",
    "disliked_item_names",
    "semantic_preferences",
    "ambiguous_fields",
  ];
  for (const key of arrayKeys) {
    if (!isArrayOrMissing(raw[key])) return { ok: false, error: `invalid_${key}` };
  }
  if (!isRecord(raw.confidence)) return { ok: false, error: "invalid_confidence" };
  if (raw.skip_weather !== undefined && typeof raw.skip_weather !== "boolean") {
    return { ok: false, error: "invalid_skip_weather" };
  }

  // 城市必须原样通过城市校验（含控制字符 / 换行 / 超长直接丢弃，而不是清洗后继续使用）
  const city =
    typeof raw.city === "string" &&
    raw.city.trim().length <= REQUIREMENT_LIMITS.shortTextMax &&
    isValidCityText(raw.city)
      ? sanitizeShortText(raw.city, REQUIREMENT_LIMITS.shortTextMax)
      : null;
  const confidence: Partial<Record<CriticalField, number>> = {};
  for (const field of ["occasion", "date", "location"] as const) {
    const value = clampConfidence(raw.confidence[field]);
    if (value !== null) confidence[field] = value;
  }

  return {
    ok: true,
    value: {
      occasion: pickEnum(raw.occasion, OCCASIONS),
      activity: pickEnum(raw.activity, ACTIVITIES),
      formality: pickEnum(raw.formality, FORMALITIES),
      duration: pickEnum(raw.duration, DURATIONS),
      dateExpression: sanitizeShortText(raw.date_expression, REQUIREMENT_LIMITS.dateRawMax),
      place: sanitizeShortText(raw.place, REQUIREMENT_LIMITS.placeNameMax),
      city,
      style: pickEnumArray(raw.style, STYLE_VOCAB, REQUIREMENT_LIMITS.styleMax),
      dislikedStyles: pickEnumArray(raw.disliked_styles, DISLIKED_STYLE_VOCAB, REQUIREMENT_LIMITS.dislikedStyleMax),
      specialRequirements: pickEnumArray(raw.special_requirements, SPECIAL_REQUIREMENTS, REQUIREMENT_LIMITS.specialMax),
      colorPreferences: pickTextArray(raw.color_preferences, REQUIREMENT_LIMITS.colorMax, 8),
      dislikedItemNames: pickTextArray(raw.disliked_item_names, REQUIREMENT_LIMITS.dislikedItemNameMax, REQUIREMENT_LIMITS.shortTextMax),
      semanticPreferences: sanitizeSemanticPreferences(raw.semantic_preferences),
      skipWeather: raw.skip_weather === true,
      confidence,
      ambiguousFields: pickEnumArray(raw.ambiguous_fields, CLARIFIABLE_FIELDS, CLARIFIABLE_FIELDS.length),
    },
  };
}

// ---------------- 长尾语义偏好 ----------------

/** 与衣物自定义标签同一套校验（长度、URL、指令文本等），并去掉被更长表达包含的短词 */
export function sanitizeSemanticPreferences(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const result: string[] = [];
  for (const value of raw.slice(0, 20)) {
    const validated = validateCustomTag(value);
    if (validated.ok && !result.includes(validated.tag)) result.push(validated.tag);
  }
  return mergeSemanticPreferences([], result);
}

export function mergeSemanticPreferences(base: string[], next: string[]): string[] {
  const all = [...base, ...next].filter((tag, index, list) => list.indexOf(tag) === index);
  return all
    .filter((tag) => !all.some((other) => other !== tag && other.includes(tag)))
    .slice(0, REQUIREMENT_LIMITS.semanticPreferenceMax);
}

/** 关键词降级：别名表收录的长尾表达 + “有点X感 / X风”句式 */
export function extractSemanticPreferences(text: string): string[] {
  const phrases = [...findKnownCustomPhrases(text)];
  for (const match of text.matchAll(/(?:有点|一点|带点|想要|偏向|走)([\u4e00-\u9fa5A-Za-z]{2,10}?(?:感|风))/g)) {
    phrases.push(match[1]);
  }
  return sanitizeSemanticPreferences(phrases);
}

// ---------------- 确定性关键词解析 ----------------

const OCCASION_RULES: Array<{ pattern: RegExp; occasion: Occasion }> = [
  { pattern: /面试/, occasion: "interview" },
  { pattern: /婚礼|典礼|颁奖|晚宴|年会|毕业典礼/, occasion: "formal_event" },
  { pattern: /商务|开会|会议|见客户|谈判|汇报|路演/, occasion: "business" },
  { pattern: /上班|通勤|办公室|职场|坐班|上学|上课/, occasion: "commute" },
  { pattern: /约会|相亲|见对象|男朋友|女朋友|男友|女友/, occasion: "date" },
  { pattern: /聚会|派对|生日会|聚餐|轰趴|蹦迪/, occasion: "party" },
  { pattern: /运动|健身|跑步|徒步|爬山|登山|骑行|打球|瑜伽|羽毛球|网球|球赛/, occasion: "sports" },
  { pattern: /旅行|旅游|出游|度假/, occasion: "travel" },
  { pattern: /逛街|商场|购物/, occasion: "shopping" },
  { pattern: /公园|郊游|野餐|露营|散步|遛弯|户外|海边|爬山|景点|赏花/, occasion: "outdoor_leisure" },
  { pattern: /日常|周末|咖啡|平时|买菜|随便穿|居家|看展|看电影/, occasion: "daily" },
];

const ACTIVITY_RULES: Array<{ pattern: RegExp; activity: Activity }> = [
  { pattern: /拍照|拍摄|出片|写真/, activity: "photography" },
  { pattern: /散步|遛弯|走走|逛公园/, activity: "walking" },
  { pattern: /运动|健身|跑步|爬山|骑行|打球|瑜伽|徒步|羽毛球|网球/, activity: "sports" },
  { pattern: /约会/, activity: "dating" },
  { pattern: /吃饭|聚餐|晚餐|午餐|火锅|餐厅|烧烤/, activity: "dining" },
  { pattern: /上班|工作|开会|办公/, activity: "working" },
  { pattern: /逛街|购物|商场/, activity: "shopping" },
  { pattern: /游览|景点|参观|看展|博物馆/, activity: "sightseeing" },
  { pattern: /聚会|派对/, activity: "party" },
];

const STYLE_SYNONYMS: Array<{ pattern: RegExp; styles: StyleTag[]; disliked?: DislikedStyle[] }> = [
  {
    pattern: /(别|不要|不想|不能)(太|那么|过于)?(花|花哨|花里胡哨|艳|鲜艳|张扬)|素一点|素净|朴素/,
    styles: ["简约", "低饱和", "少图案"],
    disliked: ["花哨", "高饱和", "大面积图案"],
  },
  { pattern: /简单|简洁|干净利落|极简/, styles: ["简约"] },
  { pattern: /低调/, styles: ["简约", "低饱和"] },
  { pattern: /(别|不要|不想|不用)(太|那么|过于)?正式/, styles: ["休闲"], disliked: ["过于正式"] },
  { pattern: /(别|不要|不想)(太|那么|过于)?(休闲|随意)/, styles: ["精致"], disliked: ["过于休闲"] },
  { pattern: /(别|不要|不想)(太|那么)?(紧|紧身)/, styles: ["舒适"], disliked: ["紧身"] },
  { pattern: /可爱/, styles: ["甜美"] },
  { pattern: /帅气|很帅|帅一点/, styles: ["酷"] },
  { pattern: /鲜艳一点|亮一点|亮色|明亮/, styles: ["亮色"] },
  { pattern: /舒服/, styles: ["舒适"] },
];

const SPECIAL_RULES: Array<{ pattern: RegExp; value: SpecialRequirement }> = [
  { pattern: /保暖|降温|怕冷|暖和|很冷/, value: "warm" },
  { pattern: /下雨|雨天|防雨|带伞|有雨/, value: "rain_proof" },
  { pattern: /防晒|暴晒|太阳大|紫外线/, value: "sun_protection" },
  { pattern: /透气|怕热|出汗|闷热/, value: "breathable" },
  { pattern: /走很多路|走路多|好走|走一天|平底鞋/, value: "comfortable_shoes" },
  { pattern: /耐脏|怕脏/, value: "stain_resistant" },
  { pattern: /方便活动|好活动|方便蹲|活动方便/, value: "easy_movement" },
];

/** 常见地标 → 城市（用于“朝阳公园”这类不含城市名的地点） */
export const LANDMARK_CITY_MAP: Record<string, string> = {
  朝阳公园: "北京",
  故宫: "北京",
  天安门: "北京",
  三里屯: "北京",
  颐和园: "北京",
  国贸: "北京",
  外滩: "上海",
  陆家嘴: "上海",
  新天地: "上海",
  西湖: "杭州",
  宽窄巷子: "成都",
  春熙路: "成都",
  解放碑: "重庆",
  维多利亚港: "香港",
  鼓浪屿: "厦门",
  悉尼歌剧院: "悉尼",
  邦迪海滩: "悉尼",
};

const NON_PLACE_WORDS = /^(上班|公司|学校|外面|出去|家|家里|那边|这边|哪|哪里|附近|楼下|单位|玩|逛街|散步|约会|吃饭|开会|面试|运动|健身|旅行|旅游)$/;
const CLOTHING_WORDS = /衬衫|T恤|t恤|裤|裙|外套|夹克|卫衣|毛衣|鞋|靴|大衣|西装|背心|针织|风衣|羽绒|衬衣|马甲|帽/;
const COLOR_WORDS = "黑|白|灰|米|蓝|红|绿|黄|粉|紫|棕|咖|卡其|藏青|杏|驼";

function findKnownCity(text: string): string | null {
  const names = Object.keys(CHINESE_CITY_ALIASES).sort((a, b) => b.length - a.length);
  for (const name of names) {
    if (text.includes(name)) return name;
  }
  const englishNames = Object.values(CHINESE_CITY_ALIASES);
  for (const name of englishNames) {
    if (new RegExp(`\\b${name.replace(/\s/g, "\\s")}\\b`, "i").test(text)) return name;
  }
  return null;
}

function findLandmark(text: string): string | null {
  return Object.keys(LANDMARK_CITY_MAP).find((name) => text.includes(name)) ?? null;
}

function extractPlace(text: string): string | null {
  const match = text.match(
    /(?:^|[^出回过上进下来])(?:在|去|到|逛)([一-龥A-Za-z]{2,14}?)(?=散步|逛|玩|拍照|约会|吃饭|上班|开会|参加|野餐|跑步|穿什么|穿啥|该穿|怎么穿|要穿|的话|[，,。.!！?？\s]|$)/
  );
  if (!match) return null;
  const place = match[1];
  if (NON_PLACE_WORDS.test(place) || /^(穿|吃|玩|干|做|买|看|哪)|穿什么|穿啥/.test(place)) return null;
  return sanitizeShortText(place, REQUIREMENT_LIMITS.placeNameMax);
}

function extractDateExpression(text: string): string | null {
  const match = text.match(
    /(\d{4}\s*[年\-/.]\s*\d{1,2}\s*[月\-/.]\s*\d{1,2}\s*[日号]?|\d{1,2}\s*月\s*\d{1,2}\s*[日号]?|大后天|大前天|后天|前天|明天|明日|明早|明晚|昨天|昨晚|今天|今日|今早|今晚|下下?(?:个)?(?:周|星期|礼拜)[一二三四五六日天]|(?:这|本)(?:个)?(?:周|星期|礼拜)[一二三四五六日天]|(?:这个|这|本)?周末|(?:周|星期|礼拜)[一二三四五六日天]|\d{1,2}\s*[号日])(?:\s*(?:早上|上午|中午|下午|傍晚|晚上))?/
  );
  if (match) return match[0].slice(0, REQUIREMENT_LIMITS.dateRawMax);
  const part = text.match(/早上|上午|中午|下午|傍晚|晚上/);
  return part ? part[0] : null;
}

export function keywordExtract(rawText: string): ExtractedFields {
  const text = rawText.slice(0, REQUIREMENT_LIMITS.requestTextMax);
  const result = emptyExtraction();

  const occasionRule = OCCASION_RULES.find(({ pattern }) => pattern.test(text));
  if (occasionRule) {
    result.occasion = occasionRule.occasion;
    result.confidence.occasion = 0.8;
  } else if (/出去|出门|外出/.test(text)) {
    result.ambiguousFields.push("occasion");
  }

  result.activity = ACTIVITY_RULES.find(({ pattern }) => pattern.test(text))?.activity ?? null;

  const styles: StyleTag[] = [];
  const disliked: DislikedStyle[] = [];
  let negatedFormal = false;
  for (const rule of STYLE_SYNONYMS) {
    if (rule.pattern.test(text)) {
      styles.push(...rule.styles);
      disliked.push(...(rule.disliked ?? []));
      if (rule.disliked?.includes("过于正式")) negatedFormal = true;
    }
  }
  for (const style of STYLE_VOCAB) {
    if (style === "正式" && negatedFormal) continue;
    if (text.includes(style)) styles.push(style);
  }
  result.style = [...new Set(styles)].slice(0, REQUIREMENT_LIMITS.styleMax);
  result.dislikedStyles = [...new Set(disliked)].slice(0, REQUIREMENT_LIMITS.dislikedStyleMax);

  if (negatedFormal || /休闲|随意|轻松/.test(text)) result.formality = "casual";
  else if (/商务休闲/.test(text)) result.formality = "business_casual";
  else if (/正式|西装|隆重/.test(text) || result.occasion === "formal_event") result.formality = "formal";
  else if (/精致一点|得体|体面/.test(text)) result.formality = "smart_casual";

  if (/一整天|全天|一天下来/.test(text)) result.duration = "full_day";
  else if (/半天/.test(text)) result.duration = "half_day";
  else if (/一会儿|一两个小时|一小时|两小时|一下子/.test(text)) result.duration = "short";

  result.specialRequirements = SPECIAL_RULES.filter(({ pattern }) => pattern.test(text))
    .map(({ value }) => value)
    .slice(0, REQUIREMENT_LIMITS.specialMax);

  const colorMatches = [
    ...text.matchAll(new RegExp(`(?:想穿|偏|喜欢|穿点|来点|要)(${COLOR_WORDS})色?`, "g")),
  ].map((m) => `${m[1]}色`);
  result.colorPreferences = [...new Set(colorMatches)].slice(0, REQUIREMENT_LIMITS.colorMax);

  const itemNames = [...text.matchAll(/(?:不要|别|不想)穿(?:那件|那条|那双|那个)?([一-龥A-Za-z]{2,10})/g)]
    .map((m) => m[1])
    .filter((name) => CLOTHING_WORDS.test(name));
  result.dislikedItemNames = [...new Set(itemNames)].slice(0, REQUIREMENT_LIMITS.dislikedItemNameMax);
  result.semanticPreferences = extractSemanticPreferences(text);

  // 长尾场景表达（如“音乐节”“公司年会”“Citywalk”）：能可靠映射时补充标准场景
  if (!result.occasion) {
    const mapped = mapPhraseToRequirementOccasion(text);
    if (mapped) {
      result.occasion = mapped.occasion;
      result.confidence.occasion = 0.6;
    }
  }

  result.dateExpression = extractDateExpression(text);
  if (result.dateExpression) result.confidence.date = 0.9;

  const landmark = findLandmark(text);
  const city = findKnownCity(text) ?? (landmark ? LANDMARK_CITY_MAP[landmark] : null);
  const place = landmark ?? extractPlace(text);
  result.city = city;
  result.place = place && place !== city ? place.replace(city ?? "", "") || place : null;
  if (city) result.confidence.location = landmark && !findKnownCity(text) ? 0.75 : 0.9;
  else if (result.place) {
    result.confidence.location = 0.3;
  }

  if (!result.occasion) {
    if (result.place || result.activity === "walking") {
      result.occasion = "outdoor_leisure";
      result.confidence.occasion = 0.6;
    } else if (result.activity === "dining" || result.activity === "party") {
      result.occasion = "party";
      result.confidence.occasion = 0.6;
    }
  }

  result.skipWeather = /不考虑天气|不用管天气|不需要天气|不看天气/.test(text);

  return result;
}

/** 后发提取结果覆盖先前字段；数组字段合并去重 */
export function mergeExtractions(base: ExtractedFields, next: ExtractedFields): ExtractedFields {
  const pick = <T>(a: T | null, b: T | null) => (b !== null && b !== undefined ? b : a);
  const union = <T>(a: T[], b: T[], max: number) => [...new Set([...a, ...b])].slice(0, max);
  return {
    occasion: pick(base.occasion, next.occasion),
    activity: pick(base.activity, next.activity),
    formality: pick(base.formality, next.formality),
    duration: pick(base.duration, next.duration),
    dateExpression: pick(base.dateExpression, next.dateExpression),
    place: next.city || next.place ? next.place : base.place,
    city: pick(base.city, next.city),
    style: union(base.style, next.style, REQUIREMENT_LIMITS.styleMax),
    dislikedStyles: union(base.dislikedStyles, next.dislikedStyles, REQUIREMENT_LIMITS.dislikedStyleMax),
    specialRequirements: union(base.specialRequirements, next.specialRequirements, REQUIREMENT_LIMITS.specialMax),
    colorPreferences: union(base.colorPreferences, next.colorPreferences, REQUIREMENT_LIMITS.colorMax),
    dislikedItemNames: union(base.dislikedItemNames, next.dislikedItemNames, REQUIREMENT_LIMITS.dislikedItemNameMax),
    semanticPreferences: mergeSemanticPreferences(base.semanticPreferences, next.semanticPreferences),
    skipWeather: base.skipWeather || next.skipWeather,
    confidence: { ...base.confidence, ...next.confidence },
    ambiguousFields: next.ambiguousFields,
  };
}

/** 模型结果为主，关键词结果补全模型遗漏的字段 */
export function combineModelAndKeywords(model: ExtractedFields, keywords: ExtractedFields): ExtractedFields {
  const combined = mergeExtractions(keywords, model);
  // 模型给了城市而关键词给了地标，保留地标作为具体地点
  combined.place = model.place ?? keywords.place;
  combined.ambiguousFields = model.ambiguousFields;
  combined.confidence = { ...keywords.confidence, ...model.confidence };
  return combined;
}
