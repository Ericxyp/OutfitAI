import type {
  Activity,
  ClarifiableField,
  CriticalField,
  DislikedStyle,
  Duration,
  Formality,
  Occasion,
  PartOfDay,
  SpecialRequirement,
  StyleTag,
} from "@/lib/requirements/schema";
import type { WeatherLocationInput } from "@/types/weather";

export type RequirementDate = {
  /** 标准日期 YYYY-MM-DD（用户所在时区） */
  iso: string;
  /** 用户原始表达，如“明天下午”；系统默认时为“未指定” */
  raw: string;
  /** 相对今天的天数，0 = 今天 */
  offsetDays: number;
  partOfDay: PartOfDay | null;
};

export type RequirementWeatherStatus =
  | "available"
  | "unavailable"
  | "not_found"
  | "out_of_range"
  | "skipped";

export type RequirementWeatherSummary = {
  locationName?: string;
  temperatureC: number;
  condition: string;
};

export type RequirementLocation = {
  /** 位置来源：用户文本 / 浏览器定位 / 手动城市 / 用户选择不考虑天气 */
  source: "text" | "current_location" | "manual_city" | "none";
  /** 展示名，如 “北京 · 朝阳公园” 或 WeatherAPI 标准名 */
  displayName: string;
  /** 具体地点（如 朝阳公园），可选 */
  placeName: string | null;
  /** 可用于天气查询的位置（复用天气模块类型）；source=none 时为 null */
  weatherLocation: WeatherLocationInput | null;
  weatherStatus: RequirementWeatherStatus;
};

export type FieldConfidence = Record<CriticalField, number>;

export type OutfitRequirement = {
  version: 1;
  originalText: string;
  occasion: Occasion | null;
  location: RequirementLocation | null;
  date: RequirementDate | null;
  style: StyleTag[];
  formality: Formality | null;
  activity: Activity | null;
  duration: Duration | null;
  specialRequirements: SpecialRequirement[];
  colorPreferences: string[];
  dislikedStyles: DislikedStyle[];
  /**
   * 长尾语义偏好（如“法式松弛感”“音乐节”），保留用户原词；
   * 只进入确认卡展示和 requirementNotes，不参与规则关键词匹配。
   */
  semanticPreferences: string[];
  /** 仅允许服务端根据当前用户衣橱匹配得到，绝不信任客户端 / 模型提供的 ID */
  dislikedItemIds: string[];
  assumptions: string[];
  confidence: FieldConfidence;
  missingCriticalFields: CriticalField[];
  ambiguousFields: ClarifiableField[];
};

export type ClarificationOption = {
  label: string;
  field: ClarifiableField;
  value: string;
};

export type ClarificationQuestion = {
  field: ClarifiableField;
  question: string;
  options: ClarificationOption[];
  /** 是否也接受自由输入 */
  allowFreeText: boolean;
};

export type RequirementAnswer =
  | { kind: "option"; field: ClarifiableField; value: string }
  | { kind: "text"; text: string };

export type RequirementWeatherPreview = {
  status: RequirementWeatherStatus;
  summary: RequirementWeatherSummary | null;
  /** 面向用户的说明，如“将不考虑实时天气” */
  note: string | null;
};

export type RequirementAnalysisResult =
  | {
      status: "needs_clarification";
      requirement: OutfitRequirement;
      questions: ClarificationQuestion[];
      round: number;
      weather: RequirementWeatherPreview;
      usedFallback: boolean;
    }
  | {
      status: "ready_for_confirmation";
      requirement: OutfitRequirement;
      round: number;
      weather: RequirementWeatherPreview;
      usedFallback: boolean;
    }
  | {
      status: "error";
      errorType: "unauthorized" | "invalid_input" | "unavailable";
      message: string;
    };
