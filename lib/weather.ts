import type { WeatherContext } from "@/types/weather";
import { logger, safeErrorFields } from "@/lib/logger";

const DEFAULT_TIMEOUT_MS = 6000;
const DEFAULT_BASE_URL = "https://api.weatherapi.com/v1";

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
    typeof conditionObj?.text === "string" ? conditionObj.text : null;
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

export async function getWeatherByCoordinates(input: {
  latitude: number;
  longitude: number;
}): Promise<WeatherContext | null> {
  const apiKey = getWeatherApiKey();
  if (!apiKey) {
    logger.warn("[weather] missing api key, skipping weather lookup");
    return null;
  }

  if (
    !isValidNumber(input.latitude) ||
    !isValidNumber(input.longitude) ||
    input.latitude < -90 ||
    input.latitude > 90 ||
    input.longitude < -180 ||
    input.longitude > 180
  ) {
    logger.warn("[weather] invalid coordinates, skipping weather lookup");
    return null;
  }

  const baseUrl = getWeatherBaseUrl().replace(/\/$/, "");
  const url = `${baseUrl}/current.json?key=${encodeURIComponent(apiKey)}&q=${input.latitude},${input.longitude}`;

  logger.debug("[weather] fetching current weather", {
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
      logger.error("[weather] fetch failed", {
        feature: "weather",
        reason: "http_error",
        errorName: "HttpError",
        errorMessage: `${response.status} ${response.statusText}`.slice(0, 200),
      });
      return null;
    }

    const data: unknown = await response.json();
    const weather = normalizeWeatherApiResponse(data, "weatherapi.com");

    if (!weather) {
      logger.error("[weather] invalid response, failed to normalize", {
      feature: "weather",
      reason: "invalid_response",
      errorName: "NormalizeError",
      errorMessage: "failed to normalize current weather",
    });
      return null;
    }

    logger.debug("[weather] success", {
      temperatureC: weather.temperatureC,
      condition: weather.condition,
    });

    return weather;
  } catch (error) {
    const isTimeout =
      error instanceof Error &&
      (error.name === "AbortError" || error.message.includes("aborted"));

    logger.error("[weather] fetch failed", {
      feature: "weather",
      reason: isTimeout ? "timeout" : "error",
      ...safeErrorFields(error),
    });
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
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
