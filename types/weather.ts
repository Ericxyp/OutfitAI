/**
 * 旧版位置输入（仅经纬度，无 type 字段）。
 * 保留用于兼容移动端 API 与早期调用方；新代码请使用 WeatherLocationInput。
 * @deprecated 使用 WeatherLocationInput
 */
export type LocationInput = {
  latitude: number;
  longitude: number;
};

/** 天气位置输入：浏览器定位得到的经纬度，或用户手动输入的城市。 */
export type WeatherLocationInput =
  | {
      type: "coordinates";
      latitude: number;
      longitude: number;
    }
  | {
      type: "city";
      city: string;
    };

export type WeatherContext = {
  source: string;
  locationName?: string;
  temperatureC: number;
  feelsLikeC?: number;
  condition: string;
  humidity?: number;
  windKph?: number;
  observedAt?: string;
  date?: string;
};

/** 天气查询状态（服务端内部 + Server Action 共用） */
export type WeatherLookupFailureStatus =
  | "not_found"
  | "unavailable"
  | "invalid_input";

export type WeatherLookupResult =
  | {
      status: "success";
      weather: WeatherContext;
      /** 供应商返回的标准地点名，例如 "Shanghai, China" */
      displayName: string;
      /** 实际查询成功的城市/坐标查询串（城市场景用于后续复用） */
      query: string;
    }
  | { status: WeatherLookupFailureStatus };

export type GenerateRecommendationOptions = {
  excludeItemIds?: string[];
  /** 新格式为 WeatherLocationInput；仍兼容旧版 { latitude, longitude } */
  location?: WeatherLocationInput | LocationInput;
  /**
   * 用户确认的目标日期（YYYY-MM-DD）。提供时按该日期查询天气（今天=实时，未来=预报）；
   * 不提供时保持原有实时天气行为。
   */
  targetDate?: string;
  /**
   * 用户明确排除的衣橱单品。工作流只会在当前用户自己的衣橱中过滤，
   * 不在衣橱中的 ID 会被忽略。
   */
  excludeClosetItemIds?: string[];
  /**
   * 需求确认 Agent 生成的补充说明（不喜欢的风格、特殊需求、系统假设等），
   * 只追加到最终 AI 提示词中，不参与规则关键词匹配，避免“不要太正式”被误判为“正式”。
   */
  requirementNotes?: string;
  /**
   * 需求确认 Agent 已解析的场景 / 风格词，只用于“精确自定义标签匹配奖励”。
   * 服务端会按自定义标签同一规则重新清洗，非法内容丢弃。
   */
  requirementTerms?: { occasions?: string[]; styles?: string[] };
};
