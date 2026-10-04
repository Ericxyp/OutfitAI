/**
 * 衣物自定义风格 / 自定义场景标签：校验、标准化与标准父标签映射。
 *
 * 纯函数模块，客户端表单与服务端 Server Action 共用同一套规则；
 * 服务端始终重新校验，不信任客户端结果。
 *
 * 职责边界：
 * - 系统标签（style_tags / occasion_tags）负责确定性规则评分；
 * - 自定义标签只用于 Embedding 文本、模型补充上下文和界面展示；
 * - 映射到系统标签的结果只作为规则评分的“弱补充”，不写回系统标签数组。
 */
import {
  DEFAULT_OCCASION_TAGS,
  DEFAULT_STYLE_TAGS,
} from "@/lib/constants/clothing-options";

export const CUSTOM_TAG_MAX_COUNT = 5;
export const CUSTOM_TAG_MIN_LENGTH = 2;
export const CUSTOM_TAG_MAX_LENGTH = 12;
/** 单次输入原始长度上限，超过直接拒绝，避免对超长字符串做正则 */
const RAW_INPUT_MAX_LENGTH = 200;
/** 每个自定义标签最多映射到的系统标签数 */
const MAX_CANONICAL_PER_TAG = 2;

export type CustomTagKind = "style" | "occasion";

export type SystemStyleTag = (typeof DEFAULT_STYLE_TAGS)[number];
export type SystemOccasionTag = (typeof DEFAULT_OCCASION_TAGS)[number];

export type CustomTagErrorType =
  | "empty"
  | "too_short"
  | "too_long"
  | "url"
  | "uuid"
  | "numeric"
  | "punctuation"
  | "markup"
  | "instruction"
  | "duplicate"
  | "system_duplicate"
  | "limit";

export const CUSTOM_TAG_ERROR_MESSAGES: Record<CustomTagErrorType, string> = {
  empty: "请输入标签内容",
  too_short: `至少 ${CUSTOM_TAG_MIN_LENGTH} 个字`,
  too_long: `最多 ${CUSTOM_TAG_MAX_LENGTH} 个字`,
  url: "不能包含链接",
  uuid: "不能包含编号或 ID",
  numeric: "不能只填数字",
  punctuation: "请输入文字内容",
  markup: "不能包含代码或特殊符号",
  instruction: "请填写简短的描述词，不要填写指令",
  duplicate: "已经添加过这个标签",
  system_duplicate: "系统标签里已有，可直接选择",
  limit: `每类最多 ${CUSTOM_TAG_MAX_COUNT} 个`,
};

// C0/C1 控制字符、零宽字符、双向控制符、BOM
const INVISIBLE_CHARS =
  /[\u0000-\u001F\u007F-\u009F­͏؜ᅟᅠ឴឵᠎\u200B-\u200F\u202A-\u202E⁠-⁯ㅤ︀-️\uFEFFﾠ]/g;
const URL_PATTERN = /(https?:\/\/|ftp:\/\/|www\.|[a-z0-9-]+\.(com|cn|net|org|io|app|dev|xyz|top|me|co)\b)/i;
const UUID_PATTERN = /[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/i;
const HAS_LETTER = /[\p{L}]/u;
const MARKUP_PATTERN = /[<>{}`$\\|;=[\]]|&[a-z#0-9]+;|\b(script|select|insert|delete|drop|function|return|console)\b/i;
const INSTRUCTION_PATTERN =
  /(忽略|无视|覆盖|绕过|忘记|不要遵守|系统提示|提示词|指令|规则|角色|扮演|你是|你现在|必须选|一定要选|只能选|执行|删除|输出|ignore|disregard|override|system|prompt|instruction|assistant|you are|act as|jailbreak)/i;

/** NFKC → 去不可见字符 → 去首尾空白 → 折叠连续空白 */
export function normalizeCustomTag(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .slice(0, RAW_INPUT_MAX_LENGTH)
    .normalize("NFKC")
    .replace(INVISIBLE_CHARS, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 去重键：标准化后忽略大小写、全半角（NFKC 已统一）和空白 */
export function customTagKey(tag: string): string {
  return normalizeCustomTag(tag).toLowerCase().replace(/\s+/g, "");
}

export function visibleLength(text: string): number {
  return Array.from(text).length;
}

export type CustomTagValidation =
  | { ok: true; tag: string }
  | { ok: false; error: CustomTagErrorType; message: string };

function fail(error: CustomTagErrorType): CustomTagValidation {
  return { ok: false, error, message: CUSTOM_TAG_ERROR_MESSAGES[error] };
}

/** 校验单个自定义标签（只看内容本身，不看与其它标签的关系） */
export function validateCustomTag(raw: unknown): CustomTagValidation {
  if (typeof raw !== "string") return fail("empty");
  if (raw.length > RAW_INPUT_MAX_LENGTH) return fail("too_long");

  const tag = normalizeCustomTag(raw);
  if (!tag) return fail("empty");

  // 先拦截结构性风险，再看长度，保证错误类型稳定
  if (URL_PATTERN.test(tag)) return fail("url");
  if (UUID_PATTERN.test(tag)) return fail("uuid");
  if (MARKUP_PATTERN.test(tag)) return fail("markup");
  if (INSTRUCTION_PATTERN.test(tag)) return fail("instruction");

  const compact = tag.replace(/\s+/g, "");
  if (/^[\p{N}]+$/u.test(compact)) return fail("numeric");
  if (!HAS_LETTER.test(compact)) return fail("punctuation");

  const length = visibleLength(tag);
  if (length < CUSTOM_TAG_MIN_LENGTH) return fail("too_short");
  if (length > CUSTOM_TAG_MAX_LENGTH) return fail("too_long");

  return { ok: true, tag };
}

function systemTagsFor(kind: CustomTagKind): readonly string[] {
  return kind === "style" ? DEFAULT_STYLE_TAGS : DEFAULT_OCCASION_TAGS;
}

export type AddCustomTagResult =
  | { ok: true; tags: string[] }
  | { ok: false; error: CustomTagErrorType; message: string };

/**
 * 表单“添加”操作：在现有列表上追加一个标签（客户端就近提示错误用）。
 * 与系统标签同义（标准化后相同）时提示直接选择系统标签，不自动改动系统标签。
 */
export function addCustomTag(
  existing: readonly string[],
  raw: unknown,
  kind: CustomTagKind
): AddCustomTagResult {
  const validated = validateCustomTag(raw);
  if (!validated.ok) return validated;

  const key = customTagKey(validated.tag);
  if (systemTagsFor(kind).some((tag) => customTagKey(tag) === key)) {
    return { ok: false, error: "system_duplicate", message: CUSTOM_TAG_ERROR_MESSAGES.system_duplicate };
  }
  if (existing.some((tag) => customTagKey(tag) === key)) {
    return { ok: false, error: "duplicate", message: CUSTOM_TAG_ERROR_MESSAGES.duplicate };
  }
  if (existing.length >= CUSTOM_TAG_MAX_COUNT) {
    return { ok: false, error: "limit", message: CUSTOM_TAG_ERROR_MESSAGES.limit };
  }
  return { ok: true, tags: [...existing, validated.tag] };
}

export type NormalizedCustomTagList = {
  tags: string[];
  /** 被丢弃的条目数（非法、重复、与系统标签重复或超出数量） */
  rejectedCount: number;
  /** 第一个错误类型（用于聚合埋点，不含原文） */
  firstError: CustomTagErrorType | null;
};

/**
 * 服务端 / 存储边界使用：把任意输入清洗为合法标签数组。
 * 非法条目被丢弃而不是让整件衣物保存失败；数组长度不超过 CUSTOM_TAG_MAX_COUNT。
 */
export function normalizeCustomTagList(
  raw: unknown,
  kind: CustomTagKind
): NormalizedCustomTagList {
  const input = Array.isArray(raw) ? raw.slice(0, 50) : [];
  const systemKeys = new Set(systemTagsFor(kind).map(customTagKey));
  const seen = new Set<string>();
  const tags: string[] = [];
  let rejectedCount = Array.isArray(raw) ? Math.max(0, raw.length - input.length) : 0;
  let firstError: CustomTagErrorType | null = null;
  const reject = (error: CustomTagErrorType) => {
    rejectedCount += 1;
    firstError ??= error;
  };

  for (const value of input) {
    const validated = validateCustomTag(value);
    if (!validated.ok) {
      reject(validated.error);
      continue;
    }
    const key = customTagKey(validated.tag);
    if (systemKeys.has(key)) {
      reject("system_duplicate");
      continue;
    }
    if (seen.has(key)) {
      reject("duplicate");
      continue;
    }
    if (tags.length >= CUSTOM_TAG_MAX_COUNT) {
      reject("limit");
      continue;
    }
    seen.add(key);
    tags.push(validated.tag);
  }

  return { tags, rejectedCount, firstError };
}

/** 读取衣物上的自定义标签：旧数据（字段缺失 / null）按空数组处理，且再次清洗 */
export function readCustomTags(
  item: { custom_style_tags?: unknown; custom_occasion_tags?: unknown } | null | undefined
): { customStyleTags: string[]; customOccasionTags: string[] } {
  return {
    customStyleTags: normalizeCustomTagList(item?.custom_style_tags ?? [], "style").tags,
    customOccasionTags: normalizeCustomTagList(item?.custom_occasion_tags ?? [], "occasion").tags,
  };
}

// ---------------- 同义词 / 标准父标签映射 ----------------

/** 需求确认 Agent 的场景枚举（与 lib/requirements/schema 中 OCCASIONS 取值一致） */
export type RequirementOccasionValue =
  | "commute"
  | "business"
  | "interview"
  | "date"
  | "party"
  | "outdoor_leisure"
  | "sports"
  | "travel"
  | "shopping"
  | "formal_event"
  | "daily";

type AliasEntry = {
  /** 标准化（customTagKey）后的别名；完全相等或标签包含该别名即命中 */
  aliases: string[];
  closetStyles?: SystemStyleTag[];
  closetOccasions?: SystemOccasionTag[];
  /** 聊天需求中的同义表达 → 需求确认 Agent 的场景枚举 */
  requirementOccasion?: RequirementOccasionValue;
};

/**
 * 轻量、确定性的别名表。置信度不足的词（如“多巴胺”“见家长”）故意不收录，
 * 宁可不映射，只保留原文参与语义召回。
 */
export const CUSTOM_TAG_ALIASES: readonly AliasEntry[] = [
  // ---- 风格 ----
  { aliases: ["极简", "极简风", "简约风", "性冷淡风", "minimal", "minimalism", "cleanfit"], closetStyles: ["简约"] },
  { aliases: ["oldmoney", "老钱风", "老钱"], closetStyles: ["简约", "正式"] },
  { aliases: ["职场风", "通勤风", "上班穿", "office"], closetStyles: ["通勤"] },
  { aliases: ["松弛感", "慵懒", "松弛"], closetStyles: ["休闲"] },
  { aliases: ["韩风", "韩系风", "韩式"], closetStyles: ["韩系"] },
  { aliases: ["港风", "复古风", "vintage", "retro"], closetStyles: ["复古"] },
  { aliases: ["街头风", "streetwear", "嘻哈", "hiphop", "cityboy"], closetStyles: ["街头"] },
  { aliases: ["温柔风", "淑女", "知性"], closetStyles: ["温柔"] },
  { aliases: ["正装", "西装感", "商务风"], closetStyles: ["正式"] },
  { aliases: ["休闲风", "casual"], closetStyles: ["休闲"] },
  // ---- 场景 ----
  { aliases: ["职场", "上班", "通勤", "办公室", "坐班"], closetOccasions: ["上班"], requirementOccasion: "commute" },
  { aliases: ["citywalk", "城市漫步", "遛狗", "遛弯", "散步"], closetOccasions: ["周末", "日常"], requirementOccasion: "outdoor_leisure" },
  { aliases: ["咖啡馆拍照", "咖啡馆", "探店"], closetOccasions: ["日常", "约会"], requirementOccasion: "daily" },
  { aliases: ["公司年会", "年会", "晚宴", "颁奖"], closetOccasions: ["聚会"], requirementOccasion: "formal_event" },
  { aliases: ["音乐节", "livehouse", "演唱会", "派对", "生日会"], closetOccasions: ["聚会"], requirementOccasion: "party" },
  { aliases: ["海边看日落", "看日落", "海边", "度假", "露营"], closetOccasions: ["旅行", "约会"], requirementOccasion: "travel" },
  { aliases: ["相亲", "看电影", "约会"], closetOccasions: ["约会"], requirementOccasion: "date" },
];

const NEGATION_PATTERN = /(不|别|非|忌|避免|讨厌|反)/;

function findAliasEntries(tag: string): AliasEntry[] {
  const key = customTagKey(tag);
  if (!key || NEGATION_PATTERN.test(key)) return [];
  const exact = CUSTOM_TAG_ALIASES.filter((entry) => entry.aliases.includes(key));
  if (exact.length > 0) return exact;
  // 包含匹配：只用长度 ≥ 2 的别名，按别名长度优先，避免短词误命中
  return CUSTOM_TAG_ALIASES.filter((entry) =>
    entry.aliases.some((alias) => visibleLength(alias) >= 2 && key.includes(alias))
  );
}

function collectTargets<T extends string>(entries: AliasEntry[], pick: (entry: AliasEntry) => readonly T[] | undefined): T[] {
  const result: T[] = [];
  for (const entry of entries) {
    for (const target of pick(entry) ?? []) {
      if (!result.includes(target)) result.push(target);
      if (result.length >= MAX_CANONICAL_PER_TAG) return result;
    }
  }
  return result;
}

/** 自定义风格 → 系统风格标签（0~2 个，只来自 DEFAULT_STYLE_TAGS） */
export function mapCustomStyleToCanonical(tag: string): SystemStyleTag[] {
  const targets = collectTargets(findAliasEntries(tag), (entry) => entry.closetStyles);
  return targets.filter((value): value is SystemStyleTag =>
    (DEFAULT_STYLE_TAGS as readonly string[]).includes(value)
  );
}

/** 自定义场景 → 系统场景标签（0~2 个，只来自 DEFAULT_OCCASION_TAGS） */
export function mapCustomOccasionToCanonical(tag: string): SystemOccasionTag[] {
  const targets = collectTargets(findAliasEntries(tag), (entry) => entry.closetOccasions);
  return targets.filter((value): value is SystemOccasionTag =>
    (DEFAULT_OCCASION_TAGS as readonly string[]).includes(value)
  );
}

/**
 * 计算衣物的“弱补充”标准标签：只返回用户未选择的系统标签，
 * 不修改、不覆盖 style_tags / occasion_tags。
 */
export function getSupplementalCanonicalTags(item: {
  style_tags?: string[] | null;
  occasion_tags?: string[] | null;
  custom_style_tags?: unknown;
  custom_occasion_tags?: unknown;
}): { styles: SystemStyleTag[]; occasions: SystemOccasionTag[] } {
  const { customStyleTags, customOccasionTags } = readCustomTags(item);
  const chosenStyles = new Set(item.style_tags ?? []);
  const chosenOccasions = new Set(item.occasion_tags ?? []);
  const styles = new Set<SystemStyleTag>();
  const occasions = new Set<SystemOccasionTag>();

  for (const tag of customStyleTags) {
    for (const mapped of mapCustomStyleToCanonical(tag)) {
      if (!chosenStyles.has(mapped)) styles.add(mapped);
    }
  }
  for (const tag of customOccasionTags) {
    for (const mapped of mapCustomOccasionToCanonical(tag)) {
      if (!chosenOccasions.has(mapped)) occasions.add(mapped);
    }
  }
  return { styles: [...styles], occasions: [...occasions] };
}

/** 聊天表达 → 需求场景枚举（用于需求确认 Agent，无法可靠映射时返回 null） */
export function mapPhraseToRequirementOccasion(text: string): {
  occasion: RequirementOccasionValue;
  matched: string;
} | null {
  const key = customTagKey(text);
  for (const entry of CUSTOM_TAG_ALIASES) {
    if (!entry.requirementOccasion) continue;
    const alias = entry.aliases
      .filter((candidate) => visibleLength(candidate) >= 2)
      .sort((a, b) => b.length - a.length)
      .find((candidate) => key.includes(candidate));
    if (alias) return { occasion: entry.requirementOccasion, matched: alias };
  }
  return null;
}

/** 常规词由需求解析的关键词规则直接处理，不作为“长尾偏好”重复保留 */
const GENERIC_PHRASES = new Set(["上班", "通勤", "职场", "办公室", "坐班", "约会", "散步", "遛弯", "休闲风", "casual", "松弛"]);

/** 在一段聊天文本中找到别名表收录的长尾表达（保留原词，用作语义偏好） */
export function findKnownCustomPhrases(text: string): string[] {
  const key = customTagKey(text);
  const found: string[] = [];
  for (const entry of CUSTOM_TAG_ALIASES) {
    const alias = [...entry.aliases]
      .sort((a, b) => b.length - a.length)
      .find((candidate) => visibleLength(candidate) >= 2 && key.includes(candidate));
    if (alias && !GENERIC_PHRASES.has(alias) && !found.includes(alias)) found.push(alias);
  }
  return found;
}

// ---------------- 埋点 ----------------

export type CustomTagEventSource = "single" | "edit" | "batch";

/** 埋点 metadata：只含计数和枚举，不含任何标签原文 */
export function buildCustomTagEventMetadata(input: {
  customStyleTags: readonly string[];
  customOccasionTags: readonly string[];
  source: CustomTagEventSource;
  embeddingUpdated: boolean;
  validationErrorType?: CustomTagErrorType | null;
}): Record<string, string | number | boolean> {
  const canonicalMappingCount =
    input.customStyleTags.reduce((sum, tag) => sum + mapCustomStyleToCanonical(tag).length, 0) +
    input.customOccasionTags.reduce((sum, tag) => sum + mapCustomOccasionToCanonical(tag).length, 0);
  return {
    feature: "closet",
    customStyleTagCount: input.customStyleTags.length,
    customOccasionTagCount: input.customOccasionTags.length,
    canonicalMappingCount,
    source: input.source,
    embeddingUpdated: input.embeddingUpdated,
    ...(input.validationErrorType ? { validationErrorType: input.validationErrorType } : {}),
  };
}

// ---------------- 精确自定义标签匹配 ----------------

/**
 * 精确匹配用的少量明确同义词（标准化后整词相等才替换，不做包含匹配）。
 * 只收录含义完全相同的写法，避免扩大命中范围。
 */
export const EXACT_TAG_SYNONYMS: Readonly<Record<string, string>> = {
  健身房: "健身",
  运动健身: "健身",
  去健身: "健身",
  撸铁: "健身",
  通勤上班: "上班",
  上班通勤: "上班",
  职场通勤: "上班",
};

/**
 * 精确匹配的统一标准化（纯函数，不调用模型）：
 * NFKC → 去不可见字符 → trim → 英文小写 → 多余空格折叠为一个 → 明确同义词替换。
 * 返回空串表示无法用于匹配。
 */
export function normalizeTagForMatch(raw: unknown): string {
  const normalized = normalizeCustomTag(raw).toLowerCase().replace(/\s+/g, " ");
  if (!normalized) return "";
  return EXACT_TAG_SYNONYMS[normalized] ?? normalized;
}
