"use server";

import { trackEvent } from "@/lib/analytics/track-event";
import { createClient } from "@/lib/supabase/server";
import { lookupWeatherByLocation } from "@/lib/weather";
import {
  buildWeatherLocationEventMetadata,
  getWeatherLookupMessage,
  isGeolocationFailureReason,
  normalizeWeatherLocationInput,
  type WeatherLocationSource,
  type WeatherSummary,
} from "@/lib/weather-location";
import type {
  WeatherLocationInput,
  WeatherLookupFailureStatus,
} from "@/types/weather";

/**
 * 返回给前端的最小数据集：不包含 Key、请求 URL、错误堆栈或供应商原始响应。
 */
export type ResolveWeatherLocationResponse =
  | {
      status: "success";
      /** 后续推荐请求应使用的位置（城市场景为验证通过的查询串） */
      location: WeatherLocationInput;
      displayName: string;
      /** 坐标定位成功但天气暂不可用时为 null */
      weather: WeatherSummary | null;
    }
  | {
      status: WeatherLookupFailureStatus | "unauthorized";
      message: string;
    };

const COORDINATES_FALLBACK_NAME = "当前位置";

async function getCurrentUserId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

function toSummary(weather: {
  locationName?: string;
  temperatureC: number;
  condition: string;
}): WeatherSummary {
  return {
    locationName: weather.locationName,
    temperatureC: weather.temperatureC,
    condition: weather.condition,
  };
}

/**
 * 解析天气位置（手动城市 / 浏览器坐标），用于首页展示标准地点与当前天气。
 * 需要登录：避免匿名请求消耗天气接口额度，并用于按 user 记录埋点。
 */
export async function resolveWeatherLocation(
  input: unknown
): Promise<ResolveWeatherLocationResponse> {
  const location = normalizeWeatherLocationInput(input);
  const source: WeatherLocationSource =
    location?.type === "coordinates" ||
    (typeof input === "object" &&
      input !== null &&
      (input as { type?: unknown }).type === "coordinates")
      ? "coordinates"
      : "manual_city";

  const userId = await getCurrentUserId();
  if (!userId) {
    return {
      status: "unauthorized",
      message: getWeatherLookupMessage("unauthorized"),
    };
  }

  await trackEvent({
    userId,
    eventName: "weather_location_requested",
    metadata: buildWeatherLocationEventMetadata({ source, hasWeather: false }),
  });

  if (!location) {
    await trackEvent({
      userId,
      eventName: "weather_location_failed",
      metadata: buildWeatherLocationEventMetadata({
        source,
        reason: "invalid_input",
        hasWeather: false,
      }),
    });
    return {
      status: "invalid_input",
      message: getWeatherLookupMessage("invalid_input"),
    };
  }

  const result = await lookupWeatherByLocation(location);

  if (result.status === "success") {
    await trackEvent({
      userId,
      eventName: "weather_location_succeeded",
      metadata: buildWeatherLocationEventMetadata({ source, hasWeather: true }),
    });

    return {
      status: "success",
      location:
        location.type === "city"
          ? { type: "city", city: result.query }
          : location,
      displayName: result.displayName,
      weather: toSummary(result.weather),
    };
  }

  // 坐标本身有效：即使天气查询失败，也保留坐标供推荐使用（与原定位行为一致）
  if (location.type === "coordinates" && result.status !== "invalid_input") {
    await trackEvent({
      userId,
      eventName: "weather_location_succeeded",
      metadata: buildWeatherLocationEventMetadata({
        source,
        hasWeather: false,
      }),
    });
    return {
      status: "success",
      location,
      displayName: COORDINATES_FALLBACK_NAME,
      weather: null,
    };
  }

  await trackEvent({
    userId,
    eventName: "weather_location_failed",
    metadata: buildWeatherLocationEventMetadata({
      source,
      reason: result.status,
      hasWeather: false,
    }),
  });

  return {
    status: result.status,
    message: getWeatherLookupMessage(result.status),
  };
}

/**
 * 上报浏览器定位失败（拒绝权限 / 超时 / 设备不支持）。
 * 只接受白名单内的原因，不接受任何位置数据。
 */
export async function reportGeolocationFailure(reason: unknown): Promise<void> {
  if (!isGeolocationFailureReason(reason)) return;

  const userId = await getCurrentUserId();
  if (!userId) return;

  await trackEvent({
    userId,
    eventName: "weather_location_requested",
    metadata: buildWeatherLocationEventMetadata({
      source: "coordinates",
      hasWeather: false,
    }),
  });
  await trackEvent({
    userId,
    eventName: "weather_location_failed",
    metadata: buildWeatherLocationEventMetadata({
      source: "coordinates",
      reason,
      hasWeather: false,
    }),
  });
}
