export type ProductRecommendationCard = {
  id: string;
  title: string;
  brand: string | null;
  category: string | null;
  color: string | null;
  styleTags: string[];
  occasionTags: string[];
  priceMin: number | null;
  priceMax: number | null;
  imageUrl: string | null;
  productUrl: string;
  merchant: string | null;
  matchReasons?: string[];
  score?: number;
};
