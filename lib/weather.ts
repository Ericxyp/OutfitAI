import type {
  LocationInput,
  WeatherContext,
  WeatherLocationInput,
  WeatherLookupResult,
} from "@/types/weather";

export type WeatherDateLookupResult =
  | WeatherLookupResult
  | { status: "out_of_range" };
import { logger, safeErrorFields } from "@/lib/logger";
import {
  CHINESE_CITY_ALIASES,
  isValidCoordinates,
  normalizeWeatherLocationInput,
  validateCityInput,
} from "@/lib/weather-location";

const DEFAULT_TIMEOUT_MS = 6000;
const DEFAULT_BASE_URL = "https://api.weatherapi.com/v1";
const WEATHER_SOURCE = "weatherapi.com";
/** WeatherAPI 错误码：No matching location found */
const WEATHERAPI_NOT_FOUND_CODE = 1006;
/** 每次城市查询最多请求上游次数（原文 + 一个候选写法） */
const MAX_CITY_QUERY_ATTEMPTS = 2;


function getWeatherApiKey(): string | null {
  const key = process.env.WEATHER_API_KEY?.trim();
  return key || null;
}

function getWeatherBaseUrl(): string {
  return process.env.WEATHER_API_BASE_URL?.trim() || DEFAULT_BASE_URL;
}

function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** 从日志字段中抹掉 API Key 与完整 URL（防御：上游/运行时错误信息可能带出 URL） */
function redactSecret(text: string, secret: string | null): string {
  let result = text;
  if (secret) {
    result = result.split(secret).join("[redacted]");
    const encoded = encodeURIComponent(secret);
    if (encoded !== secret) {
      result = result.split(encoded).join("[redacted]");
    }
  }
  return result
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/([?&]key=)[^&\s]*/gi, "$1[redacted]");
}

function safeWeatherErrorFields(error: unknown, apiKey: string | null) {
  const fields = safeErrorFields(error);
  return {
    errorName: fields.errorName,
    errorMessage: redactSecret(fields.errorMessage, apiKey),
  };
}

/**
 * WeatherAPI.com 响应适配器。
 * 文档：https://www.weatherapi.com/docs/
 *
 * 更换供应商时，修改此函数中的字段映射即可。
 */
function normalizeWeatherApiResponse(
  data: unknown,
  source: string
): WeatherContext | null {
  if (!isRecord(data) || !isRecord(data.current)) {
    return null;
  }

  const current = data.current;
  const location = isRecord(data.location) ? data.location : null;

  const temperatureC = current.temp_c;
  if (!isValidNumber(temperatureC)) {
    return null;
  }

  const conditionObj = isRecord(current.condition) ? current.condition : null;
  const conditionText =
    typeof conditionObj?.text === "string" ? conditionObj.text.trim() : null;
  if (!conditionText) {
    return null;
  }

  const locationName =
    typeof location?.name === "string" ? location.name : undefined;
  const feelsLikeC = isValidNumber(current.feelslike_c)
    ? current.feelslike_c
    : undefined;
  const humidity = isValidNumber(current.humidity)
    ? current.humidity
    : undefined;
  const windKph = isValidNumber(current.wind_kph) ? current.wind_kph : undefined;
  const observedAt =
    typeof current.last_updated === "string"
      ? current.last_updated
      : undefined;

  return {
    source,
    locationName,
    temperatureC,
    feelsLikeC,
    condition: conditionText,
    humidity,
    windKph,
    observedAt,
  };
}

/** 标准地点名：name + country，例如 "Shanghai, China" */
function buildDisplayName(data: unknown, fallback: string): string {
  const location =
    isRecord(data) && isRecord(data.location) ? data.location : null;
  const parts = [location?.name, location?.country]
    .filter((part): part is string => typeof part === "string")
    .map((part) => part.trim())
    .filter(Boolean);
  const unique = parts.filter((part, index) => parts.indexOf(part) === index);
  const name = unique.join(", ") || fallback;
  return name.slice(0, 120);
}

async function readWeatherApiErrorCode(
  response: Response
): Promise<number | null> {
  try {
    const data: unknown = await response.json();
    if (isRecord(data) && isRecord(data.error)) {
      const code = data.error.code;
      return typeof code === "number" ? code : null;
    }
  } catch {
    // ignore
  }
  return null;
}

type WeatherApiResponse =
  | { status: "ok"; data: unknown }
  | { status: "not_found" | "unavailable" };

/**
 * 共用的 WeatherAPI 请求：query 统一经过 encodeURIComponent，
 * 不会在日志 / 返回值中包含 Key、完整 URL 或供应商原始错误。
 */
async function requestWeatherApi(
  endpoint: "current.json" | "forecast.json",
  query: string,
  kind: "coordinates" | "city",
  extraParams = ""
): Promise<WeatherApiResponse> {
  const apiKey = getWeatherApiKey();
  if (!apiKey) {
    logger.warn("[weather] missing api key, skipping weather lookup");
    return { status: "unavailable" };
  }

  const baseUrl = getWeatherBaseUrl().replace(/\/$/, "");
  // lang=zh：天气描述返回中文（如“小雨”），与规则引擎的中文匹配（雨/雷/风）一致
  const url = `${baseUrl}/${endpoint}?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}&lang=zh${extraParams}`;

  logger.debug("[weather] fetching weather", {
    hasApiKey: true,
    queryKind: kind,
    endpoint,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      const errorCode = await readWeatherApiErrorCode(response);
      if (errorCode === WEATHERAPI_NOT_FOUND_CODE) {
        logger.debug("[weather] location not found", { queryKind: kind });
        return { status: "not_found" };
      }

      logger.error("[weather] fetch failed", {
        feature: "weather",
        reason: "http_error",
        errorName: "HttpError",
        httpStatus: response.status,
        providerErrorCode: errorCode,
      });
      return { status: "unavailable" };
    }

    return { status: "ok", data: (await response.json()) as unknown };
  } catch (error) {
    const isTimeout =
      error instanceof Error &&
      (error.name === "AbortError" ||
        error.name === "TimeoutError" ||
        error.message.includes("aborted"));

    logger.error("[weather] fetch failed", {
      feature: "weather",
      reason: isTimeout ? "timeout" : "error",
      ...safeWeatherErrorFields(error, apiKey),
    });
    return { status: "unavailable" };
  } finally {
    clearTimeout(timeoutId);
  }
}

function logNormalizeFailure() {
  logger.error("[weather] invalid response, failed to normalize", {
    feature: "weather",
    reason: "invalid_response",
    errorName: "NormalizeError",
    errorMessage: "failed to normalize weather",
  });
}

/** 实时天气查询（坐标 / 城市共用） */
async function fetchCurrentWeather(
  query: string,
  kind: "coordinates" | "city"
): Promise<WeatherLookupResult> {
  const response = await requestWeatherApi("current.json", query, kind);
  if (response.status !== "ok") return response;

  const weather = normalizeWeatherApiResponse(response.data, WEATHER_SOURCE);
  if (!weather) {
    logNormalizeFailure();
    return { status: "unavailable" };
  }

  logger.debug("[weather] success", {
    queryKind: kind,
    temperatureC: weather.temperatureC,
    condition: weather.condition,
  });

  return {
    status: "success",
    weather,
    displayName: buildDisplayName(response.data, weather.locationName ?? query),
    query,
  };
}

/** 预报覆盖的天数（WeatherAPI 免费版最多 3 天：今天 + 2 天） */
export const WEATHER_FORECAST_DAYS = 3;

/**
 * 指定日期的天气：目标日期等于当地今天 → 使用实时天气；
 * 在预报范围内 → 使用当日预报；否则 out_of_range。
 */
async function fetchWeatherForDate(
  query: string,
  kind: "coordinates" | "city",
  isoDate: string
): Promise<WeatherDateLookupResult> {
  const response = await requestWeatherApi(
    "forecast.json",
    query,
    kind,
    `&days=${WEATHER_FORECAST_DAYS}&aqi=no&alerts=no`
  );
  if (response.status !== "ok") return response;

  const data = response.data;
  const location = isRecord(data) && isRecord(data.location) ? data.location : null;
  const localDate =
    typeof location?.localtime === "string" ? location.localtime.slice(0, 10) : null;
  const locationName = typeof location?.name === "string" ? location.name : undefined;

  let weather: WeatherContext | null = null;
  if (localDate === isoDate) {
    weather = normalizeWeatherApiResponse(data, WEATHER_SOURCE);
  } else {
    const days =
      isRecord(data) && isRecord(data.forecast) && Array.isArray(data.forecast.forecastday)
        ? data.forecast.forecastday
        : [];
    const day = days.find((entry) => isRecord(entry) && entry.date === isoDate);
    if (!day) return { status: "out_of_range" };
    weather = normalizeForecastDay(day, locationName, WEATHER_SOURCE);
  }

  if (!weather) {
    logNormalizeFailure();
    return { status: "unavailable" };
  }

  return {
    status: "success",
    weather,
    displayName: buildDisplayName(data, weather.locationName ?? query),
    query,
  };
}

/** 城市查询候选：命中中文别名时优先英文名，其次原文；"上海市" 视同 "上海" */
export function buildCityQueryCandidates(city: string): string[] {
  const stripped = city.replace(/(特别行政区|市)$/u, "").trim() || city;
  const alias = CHINESE_CITY_ALIASES[stripped] ?? CHINESE_CITY_ALIASES[city];
  const candidates = [alias, city, stripped].filter(
    (value): value is string => typeof value === "string" && value.length > 0
  );
  return candidates
    .filter((value, index) => candidates.indexOf(value) === index)
    .slice(0, MAX_CITY_QUERY_ATTEMPTS);
}

export async function lookupWeatherByCoordinates(
  input: LocationInput
): Promise<WeatherLookupResult> {
  if (!isValidCoordinates(input?.latitude, input?.longitude)) {
    logger.warn("[weather] invalid coordinates, skipping weather lookup");
    return { status: "invalid_input" };
  }

  return fetchCurrentWeather(
    `${input.latitude},${input.longitude}`,
    "coordinates"
  );
}

export async function lookupWeatherByCity(
  city: unknown
): Promise<WeatherLookupResult> {
  return lookupCityWith(city, (candidate) => fetchCurrentWeather(candidate, "city"));
}

async function lookupCityWith<R extends { status: string }>(
  city: unknown,
  fetcher: (candidate: string) => Promise<R>
): Promise<R | { status: "invalid_input" } | { status: "not_found" }> {
  const validated = validateCityInput(city);
  if (!validated.ok) {
    return { status: "invalid_input" };
  }

  let lastResult: R | { status: "not_found" } = { status: "not_found" };
  for (const candidate of buildCityQueryCandidates(validated.city)) {
    lastResult = await fetcher(candidate);
    // 只有“找不到”才尝试下一个写法；服务不可用时直接返回，避免放大失败
    if (lastResult.status !== "not_found") {
      return lastResult;
    }
  }
  return lastResult;
}

/**
 * 按日期查询天气（需求确认 Agent / 推荐工作流共用）。
 * isoDate 为空时等价于实时天气查询。
 */
export async function lookupWeatherForDate(
  location: WeatherLocationInput | LocationInput | unknown,
  isoDate?: string | null
): Promise<WeatherDateLookupResult> {
  if (!isoDate) return lookupWeatherByLocation(location);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return { status: "invalid_input" };

  const normalized = normalizeWeatherLocationInput(location);
  if (!normalized) return { status: "invalid_input" };

  if (normalized.type === "city") {
    return lookupCityWith(normalized.city, (candidate) =>
      fetchWeatherForDate(candidate, "city", isoDate)
    ) as Promise<WeatherDateLookupResult>;
  }
  return fetchWeatherForDate(
    `${normalized.latitude},${normalized.longitude}`,
    "coordinates",
    isoDate
  );
}

export async function lookupWeatherByLocation(
  location: WeatherLocationInput | LocationInput | unknown
): Promise<WeatherLookupResult> {
  const normalized = normalizeWeatherLocationInput(location);
  if (!normalized) return { status: "invalid_input" };

  return normalized.type === "city"
    ? lookupWeatherByCity(normalized.city)
    : lookupWeatherByCoordinates(normalized);
}

export async function getWeatherByCoordinates(input: {
  latitude: number;
  longitude: number;
}): Promise<WeatherContext | null> {
  const result = await lookupWeatherByCoordinates(input);
  return result.status === "success" ? result.weather : null;
}

export async function getWeatherByCity(
  city: string
): Promise<WeatherContext | null> {
  const result = await lookupWeatherByCity(city);
  return result.status === "success" ? result.weather : null;
}

function normalizeForecastDay(
  forecastDay: unknown,
  locationName: string | undefined,
  source: string
): WeatherContext | null {
  if (!isRecord(forecastDay)) return null;

  const date = typeof forecastDay.date === "string" ? forecastDay.date : undefined;
  const day = isRecord(forecastDay.day) ? forecastDay.day : null;
  if (!day) return null;

  const maxTemp = isValidNumber(day.maxtemp_c) ? day.maxtemp_c : null;
  const minTemp = isValidNumber(day.mintemp_c) ? day.mintemp_c : null;
  const temperatureC =
    maxTemp !== null && minTemp !== null
      ? Math.round((maxTemp + minTemp) / 2)
      : maxTemp ?? minTemp;

  if (temperatureC === null) return null;

  const conditionObj = isRecord(day.condition) ? day.condition : null;
  const conditionText =
    typeof conditionObj?.text === "string" ? conditionObj.text : null;
  if (!conditionText) return null;

  return {
    source,
    locationName,
    temperatureC,
    feelsLikeC: maxTemp ?? undefined,
    condition: conditionText,
    humidity: isValidNumber(day.avghumidity) ? day.avghumidity : undefined,
    windKph: isValidNumber(day.maxwind_kph) ? day.maxwind_kph : undefined,
    date,
    observedAt: date,
  };
}

export async function getForecastByDestination(input: {
  destination: string;
  days: number;
}): Promise<WeatherContext[] | null> {
  const apiKey = getWeatherApiKey();
  if (!apiKey) {
    logger.warn("[weather] missing api key, skipping forecast");
    return null;
  }

  const destination = input.destination.trim();
  if (!destination) {
    return null;
  }

  const days = Math.min(10, Math.max(1, Math.floor(input.days)));

  const baseUrl = getWeatherBaseUrl().replace(/\/$/, "");
  const url = `${baseUrl}/forecast.json?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(destination)}&days=${days}&aqi=no&alerts=no`;

  logger.debug("[weather] fetching forecast", {
    days,
    hasApiKey: true,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      logger.error("[weather] forecast fetch failed", {
        feature: "weather",
        reason: "http_error",
        errorName: "HttpError",
        errorMessage: `${response.status} ${response.statusText}`.slice(0, 200),
      });
      return null;
    }

    const data: unknown = await response.json();
    if (!isRecord(data) || !isRecord(data.forecast)) {
      logger.error("[weather] invalid forecast response", {
      feature: "weather",
      reason: "invalid_response",
      errorName: "NormalizeError",
      errorMessage: "invalid forecast payload",
    });
      return null;
    }

    const location = isRecord(data.location) ? data.location : null;
    const locationName =
      typeof location?.name === "string" ? location.name : destination;

    const forecastDays = data.forecast.forecastday;
    if (!Array.isArray(forecastDays)) {
      return null;
    }

    const result = forecastDays
      .map((day) => normalizeForecastDay(day, locationName, "weatherapi.com"))
      .filter((day): day is WeatherContext => day !== null);

    if (result.length === 0) {
      logger.error("[weather] forecast normalize produced no days", {
      feature: "weather",
      reason: "empty_forecast",
      errorName: "NormalizeError",
      errorMessage: "no forecast days after normalize",
    });
      return null;
    }

    logger.debug("[weather] forecast success", {
      dayCount: result.length,
    });

    return result;
  } catch (error) {
    const isTimeout =
      error instanceof Error &&
      (error.name === "AbortError" || error.message.includes("aborted"));

    logger.error("[weather] forecast fetch failed", {
      feature: "weather",
      reason: isTimeout ? "timeout" : "error",
      ...safeErrorFields(error),
    });
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
