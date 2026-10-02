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
};
