"use client";

import Link from "next/link";
import { useState } from "react";
import {
  createTravelPlan,
  type CreateTravelPlanResponse,
} from "@/lib/actions/travel";
import type { TravelPlanResult } from "@/lib/ai/workflows/travel-workflow";
import { sanitizeVisibleAiText } from "@/lib/text/sanitize-visible-ai-text";

const TRAVEL_PURPOSES = [
  "拍照",
  "城市漫游",
  "商务",
  "约会",
  "徒步",
  "休闲",
] as const;

function PackingListSection({
  packingList,
}: {
  packingList: TravelPlanResult["packingList"];
}) {
  const sections = [
    { label: "上装", items: packingList.tops },
    { label: "下装", items: packingList.bottoms },
    { label: "外套", items: packingList.outerwear },
    { label: "鞋子", items: packingList.shoes },
    { label: "配饰", items: packingList.accessories },
    { label: "备注", items: packingList.notes },
  ].filter((section) => section.items.length > 0);

  if (sections.length === 0) {
    return <p className="text-sm text-muted">暂无打包清单</p>;
  }

  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <div key={section.label}>
          <p className="mb-1.5 text-xs text-muted">{section.label}</p>
          <div className="flex flex-wrap gap-1.5">
            {section.items.map((item, index) => (
              <span
                key={`${section.label}-${index}`}
                className="rounded-full bg-accent px-2.5 py-1 text-xs text-foreground"
              >
                {sanitizeVisibleAiText(item)}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DayPlanCard({
  day,
}: {
  day: TravelPlanResult["dayPlans"][number];
}) {
  const title = sanitizeVisibleAiText(day.title);
  const summary = sanitizeVisibleAiText(day.summary);
  const reasoning = sanitizeVisibleAiText(day.reasoning);

  return (
    <div className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border/60">
      <div className="mb-3">
        <p className="text-sm font-semibold text-foreground">
          Day {day.dayIndex}
          {day.date ? ` · ${day.date}` : ""}
        </p>
        <p className="mt-1 text-base font-medium text-foreground">{title}</p>
        {day.weather && (
          <p className="mt-1 text-xs text-muted">
            {day.weather.locationName ?? "目的地"} · {day.weather.condition} ·{" "}
            {day.weather.temperatureC}°C
          </p>
        )}
      </div>

      {day.items.length > 0 && (
        <div className="mb-3 flex gap-2.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {day.items.map((item) => (
            <div key={item.id} className="w-[5.5rem] shrink-0">
              <div className="aspect-[3/4] overflow-hidden rounded-xl bg-accent ring-1 ring-border/40">
                {item.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.image_url}
                    alt={item.name ?? "衣服"}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted">
                    暂无图片
                  </div>
                )}
              </div>
              <p className="mt-1.5 truncate text-xs text-foreground">
                {item.name ?? "未命名"}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <div>
          <p className="mb-1 text-xs text-muted">这套怎么穿</p>
          <p className="text-sm leading-relaxed text-foreground">{summary}</p>
        </div>
        <div>
          <p className="mb-1 text-xs text-muted">为什么适合</p>
          <p className="text-sm leading-relaxed text-foreground/90">
            {reasoning}
          </p>
        </div>
      </div>
    </div>
  );
}

type TravelPlannerFormProps = {
  initialDestination?: string;
  initialDays?: number;
};

export function TravelPlannerForm({
  initialDestination = "",
  initialDays = 3,
}: TravelPlannerFormProps) {
  const [destination, setDestination] = useState(initialDestination);
  const [startDate, setStartDate] = useState("");
  const [days, setDays] = useState(initialDays);
  const [purpose, setPurpose] = useState<string>(TRAVEL_PURPOSES[1]);
  const [stylePreference, setStylePreference] = useState("");
  const [packLight, setPackLight] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsMoreClothes, setNeedsMoreClothes] = useState(false);
  const [plan, setPlan] = useState<TravelPlanResult | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    setIsLoading(true);
    setError(null);
    setNeedsMoreClothes(false);

    const result: CreateTravelPlanResponse = await createTravelPlan({
      destination,
      startDate: startDate || undefined,
      days,
      purpose,
      stylePreference: stylePreference || undefined,
      packLight,
    });

    setIsLoading(false);

    if (!result.success) {
      setError(result.error);
      setNeedsMoreClothes(Boolean(result.needsMoreClothes));
      return;
    }

    setPlan(result.plan);
  };

  return (
    <div className="space-y-4">
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border/60"
      >
        <div>
          <label className="mb-1.5 block text-xs text-muted">目的地</label>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="东京 / 上海 / 北京"
            required
            disabled={isLoading}
            className="w-full rounded-2xl bg-background px-4 py-3 text-sm text-foreground ring-1 ring-border/80 placeholder:text-muted focus:outline-none disabled:opacity-60"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs text-muted">出发日期</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={isLoading}
              className="w-full rounded-2xl bg-background px-4 py-3 text-sm text-foreground ring-1 ring-border/80 focus:outline-none disabled:opacity-60"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-muted">旅行天数</label>
            <input
              type="number"
              min={1}
              max={10}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              required
              disabled={isLoading}
              className="w-full rounded-2xl bg-background px-4 py-3 text-sm text-foreground ring-1 ring-border/80 focus:outline-none disabled:opacity-60"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs text-muted">旅行目的</label>
          <select
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            disabled={isLoading}
            className="w-full rounded-2xl bg-background px-4 py-3 text-sm text-foreground ring-1 ring-border/80 focus:outline-none disabled:opacity-60"
          >
            {TRAVEL_PURPOSES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs text-muted">风格偏好</label>
          <input
            type="text"
            value={stylePreference}
            onChange={(e) => setStylePreference(e.target.value)}
            placeholder="韩系简约 / 低饱和 / 不要太正式"
            disabled={isLoading}
            className="w-full rounded-2xl bg-background px-4 py-3 text-sm text-foreground ring-1 ring-border/80 placeholder:text-muted focus:outline-none disabled:opacity-60"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={packLight}
            onChange={(e) => setPackLight(e.target.checked)}
            disabled={isLoading}
            className="h-4 w-4 rounded border-border"
          />
          尽量少带衣服
        </label>

        <button
          type="submit"
          disabled={isLoading || !destination.trim()}
          className="w-full rounded-2xl bg-foreground py-3.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isLoading ? "规划中…" : "生成旅行穿搭"}
        </button>
      </form>

      {error && (
        <div className="rounded-2xl bg-red-50 px-4 py-3 ring-1 ring-red-100">
          <p className="text-sm text-red-700">{error}</p>
          {needsMoreClothes && (
            <Link
              href="/closet/new"
              className="mt-2 inline-block text-sm font-medium text-red-800 underline-offset-2 hover:underline"
            >
              去添加衣服 →
            </Link>
          )}
        </div>
      )}

      {plan && (
        <div className="space-y-4">
          <section className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border/60">
            <h2 className="text-sm font-medium text-foreground">旅行概览</h2>
            <p className="mt-2 text-sm text-foreground">
              {plan.destination} · {plan.days} 天
            </p>
            {plan.purpose && (
              <p className="mt-1 text-sm text-muted">目的：{plan.purpose}</p>
            )}
            {plan.stylePreference && (
              <p className="mt-1 text-sm text-muted">
                风格：{plan.stylePreference}
              </p>
            )}
            {!plan.weatherContext && (
              <p className="mt-2 text-xs text-muted">
                未能获取天气预报，已按衣橱和风格偏好生成计划。
              </p>
            )}
          </section>

          <section className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border/60">
            <h2 className="mb-4 text-sm font-medium text-foreground">
              打包清单
            </h2>
            <PackingListSection packingList={plan.packingList} />
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-medium text-foreground">每日穿搭</h2>
            {plan.dayPlans.map((day) => (
              <DayPlanCard key={day.dayIndex} day={day} />
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
