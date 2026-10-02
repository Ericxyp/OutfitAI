/**
 * 天气位置的纯函数工具（客户端 / 服务端共用，不含任何密钥或网络请求）。
 */
import type {
  LocationInput,
  WeatherLocationInput,
  WeatherLookupFailureStatus,
} from "@/types/weather";

export const CITY_INPUT_MAX_LENGTH = 80;

export const WEATHER_LOCATION_MESSAGES = {
  not_found: "没有找到这个城市，请检查名称后重试。",
  unavailable: "暂时无法获取天气，你仍可继续生成普通穿搭。",
  invalid_input: "请输入有效的城市名称。",
  unauthorized: "请先登录后再选择城市。",
  geolocation_failed: "无法获取当前位置，你可以手动输入城市。",
} as const;

export function getWeatherLookupMessage(
  status: WeatherLookupFailureStatus | "unauthorized"
): string {
  return WEATHER_LOCATION_MESSAGES[status];
}

// C0/C1 控制字符、换行、Unicode 行/段分隔符、零宽与双向文本控制符
const DISALLOWED_CHAR_PATTERN =
  /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF]/;
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

export type CityValidationResult =
  | { ok: true; city: string }
  | { ok: false };

/**
 * 城市输入校验：trim、非空、≤80 字符、不含换行/控制字符、至少含一个字母或数字。
 * 内部多余空白会被折叠为单个空格。
 */
export function validateCityInput(raw: unknown): CityValidationResult {
  if (typeof raw !== "string") return { ok: false };
  // 超长输入直接拒绝，避免对超大字符串做正则 / normalize
  if (raw.length > CITY_INPUT_MAX_LENGTH * 4) return { ok: false };
  // 先检查原始字符串中的控制字符（含首尾换行），避免被 trim 静默吞掉
  if (DISALLOWED_CHAR_PATTERN.test(raw)) return { ok: false };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false };

  const city = trimmed.normalize("NFKC").replace(/\s+/g, " ");
  if (!city || city.length > CITY_INPUT_MAX_LENGTH) return { ok: false };
  if (DISALLOWED_CHAR_PATTERN.test(city)) return { ok: false };
  if (!HAS_LETTER_OR_DIGIT.test(city)) return { ok: false };

  return { ok: true, city };
}

export function isValidCoordinates(
  latitude: unknown,
  longitude: unknown
): boolean {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 把任意输入（Server Action 参数 / 移动端 body / 旧版 LocationInput）
 * 规范化为 WeatherLocationInput；非法时返回 null。
 */
export function normalizeWeatherLocationInput(
  raw: WeatherLocationInput | LocationInput | unknown
): WeatherLocationInput | null {
  if (!isRecord(raw)) return null;

  if (raw.type === "city") {
    const validated = validateCityInput(raw.city);
    return validated.ok ? { type: "city", city: validated.city } : null;
  }

  // type === "coordinates" 或旧版无 type 的 { latitude, longitude }
  if (raw.type === "coordinates" || raw.type === undefined) {
    if (!isValidCoordinates(raw.latitude, raw.longitude)) return null;
    return {
      type: "coordinates",
      latitude: raw.latitude as number,
      longitude: raw.longitude as number,
    };
  }

  return null;
}

/** 保留 2 位小数（约 1km 精度），减少本地存储的精确位置信息 */
export function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

export type WeatherSummary = {
  locationName?: string;
  temperatureC: number;
  condition: string;
};

/** 例如 "Shanghai · 小雨 · 21°C" */
export function formatWeatherSummary(
  summary: WeatherSummary,
  fallbackName: string
): string {
  const name = summary.locationName?.trim() || fallbackName;
  return `${name} · ${summary.condition} · ${Math.round(summary.temperatureC)}°C`;
}

// ---------------- 埋点 ----------------

export const WEATHER_LOCATION_EVENT_NAMES = [
  "weather_location_requested",
  "weather_location_succeeded",
  "weather_location_failed",
  "weather_manual_city_used",
] as const;

export type WeatherLocationEventName =
  (typeof WEATHER_LOCATION_EVENT_NAMES)[number];

export type WeatherLocationSource = "coordinates" | "manual_city";

export const WEATHER_LOCATION_FAILURE_REASONS = [
  "permission_denied",
  "timeout",
  "not_found",
  "unavailable",
  "invalid_input",
] as const;

export type WeatherLocationFailureReason =
  (typeof WEATHER_LOCATION_FAILURE_REASONS)[number];

/** 浏览器端可上报的定位失败原因（城市类失败由服务端自行判定） */
export const GEOLOCATION_FAILURE_REASONS = [
  "permission_denied",
  "timeout",
  "unavailable",
] as const satisfies readonly WeatherLocationFailureReason[];

export type GeolocationFailureReason =
  (typeof GEOLOCATION_FAILURE_REASONS)[number];

export function isGeolocationFailureReason(
  value: unknown
): value is GeolocationFailureReason {
  return (
    typeof value === "string" &&
    (GEOLOCATION_FAILURE_REASONS as readonly string[]).includes(value)
  );
}

/** GeolocationPositionError.code → 埋点原因 */
export function mapGeolocationErrorCode(
  code: number | undefined
): GeolocationFailureReason {
  if (code === 1) return "permission_denied";
  if (code === 3) return "timeout";
  return "unavailable";
}

/**
 * 构造天气位置埋点 metadata：仅允许 source / reason / hasWeather，
 * 绝不包含经纬度、城市原文、URL 或 Key。
 */
export function buildWeatherLocationEventMetadata(input: {
  source: WeatherLocationSource;
  reason?: WeatherLocationFailureReason;
  hasWeather: boolean;
}): {
  source: WeatherLocationSource;
  reason?: WeatherLocationFailureReason;
  hasWeather: boolean;
} {
  return {
    source: input.source,
    ...(input.reason ? { reason: input.reason } : {}),
    hasWeather: input.hasWeather,
  };
}
