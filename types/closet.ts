export interface ClothingAnalysis {
  name: string;
  category: string;
  color: string;
  material: string;
  style_tags: string[];
  season_tags: string[];
  occasion_tags: string[];
  notes: string;
  confidence: number;
  is_clothing: boolean;
  rejection_reason?: string;
}

export interface ClothingOptions {
  categories: string[];
  styleTags: string[];
  seasonTags: string[];
  occasionTags: string[];
}

export interface ClosetItemFormValues {
  name: string;
  category: string;
  color: string;
  material: string;
  style_tags: string[];
  season_tags: string[];
  occasion_tags: string[];
  notes: string;
}
