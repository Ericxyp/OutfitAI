export type LocationInput = {
  latitude: number;
  longitude: number;
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

export type GenerateRecommendationOptions = {
  excludeItemIds?: string[];
  location?: LocationInput;
};
