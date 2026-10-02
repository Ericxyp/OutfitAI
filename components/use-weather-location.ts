"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import {
  reportGeolocationFailure,
  resolveWeatherLocation,
} from "@/lib/actions/weather";
import {
  mapGeolocationErrorCode,
  roundCoordinate,
  validateCityInput,
} from "@/lib/weather-location";
import {
  clearStoredWeatherLocation,
  createStoredWeatherLocation,
  getBrowserStorage,
  readStoredWeatherLocation,
  toRequestLocation,
  writeStoredWeatherLocation,
} from "@/lib/weather-location-storage";
import {
  createInitialWeatherLocationState,
  isWeatherLocationBusy,
  weatherLocationReducer,
} from "@/lib/weather-location-state";

const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 10000,
  maximumAge: 300000,
};

const COORDINATES_FALLBACK_NAME = "当前位置";

export function useWeatherLocation(userId: string | null) {
  const [state, dispatch] = useReducer(
    weatherLocationReducer,
    undefined,
    () => createInitialWeatherLocationState(null)
  );

  const mountedRef = useRef(true);
  const nextRequestIdRef = useRef(0);
  /** 与 reducer 的 activeRequestId 同步，用于守卫 localStorage 写入 */
  const activeRequestIdRef = useRef<number | null>(null);
  const userIdRef = useRef<string | null>(userId);
  const busyRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRequestIdRef.current = null;
    };
  }, []);

  useEffect(() => {
    busyRef.current = isWeatherLocationBusy(state);
  }, [state]);

  // 登录用户切换：作废进行中的请求，并读取对应 user.id 的位置
  useEffect(() => {
    userIdRef.current = userId;
    activeRequestIdRef.current = null;
    busyRef.current = false;
    dispatch({
      type: "reset",
      location: readStoredWeatherLocation(getBrowserStorage(), userId),
    });
  }, [userId]);

  const beginRequest = useCallback((): number => {
    nextRequestIdRef.current += 1;
    const requestId = nextRequestIdRef.current;
    activeRequestIdRef.current = requestId;
    busyRef.current = true;
    return requestId;
  }, []);

  const isCurrentRequest = useCallback(
    (requestId: number, ownerUserId: string | null) =>
      mountedRef.current &&
      activeRequestIdRef.current === requestId &&
      userIdRef.current === ownerUserId,
    []
  );

  const finishRequest = useCallback((requestId: number) => {
    if (activeRequestIdRef.current === requestId) {
      activeRequestIdRef.current = null;
      busyRef.current = false;
    }
  }, []);

  const locateCurrentPosition = useCallback(() => {
    if (busyRef.current) return;

    const requestId = beginRequest();
    const ownerUserId = userIdRef.current;
    dispatch({ type: "locate_start", requestId });

    const fail = (code: number | undefined) => {
      if (!isCurrentRequest(requestId, ownerUserId)) return;
      finishRequest(requestId);
      dispatch({ type: "locate_failed", requestId });
      reportGeolocationFailure(mapGeolocationErrorCode(code)).catch(() => {});
    };

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      fail(undefined);
      return;
    }

    try {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          if (!isCurrentRequest(requestId, ownerUserId)) return;

          const coordinates = {
            type: "coordinates" as const,
            latitude: roundCoordinate(position.coords.latitude),
            longitude: roundCoordinate(position.coords.longitude),
          };

          let displayName = COORDINATES_FALLBACK_NAME;
          let weather = null;
          try {
            const response = await resolveWeatherLocation(coordinates);
            if (response.status === "success") {
              displayName = response.displayName;
              weather = response.weather;
            }
          } catch {
            // 天气展示失败不影响使用坐标
          }

          if (!isCurrentRequest(requestId, ownerUserId)) return;
          finishRequest(requestId);

          const stored = createStoredWeatherLocation(coordinates, displayName);
          writeStoredWeatherLocation(getBrowserStorage(), ownerUserId, stored);
          dispatch({
            type: "locate_succeeded",
            requestId,
            location: stored,
            weather,
          });
        },
        (error) => fail(error?.code),
        GEOLOCATION_OPTIONS
      );
    } catch {
      fail(undefined);
    }
  }, [beginRequest, finishRequest, isCurrentRequest]);

  const openCityInput = useCallback(() => {
    if (busyRef.current) return;
    dispatch({ type: "city_input_open" });
  }, []);

  const cancelCityInput = useCallback(() => {
    // 仅作废城市查询；定位进行中时取消按钮不可用
    if (busyRef.current && state.status === "querying_city") {
      activeRequestIdRef.current = null;
      busyRef.current = false;
    }
    dispatch({ type: "city_input_cancel" });
  }, [state.status]);

  const submitCity = useCallback(
    async (rawCity: string) => {
      if (busyRef.current) return;

      const requestId = beginRequest();
      const ownerUserId = userIdRef.current;
      dispatch({ type: "city_query_start", requestId });

      const validated = validateCityInput(rawCity);
      if (!validated.ok) {
        finishRequest(requestId);
        dispatch({ type: "city_query_failed", requestId, status: "invalid_input" });
        return;
      }

      let response: Awaited<ReturnType<typeof resolveWeatherLocation>>;
      try {
        response = await resolveWeatherLocation({
          type: "city",
          city: validated.city,
        });
      } catch {
        response = { status: "unavailable", message: "" };
      }

      if (!isCurrentRequest(requestId, ownerUserId)) return;
      finishRequest(requestId);

      if (response.status !== "success" || response.location.type !== "city") {
        dispatch({
          type: "city_query_failed",
          requestId,
          status: response.status === "success" ? "unavailable" : response.status,
        });
        return;
      }

      const stored = createStoredWeatherLocation(
        response.location,
        response.displayName
      );
      writeStoredWeatherLocation(getBrowserStorage(), ownerUserId, stored);
      dispatch({
        type: "city_query_succeeded",
        requestId,
        location: stored,
        weather: response.weather,
      });
    },
    [beginRequest, finishRequest, isCurrentRequest]
  );

  const clearLocation = useCallback(() => {
    activeRequestIdRef.current = null;
    busyRef.current = false;
    clearStoredWeatherLocation(getBrowserStorage(), userIdRef.current);
    dispatch({ type: "clear" });
  }, []);

  const requestLocation = useMemo(
    () => toRequestLocation(state.location),
    [state.location]
  );

  return {
    state,
    isBusy: isWeatherLocationBusy(state),
    requestLocation,
    locateCurrentPosition,
    openCityInput,
    cancelCityInput,
    submitCity,
    clearLocation,
  };
}
