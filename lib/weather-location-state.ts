/**
 * 首页天气位置状态机（纯 reducer，便于测试并发 / 竞态行为）。
 *
 * 并发规则：
 * - locating / querying_city 期间不允许开始新的定位或城市查询；
 * - 每个异步操作携带 requestId，只有与 activeRequestId 一致的结果才会生效；
 * - 取消、清除、切换账号都会作废进行中的请求（activeRequestId 置空），
 *   因此旧请求晚到也不会写回旧位置。
 */
import type { StoredWeatherLocation } from "@/lib/weather-location-storage";
import {
  getWeatherLookupMessage,
  WEATHER_LOCATION_MESSAGES,
  type WeatherSummary,
} from "@/lib/weather-location";
import type { WeatherLookupFailureStatus } from "@/types/weather";

export type WeatherLocationStatus =
  | "idle"
  | "locating"
  | "querying_city"
  | "success"
  | "error";

export type WeatherLocationState = {
  status: WeatherLocationStatus;
  location: StoredWeatherLocation | null;
  weather: WeatherSummary | null;
  message: string | null;
  isCityInputOpen: boolean;
  activeRequestId: number | null;
};

export type WeatherLocationAction =
  | { type: "reset"; location: StoredWeatherLocation | null }
  | { type: "locate_start"; requestId: number }
  | { type: "locate_failed"; requestId: number }
  | {
      type: "locate_succeeded";
      requestId: number;
      location: StoredWeatherLocation;
      weather: WeatherSummary | null;
    }
  | { type: "city_input_open" }
  | { type: "city_input_cancel" }
  | { type: "city_query_start"; requestId: number }
  | {
      type: "city_query_succeeded";
      requestId: number;
      location: StoredWeatherLocation;
      weather: WeatherSummary | null;
    }
  | {
      type: "city_query_failed";
      requestId: number;
      status: WeatherLookupFailureStatus | "unauthorized";
    }
  | { type: "clear" };

export function createInitialWeatherLocationState(
  location: StoredWeatherLocation | null = null
): WeatherLocationState {
  return {
    status: location ? "success" : "idle",
    location,
    weather: null,
    message: null,
    isCityInputOpen: false,
    activeRequestId: null,
  };
}

export function isWeatherLocationBusy(state: WeatherLocationState): boolean {
  return state.status === "locating" || state.status === "querying_city";
}

function settledStatus(state: WeatherLocationState): WeatherLocationStatus {
  return state.location ? "success" : "idle";
}

export function weatherLocationReducer(
  state: WeatherLocationState,
  action: WeatherLocationAction
): WeatherLocationState {
  switch (action.type) {
    case "reset":
      return createInitialWeatherLocationState(action.location);

    case "locate_start":
      if (isWeatherLocationBusy(state)) return state;
      return {
        ...state,
        status: "locating",
        message: null,
        activeRequestId: action.requestId,
      };

    case "locate_failed":
      if (
        state.status !== "locating" ||
        state.activeRequestId !== action.requestId
      ) {
        return state;
      }
      // 定位失败：保留已有位置（如有），自动展开城市输入
      return {
        ...state,
        status: "error",
        message: WEATHER_LOCATION_MESSAGES.geolocation_failed,
        isCityInputOpen: true,
        activeRequestId: null,
      };

    case "locate_succeeded":
      if (
        state.status !== "locating" ||
        state.activeRequestId !== action.requestId
      ) {
        return state;
      }
      return {
        ...state,
        status: "success",
        location: action.location,
        weather: action.weather,
        message: action.weather
          ? null
          : WEATHER_LOCATION_MESSAGES.unavailable,
        isCityInputOpen: false,
        activeRequestId: null,
      };

    case "city_input_open":
      if (isWeatherLocationBusy(state)) return state;
      return { ...state, isCityInputOpen: true, message: null };

    case "city_input_cancel":
      // 取消会作废进行中的城市查询
      return {
        ...state,
        status:
          state.status === "querying_city" || state.status === "error"
            ? settledStatus(state)
            : state.status,
        isCityInputOpen: false,
        message: null,
        activeRequestId:
          state.status === "querying_city" ? null : state.activeRequestId,
      };

    case "city_query_start":
      if (isWeatherLocationBusy(state)) return state;
      return {
        ...state,
        status: "querying_city",
        message: null,
        isCityInputOpen: true,
        activeRequestId: action.requestId,
      };

    case "city_query_succeeded":
      if (
        state.status !== "querying_city" ||
        state.activeRequestId !== action.requestId
      ) {
        return state;
      }
      return {
        ...state,
        status: "success",
        location: action.location,
        weather: action.weather,
        message: null,
        isCityInputOpen: false,
        activeRequestId: null,
      };

    case "city_query_failed":
      if (
        state.status !== "querying_city" ||
        state.activeRequestId !== action.requestId
      ) {
        return state;
      }
      // 失败时不覆盖已有位置，保持输入框展开便于修改
      return {
        ...state,
        status: "error",
        message: getWeatherLookupMessage(action.status),
        isCityInputOpen: true,
        activeRequestId: null,
      };

    case "clear":
      return createInitialWeatherLocationState(null);

    default:
      return state;
  }
}
