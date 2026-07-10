export type TravelIntent = {
  isTravelPlan: boolean;
  destination?: string;
  days?: number;
};

const TRAVEL_KEYWORDS = ["旅行", "旅游", "出游", "出差", "行程"] as const;

const CHINESE_DAY_MAP: Record<string, number> = {
  一: 1,
  两: 2,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

const NON_DESTINATION_SUFFIXES = [
  "咖啡店",
  "咖啡馆",
  "商场",
  "公司",
  "上班",
  "学校",
  "健身房",
  "餐厅",
  "饭店",
  "酒吧",
  "超市",
] as const;

function parseChineseNumber(token: string): number | undefined {
  return CHINESE_DAY_MAP[token];
}

function extractDays(text: string): number | undefined {
  if (/一周/.test(text)) {
    return 7;
  }

  const dayRangeMatch = text.match(/[Dd]ay\s*1\s*[-–到至]\s*[Dd]ay\s*(\d+)/);
  if (dayRangeMatch) {
    const days = Number.parseInt(dayRangeMatch[1], 10);
    return Number.isFinite(days) ? days : undefined;
  }

  const arabicDayMatch = text.match(/(\d+)\s*天/);
  if (arabicDayMatch) {
    const days = Number.parseInt(arabicDayMatch[1], 10);
    return Number.isFinite(days) ? days : undefined;
  }

  const chineseDayMatch = text.match(/(一|两|二|三|四|五|六|七|八|九|十)\s*天/);
  if (chineseDayMatch) {
    return parseChineseNumber(chineseDayMatch[1]);
  }

  const arabicTourMatch = text.match(/(\d+)\s*日游/);
  if (arabicTourMatch) {
    const days = Number.parseInt(arabicTourMatch[1], 10);
    return Number.isFinite(days) ? days : undefined;
  }

  const chineseTourMatch = text.match(
    /(一|两|二|三|四|五|六|七|八|九|十)\s*日游/
  );
  if (chineseTourMatch) {
    return parseChineseNumber(chineseTourMatch[1]);
  }

  return undefined;
}

function hasMultiDayInfo(text: string, days: number | undefined): boolean {
  if (/多天/.test(text)) {
    return true;
  }

  if (days !== undefined && days >= 2) {
    return true;
  }

  if (/[Dd]ay\s*1/i.test(text) && /[Dd]ay\s*[2-9]/i.test(text)) {
    return true;
  }

  return false;
}

function hasTravelIntent(text: string): boolean {
  if (TRAVEL_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return true;
  }

  if (/[Dd]ay\s*1/i.test(text)) {
    return true;
  }

  if (/去[\u4e00-\u9fa5]{2,8}/.test(text)) {
    return true;
  }

  if (/[要去来][\u4e00-\u9fa5]{2,8}(?:旅游|旅行|玩)/.test(text)) {
    return true;
  }

  return false;
}

function isLikelyDestination(name: string): boolean {
  return !NON_DESTINATION_SUFFIXES.some(
    (suffix) => name.includes(suffix) || suffix.includes(name)
  );
}

function extractDestination(text: string): string | undefined {
  const contextualGoMatch = text.match(
    /去([\u4e00-\u9fa5]{2,8}?)(?:旅游|旅行|出差|玩)/
  );
  if (contextualGoMatch && isLikelyDestination(contextualGoMatch[1])) {
    return contextualGoMatch[1];
  }

  const cityBeforeTravelMatch = text.match(
    /([\u4e00-\u9fa5]{2,8})(?:旅游|旅行|出差)/
  );
  if (cityBeforeTravelMatch && isLikelyDestination(cityBeforeTravelMatch[1])) {
    return cityBeforeTravelMatch[1];
  }

  const goMatch = text.match(/去([\u4e00-\u9fa5]{2,8})/);
  if (goMatch && isLikelyDestination(goMatch[1])) {
    return goMatch[1];
  }

  return undefined;
}

export function detectTravelIntent(text: string): TravelIntent {
  const normalized = text.trim();
  if (!normalized) {
    return { isTravelPlan: false };
  }

  const days = extractDays(normalized);
  const isTravelPlan =
    hasTravelIntent(normalized) && hasMultiDayInfo(normalized, days);

  if (!isTravelPlan) {
    return { isTravelPlan: false };
  }

  const destination = extractDestination(normalized);

  return {
    isTravelPlan: true,
    ...(destination ? { destination } : {}),
    ...(days !== undefined ? { days } : {}),
  };
}

export function buildTravelGuideMessage(intent: TravelIntent): {
  content: string;
  actionHref: string;
} {
  const params = new URLSearchParams();
  if (intent.destination) {
    params.set("destination", intent.destination);
  }
  if (intent.days !== undefined) {
    params.set("days", String(intent.days));
  }

  const query = params.toString();
  const actionHref = query ? `/travel?${query}` : "/travel";

  let content: string;
  if (intent.destination && intent.days !== undefined) {
    content = `我识别到你要去${intent.destination} ${intent.days} 天。我可以根据目的地、天数、天气和你的衣橱生成 Day1-Day${intent.days} 穿搭与打包清单。请前往「旅行穿搭规划」继续。`;
  } else if (intent.destination) {
    content = `这看起来是多天旅行穿搭规划（目的地：${intent.destination}）。我可以根据目的地、天数、天气和你的衣橱生成 Day1-DayN 穿搭与打包清单。请前往「旅行穿搭规划」继续。`;
  } else if (intent.days !== undefined) {
    content = `我识别到你要出行 ${intent.days} 天。我可以根据目的地、天数、天气和你的衣橱生成 Day1-Day${intent.days} 穿搭与打包清单。请前往「旅行穿搭规划」继续。`;
  } else {
    content =
      "这看起来是多天旅行穿搭规划。我可以根据目的地、天数、天气和你的衣橱生成 Day1-DayN 穿搭与打包清单。请前往「旅行穿搭规划」继续。";
  }

  return { content, actionHref };
}
