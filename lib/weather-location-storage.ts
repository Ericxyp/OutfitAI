/**
 * 天气位置本地记忆（localStorage），按 Supabase user.id 隔离。
 * 只保存最小必要信息：位置 + 展示名；不保存 Key、天气数据或供应商响应。
 */
import type { WeatherLocationInput } from "@/types/weather";
import {
  CITY_INPUT_MAX_LENGTH,
  isValidCoordinates,
  validateCityInput,
} from "@/lib/weather-location";

export const WEATHER_LOCATION_STORAGE_PREFIX = "outfitai.weather.location:";
export const WEATHER_LOCATION_STORAGE_VERSION = 1;
const DISPLAY_NAME_MAX_LENGTH = 120;

export type StoredWeatherLocation =
  | {
      version: typeof WEATHER_LOCATION_STORAGE_VERSION;
      type: "city";
      city: string;
      displayName: string;
    }
  | {
      version: typeof WEATHER_LOCATION_STORAGE_VERSION;
      type: "coordinates";
      latitude: number;
      longitude: number;
      displayName: string;
    };

/** 与 window.localStorage 兼容的最小接口，便于测试注入 */
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** userId 必须是非空、无空白的短字符串（Supabase UUID）；否则不做持久化 */
export function getWeatherLocationStorageKey(
  userId: string | null | undefined
): string | null {
  if (typeof userId !== "string") return null;
  const trimmed = userId.trim();
  if (!trimmed || trimmed.length > 128 || /\s/.test(trimmed)) return null;
  return `${WEATHER_LOCATION_STORAGE_PREFIX}${trimmed}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidDisplayName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= DISPLAY_NAME_MAX_LENGTH &&
    !/[\u0000-\u001F\u007F]/.test(value)
  );
}

/** 运行时结构校验：任何不符合当前版本结构的数据都返回 null */
export function parseStoredWeatherLocation(
  raw: string | null
): StoredWeatherLocation | null {
  if (!raw || raw.length > 1024) return null;

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(data)) return null;
  if (data.version !== WEATHER_LOCATION_STORAGE_VERSION) return null;
  if (!isValidDisplayName(data.displayName)) return null;

  if (data.type === "city") {
    if (typeof data.city !== "string") return null;
    if (data.city.length > CITY_INPUT_MAX_LENGTH) return null;
    const validated = validateCityInput(data.city);
    if (!validated.ok || validated.city !== data.city) return null;
    return {
      version: WEATHER_LOCATION_STORAGE_VERSION,
      type: "city",
      city: validated.city,
      displayName: data.displayName,
    };
  }

  if (data.type === "coordinates") {
    if (!isValidCoordinates(data.latitude, data.longitude)) return null;
    return {
      version: WEATHER_LOCATION_STORAGE_VERSION,
      type: "coordinates",
      latitude: data.latitude as number,
      longitude: data.longitude as number,
      displayName: data.displayName,
    };
  }

  return null;
}

/** 读取当前用户的位置；非法或过期结构会被删除。任何异常都不会抛出。 */
export function readStoredWeatherLocation(
  storage: StorageLike | null | undefined,
  userId: string | null | undefined
): StoredWeatherLocation | null {
  const key = getWeatherLocationStorageKey(userId);
  if (!storage || !key) return null;

  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;

  const parsed = parseStoredWeatherLocation(raw);
  if (!parsed) {
    try {
      storage.removeItem(key);
    } catch {
      // ignore
    }
  }
  return parsed;
}

export function writeStoredWeatherLocation(
  storage: StorageLike | null | undefined,
  userId: string | null | undefined,
  location: StoredWeatherLocation
): boolean {
  const key = getWeatherLocationStorageKey(userId);
  if (!storage || !key) return false;

  // 写入前也做一次校验，确保只保存白名单字段
  const sanitized = parseStoredWeatherLocation(JSON.stringify(location));
  if (!sanitized) return false;

  const payload =
    sanitized.type === "city"
      ? {
          version: sanitized.version,
          type: sanitized.type,
          city: sanitized.city,
          displayName: sanitized.displayName,
        }
      : {
          version: sanitized.version,
          type: sanitized.type,
          latitude: sanitized.latitude,
          longitude: sanitized.longitude,
          displayName: sanitized.displayName,
        };

  try {
    storage.setItem(key, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

/** 只清除当前用户的 Key */
export function clearStoredWeatherLocation(
  storage: StorageLike | null | undefined,
  userId: string | null | undefined
): void {
  const key = getWeatherLocationStorageKey(userId);
  if (!storage || !key) return;
  try {
    storage.removeItem(key);
  } catch {
    // ignore
  }
}

/** 把本地位置转换为推荐请求参数（去掉 displayName / version） */
export function toRequestLocation(
  location: StoredWeatherLocation | null | undefined
): WeatherLocationInput | undefined {
  if (!location) return undefined;
  return location.type === "city"
    ? { type: "city", city: location.city }
    : {
        type: "coordinates",
        latitude: location.latitude,
        longitude: location.longitude,
      };
}

export function createStoredWeatherLocation(
  location: WeatherLocationInput,
  displayName: string
): StoredWeatherLocation {
  const name = displayName.trim().slice(0, DISPLAY_NAME_MAX_LENGTH) || "当前位置";
  return location.type === "city"
    ? {
        version: WEATHER_LOCATION_STORAGE_VERSION,
        type: "city",
        city: location.city,
        displayName: name,
      }
    : {
        version: WEATHER_LOCATION_STORAGE_VERSION,
        type: "coordinates",
        latitude: location.latitude,
        longitude: location.longitude,
        displayName: name,
      };
}

/** 安全获取 window.localStorage（隐私模式 / SSR 下返回 null） */
export function getBrowserStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}
