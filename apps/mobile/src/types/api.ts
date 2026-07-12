export type FeedbackRating = "like" | "dislike" | "save";

export type ClosetItem = {
  id: string;
  user_id: string;
  image_url: string;
  name: string;
  category: string;
  color: string | null;
  material: string | null;
  style_tags: string[];
  season_tags: string[];
  occasion_tags: string[];
  notes: string | null;
  status: "ready" | "processing" | "archived";
  created_at: string;
};

export type RecommendationResult = {
  id: string;
  requestText: string;
  title: string;
  selectedItemIds: string[];
  summary: string;
  reasoning: string;
  styleTags: string[];
  occasion: string;
  alternatives: string[];
  items: ClosetItem[];
};

export type StyleProfileContext = {
  preferredStyles: string[];
  preferredColors: string[];
  preferredOccasions: string[];
  avoidStyles: string[];
  avoidColors: string[];
  favoriteItemIds: string[];
  dislikedItemIds: string[];
  styleSummary: string | null;
  feedbackCount: number;
};

export type PersonalProfileContext = {
  heightCm: number | null;
  weightKg: number | null;
  age: number | null;
  gender: string | null;
  bodyNotes: string | null;
  fitGoals: string[];
  sizeNotes: string | null;
  avoidBodyFocus: string[];
};

export type MobileProfileResponse = {
  success: true;
  profile: {
    id: string;
    email: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    createdAt: string | null;
  };
  styleProfile: StyleProfileContext | null;
  personalProfile: PersonalProfileContext | null;
  stats: {
    closetCount: number;
    recommendationCount: number;
    feedbackCount: number;
  };
};

export type ApiErrorResponse = {
  success: false;
  error: string;
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

export type TravelPackingList = {
  tops: string[];
  bottoms: string[];
  outerwear: string[];
  shoes: string[];
  accessories: string[];
  notes: string[];
};

export type TravelDayResult = {
  dayIndex: number;
  date?: string;
  title: string;
  summary: string;
  reasoning: string;
  weather?: WeatherContext | null;
  items: ClosetItem[];
};

export type TravelPlanResult = {
  id: string;
  destination: string;
  days: number;
  startDate?: string | null;
  purpose?: string | null;
  stylePreference?: string | null;
  packingList: TravelPackingList;
  dayPlans: TravelDayResult[];
};

export type ProductAnalysis = {
  name: string;
  category: string;
  color: string;
  material: string;
  style_tags: string[];
  season: string;
  season_tags: string[];
  silhouette: string;
  occasion_tags: string[];
  notes: string;
  confidence: number;
};

export type ShoppingOutfitIdea = {
  title: string;
  summary: string;
  items: ClosetItem[];
};

export type ShoppingCheckResult = {
  id: string;
  productImageUrl: string | null;
  product: ProductAnalysis;
  compatibilityScore: number;
  matchCount: number;
  suitableStyles: string[];
  purchaseRecommendation: "buy" | "consider" | "skip";
  reasons: string[];
  risks: string[];
  outfitIdeas: ShoppingOutfitIdea[];
};

export type GenerateTravelPlanInput = {
  destination: string;
  startDate?: string;
  days: number;
  purpose?: string;
  stylePreference?: string;
  packLight?: boolean;
};

export type GenerateShoppingCheckInput = {
  imageUri: string;
  productName?: string;
  price?: string;
  brand?: string;
  productUrl?: string;
  question?: string;
};

export const PURCHASE_RECOMMENDATION_LABELS: Record<
  ShoppingCheckResult["purchaseRecommendation"],
  string
> = {
  buy: "建议购买",
  consider: "可以考虑",
  skip: "建议跳过",
};

export const CATEGORY_LABELS: Record<string, string> = {
  top: "上装",
  bottom: "下装",
  outerwear: "外套",
  shoes: "鞋履",
  bag: "包袋",
  accessory: "配饰",
  dress: "连衣裙",
  set: "套装",
  other: "其他",
};
