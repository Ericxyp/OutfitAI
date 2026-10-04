/**
 * 确定性日期解析：模型只负责给出原始表达，标准日期由程序在用户时区内计算。
 * 结果不能无理由落在过去；过远的日期视为无效。
 */
import type { RequirementDate } from "@/types/requirement";
import type { PartOfDay } from "@/lib/requirements/schema";
import { REQUIREMENT_LIMITS } from "@/lib/requirements/schema";

export const DEFAULT_TIME_ZONE = "Asia/Shanghai";
/** 允许的最远日期（天） */
export const MAX_DATE_OFFSET_DAYS = 60;

export type DateResolution =
  | { status: "ok"; date: RequirementDate }
  | { status: "past"; raw: string }
  | { status: "too_far"; raw: string }
  | { status: "none" };

type YMD = { y: number; m: number; d: number };

export function normalizeTimeZone(value: unknown): string {
  if (typeof value !== "string" || value.length > 64 || !/^[A-Za-z_+\-/0-9]+$/.test(value)) {
    return DEFAULT_TIME_ZONE;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

export function getTodayInTimeZone(now: Date, timeZone: string): YMD {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: normalizeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

function toUtc(ymd: YMD): number {
  return Date.UTC(ymd.y, ymd.m - 1, ymd.d);
}

function addDays(ymd: YMD, days: number): YMD {
  const date = new Date(toUtc(ymd) + days * 86400000);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

function diffDays(a: YMD, b: YMD): number {
  return Math.round((toUtc(a) - toUtc(b)) / 86400000);
}

function isValidYmd(ymd: YMD): boolean {
  if (!Number.isInteger(ymd.y) || !Number.isInteger(ymd.m) || !Number.isInteger(ymd.d)) return false;
  const date = new Date(toUtc(ymd));
  return date.getUTCFullYear() === ymd.y && date.getUTCMonth() === ymd.m - 1 && date.getUTCDate() === ymd.d;
}

export function formatIsoDate(ymd: YMD): string {
  return `${ymd.y}-${String(ymd.m).padStart(2, "0")}-${String(ymd.d).padStart(2, "0")}`;
}

/** ISO 星期：周一 = 1 … 周日 = 7 */
function isoWeekday(ymd: YMD): number {
  const day = new Date(toUtc(ymd)).getUTCDay();
  return day === 0 ? 7 : day;
}

const WEEKDAY_MAP: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 7,
  天: 7,
};

const PART_OF_DAY_PATTERNS: Array<{ pattern: RegExp; part: PartOfDay }> = [
  { pattern: /今早|明早|早上|上午|早晨|清晨/, part: "morning" },
  { pattern: /中午|午饭|午餐/, part: "noon" },
  { pattern: /下午|午后/, part: "afternoon" },
  { pattern: /今晚|明晚|晚上|傍晚|夜里|晚饭|晚餐|夜晚/, part: "evening" },
];

export function detectPartOfDay(text: string): PartOfDay | null {
  for (const { pattern, part } of PART_OF_DAY_PATTERNS) {
    if (pattern.test(text)) return part;
  }
  return null;
}

type Candidate = { target: YMD; raw: string; allowRollForward?: "year" | "month" };

function findCandidate(text: string, today: YMD): Candidate | null {
  let match: RegExpMatchArray | null;

  // 显式完整日期
  match = text.match(/(\d{4})\s*[年\-/.]\s*(\d{1,2})\s*[月\-/.]\s*(\d{1,2})\s*[日号]?/);
  if (match) {
    return { target: { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) }, raw: match[0] };
  }

  // X月X日
  match = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/);
  if (match) {
    return {
      target: { y: today.y, m: Number(match[1]), d: Number(match[2]) },
      raw: match[0],
      allowRollForward: "year",
    };
  }

  const relative: Array<{ pattern: RegExp; offset: number }> = [
    { pattern: /大后天/, offset: 3 },
    { pattern: /大前天/, offset: -3 },
    { pattern: /后天/, offset: 2 },
    { pattern: /前天/, offset: -2 },
    { pattern: /明天|明日|明早|明晚|明儿/, offset: 1 },
    { pattern: /昨天|昨日|昨晚|昨儿/, offset: -1 },
    { pattern: /今天|今日|今早|今晚|今儿|当天|现在|此刻|待会|等会/, offset: 0 },
  ];
  for (const { pattern, offset } of relative) {
    match = text.match(pattern);
    if (match) return { target: addDays(today, offset), raw: match[0] };
  }

  // 下周X / 下下周X
  match = text.match(/(下下|下)(?:个)?(?:周|星期|礼拜)([一二三四五六日天])/);
  if (match) {
    const weeks = match[1] === "下下" ? 2 : 1;
    const monday = addDays(today, -(isoWeekday(today) - 1) + 7 * weeks);
    return { target: addDays(monday, WEEKDAY_MAP[match[2]] - 1), raw: match[0] };
  }

  // 这周X / 本周X（可能已过去）
  match = text.match(/(这|本)(?:个)?(?:周|星期|礼拜)([一二三四五六日天])/);
  if (match) {
    const monday = addDays(today, -(isoWeekday(today) - 1));
    return { target: addDays(monday, WEEKDAY_MAP[match[2]] - 1), raw: match[0] };
  }

  // 周末：最近的周六（今天是周末则为今天）
  match = text.match(/(这个|这|本)?周末/);
  if (match) {
    const dow = isoWeekday(today);
    const offset = dow >= 6 ? 0 : 6 - dow;
    return { target: addDays(today, offset), raw: match[0] };
  }

  // 周X / 星期X：今天或之后最近的一天
  match = text.match(/(?:周|星期|礼拜)([一二三四五六日天])/);
  if (match) {
    const offset = (WEEKDAY_MAP[match[1]] - isoWeekday(today) + 7) % 7;
    return { target: addDays(today, offset), raw: match[0] };
  }

  // X号 / X日
  match = text.match(/(^|[^\d月])(\d{1,2})\s*[号日](?!\d)/);
  if (match) {
    return {
      target: { y: today.y, m: today.m, d: Number(match[2]) },
      raw: match[0].slice(match[1].length),
      allowRollForward: "month",
    };
  }

  return null;
}

export function resolveDateExpression(
  text: string | null | undefined,
  now: Date,
  timeZone: string
): DateResolution {
  if (!text) return { status: "none" };
  const source = text.slice(0, REQUIREMENT_LIMITS.requestTextMax);
  const today = getTodayInTimeZone(now, timeZone);
  const candidate = findCandidate(source, today);
  const partOfDay = detectPartOfDay(source);

  if (!candidate) {
    // 只有“下午/晚上”等时段，没有日期：视为今天
    if (partOfDay) {
      const partRaw = source.match(PART_OF_DAY_PATTERNS.find((p) => p.part === partOfDay)!.pattern)?.[0] ?? "";
      return {
        status: "ok",
        date: { iso: formatIsoDate(today), raw: partRaw.slice(0, REQUIREMENT_LIMITS.dateRawMax), offsetDays: 0, partOfDay },
      };
    }
    return { status: "none" };
  }

  const partText = partOfDay
    ? source.match(PART_OF_DAY_PATTERNS.find((p) => p.part === partOfDay)!.pattern)?.[0] ?? ""
    : "";
  const raw = (candidate.raw.includes(partText) ? candidate.raw : `${candidate.raw}${partText}`)
    .slice(0, REQUIREMENT_LIMITS.dateRawMax);
  if (!isValidYmd(candidate.target)) return { status: "past", raw };

  let target = candidate.target;
  let offset = diffDays(target, today);

  if (offset < 0 && candidate.allowRollForward) {
    const rolled =
      candidate.allowRollForward === "year"
        ? { ...target, y: target.y + 1 }
        : (() => {
            const nextMonth = target.m === 12 ? { y: target.y + 1, m: 1 } : { y: target.y, m: target.m + 1 };
            return { ...nextMonth, d: target.d };
          })();
    if (isValidYmd(rolled) && diffDays(rolled, today) <= MAX_DATE_OFFSET_DAYS) {
      target = rolled;
      offset = diffDays(target, today);
    }
  }

  if (offset < 0) return { status: "past", raw };
  if (offset > MAX_DATE_OFFSET_DAYS) return { status: "too_far", raw };

  return {
    status: "ok",
    date: {
      iso: formatIsoDate(target),
      raw,
      offsetDays: offset,
      partOfDay,
    },
  };
}

/** 构造“今天”的默认日期（作为系统假设） */
export function todayRequirementDate(now: Date, timeZone: string): RequirementDate {
  return {
    iso: formatIsoDate(getTodayInTimeZone(now, timeZone)),
    raw: "未指定",
    offsetDays: 0,
    partOfDay: null,
  };
}

/** 用当前时间重新计算已有日期的 offset；已过去返回 null */
export function recomputeDateOffset(
  iso: string,
  now: Date,
  timeZone: string
): number | null {
  const [y, m, d] = iso.split("-").map(Number);
  const target = { y, m, d };
  if (!isValidYmd(target)) return null;
  const offset = diffDays(target, getTodayInTimeZone(now, timeZone));
  if (offset < 0 || offset > MAX_DATE_OFFSET_DAYS) return null;
  return offset;
}

export function formatDateLabel(date: RequirementDate): string {
  const [, m, d] = date.iso.split("-").map(Number);
  const relative =
    date.offsetDays === 0 ? "今天" : date.offsetDays === 1 ? "明天" : date.offsetDays === 2 ? "后天" : null;
  const part = date.partOfDay
    ? { morning: "上午", noon: "中午", afternoon: "下午", evening: "晚上" }[date.partOfDay]
    : "";
  return `${m}月${d}日${relative ? `（${relative}）` : ""}${part}`;
}
