import type { WeatherContext } from "@/types/weather";

export function buildWeatherGuidance(weather: WeatherContext): string {
  const lines: string[] = [];

  if (weather.temperatureC >= 30) {
    lines.push("- 高温天气：避免厚外套、羊毛、厚针织、长靴等不透气的单品。");
  } else if (weather.temperatureC <= 10) {
    lines.push("- 低温天气：优先外套、叠穿、保暖材质，注意层次感。");
  } else if (weather.temperatureC <= 18) {
    lines.push("- 偏凉天气：建议轻薄外套或叠穿，避免过于单薄。");
  }

  const conditionLower = weather.condition.toLowerCase();
  if (
    conditionLower.includes("rain") ||
    conditionLower.includes("drizzle") ||
    conditionLower.includes("shower") ||
    weather.condition.includes("雨")
  ) {
    lines.push(
      "- 雨天：优先防水/耐脏的外套和鞋子，避免拖地裤脚、浅色易脏鞋。"
    );
  }

  if (weather.windKph !== undefined && weather.windKph >= 25) {
    lines.push(
      "- 风力较大：避免过轻薄、易被风吹乱的单品，注意整体造型稳定性。"
    );
  }

  if (weather.humidity !== undefined && weather.humidity >= 80) {
    lines.push("- 湿度较高：优先透气吸汗面料，避免闷热不透气的材质。");
  }

  if (lines.length === 0) {
    lines.push("- 天气较舒适：在风格需求基础上兼顾层搭灵活性。");
  }

  return lines.join("\n");
}

export function formatWeatherContextBlock(weather: WeatherContext): string {
  const parts = [
    `城市/位置：${weather.locationName ?? "当前位置"}`,
    `温度：${weather.temperatureC}°C`,
  ];

  if (weather.feelsLikeC !== undefined) {
    parts.push(`体感温度：${weather.feelsLikeC}°C`);
  }

  parts.push(`天气：${weather.condition}`);

  if (weather.humidity !== undefined) {
    parts.push(`湿度：${weather.humidity}%`);
  }

  if (weather.windKph !== undefined) {
    parts.push(`风速：${weather.windKph} km/h`);
  }

  return parts.join("\n");
}
