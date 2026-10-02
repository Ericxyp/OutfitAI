"use client";

import { useEffect, useRef, useState } from "react";
import {
  CITY_INPUT_MAX_LENGTH,
  formatWeatherSummary,
} from "@/lib/weather-location";
import type { useWeatherLocation } from "@/components/use-weather-location";

type WeatherLocationController = ReturnType<typeof useWeatherLocation>;

type WeatherLocationPickerProps = {
  controller: WeatherLocationController;
  /** 推荐生成中时禁用所有入口 */
  disabled?: boolean;
};

const chipClass =
  "shrink-0 rounded-full bg-card px-3.5 py-2 text-sm text-foreground ring-1 ring-border/80 transition-colors hover:bg-accent disabled:opacity-60";
const linkButtonClass =
  "shrink-0 rounded-full px-2.5 py-1 text-xs text-muted transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50";

export function WeatherLocationPicker({
  controller,
  disabled = false,
}: WeatherLocationPickerProps) {
  const {
    state,
    isBusy,
    locateCurrentPosition,
    openCityInput,
    cancelCityInput,
    submitCity,
    clearLocation,
  } = controller;
  const [cityInput, setCityInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const isLocating = state.status === "locating";
  const isQueryingCity = state.status === "querying_city";
  const entriesDisabled = disabled || isBusy;

  // 展开输入框时聚焦，并滚动到可视区域，避免移动端键盘遮挡
  useEffect(() => {
    if (!state.isCityInputOpen) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const timer = window.setTimeout(() => {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [state.isCityInputOpen]);

  // 选择成功后清空输入框
  useEffect(() => {
    if (state.status === "success" && !state.isCityInputOpen) {
      setCityInput("");
    }
  }, [state.status, state.isCityInputOpen]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (entriesDisabled) return;
    void submitCity(cityInput);
  };

  const location = state.location;
  const locationLabel = location
    ? location.type === "city"
      ? `已选择：${location.displayName}`
      : `当前位置：${location.displayName}`
    : null;

  return (
    <div className="mb-3 space-y-2" aria-live="polite">
      {location ? (
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-card px-3.5 py-2.5 ring-1 ring-border/60">
          <div className="min-w-0">
            <p className="truncate text-sm text-foreground">{locationLabel}</p>
            {state.weather && (
              <p className="mt-0.5 truncate text-xs text-muted">
                {formatWeatherSummary(state.weather, location.displayName)}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={openCityInput}
              disabled={entriesDisabled || state.isCityInputOpen}
              className={linkButtonClass}
            >
              更换城市
            </button>
            <button
              type="button"
              onClick={clearLocation}
              disabled={disabled}
              className={linkButtonClass}
            >
              清除位置
            </button>
          </div>
        </div>
      ) : null}

      {!location && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={locateCurrentPosition}
            disabled={entriesDisabled}
            className={chipClass}
          >
            {isLocating ? "定位中…" : "使用当前位置"}
          </button>
          <button
            type="button"
            onClick={openCityInput}
            disabled={entriesDisabled || state.isCityInputOpen}
            className={chipClass}
          >
            手动选择城市
          </button>
        </div>
      )}

      {location && isLocating && (
        <p className="text-xs text-muted">定位中…</p>
      )}

      {state.message && (
        <p role="status" className="px-1 text-xs text-muted">
          {state.message}
        </p>
      )}

      {state.isCityInputOpen && (
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={cityInput}
            onChange={(event) => setCityInput(event.target.value)}
            onFocus={(event) => {
              const el = event.currentTarget;
              window.setTimeout(() => {
                el.scrollIntoView({ block: "nearest", behavior: "smooth" });
              }, 300);
            }}
            placeholder="输入城市，例如：上海"
            aria-label="城市名称"
            maxLength={CITY_INPUT_MAX_LENGTH}
            autoComplete="address-level2"
            enterKeyHint="done"
            disabled={disabled}
            readOnly={isQueryingCity}
            className="min-w-0 flex-1 rounded-2xl bg-card px-3.5 py-2 text-base text-foreground ring-1 ring-border/80 placeholder:text-muted focus:outline-none focus:ring-foreground/40 disabled:opacity-60 sm:text-sm"
          />
          <button
            type="submit"
            disabled={entriesDisabled || !cityInput.trim()}
            className="shrink-0 rounded-2xl bg-foreground px-3.5 py-2 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {isQueryingCity ? "查询中…" : "确认"}
          </button>
          <button
            type="button"
            onClick={() => {
              setCityInput("");
              cancelCityInput();
            }}
            disabled={disabled || isLocating}
            className="shrink-0 rounded-2xl px-3 py-2 text-sm text-muted transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            取消
          </button>
        </form>
      )}
    </div>
  );
}
