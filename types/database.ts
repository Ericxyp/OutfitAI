export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ClosetItemStatus = "ready" | "processing" | "archived";
export type FeedbackRating = "like" | "dislike" | "save";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          display_name: string | null;
          avatar_url: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      closet_items: {
        Row: {
          id: string;
          user_id: string;
          image_url: string | null;
          name: string | null;
          category: string | null;
          color: string | null;
          material: string | null;
          style_tags: string[];
          season_tags: string[];
          occasion_tags: string[];
          notes: string | null;
          status: ClosetItemStatus;
          embedding: unknown | null;
          embedding_text: string | null;
          embedding_updated_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          image_url?: string | null;
          name?: string | null;
          category?: string | null;
          color?: string | null;
          material?: string | null;
          style_tags?: string[];
          season_tags?: string[];
          occasion_tags?: string[];
          notes?: string | null;
          status?: ClosetItemStatus;
          embedding?: unknown | null;
          embedding_text?: string | null;
          embedding_updated_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          image_url?: string | null;
          name?: string | null;
          category?: string | null;
          color?: string | null;
          material?: string | null;
          style_tags?: string[];
          season_tags?: string[];
          occasion_tags?: string[];
          notes?: string | null;
          status?: ClosetItemStatus;
          embedding?: unknown | null;
          embedding_text?: string | null;
          embedding_updated_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      outfit_recommendations: {
        Row: {
          id: string;
          user_id: string;
          request_text: string | null;
          title: string | null;
          selected_item_ids: string[];
          summary: string | null;
          reasoning: string | null;
          style_tags: string[];
          occasion: string | null;
          model_output: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          request_text?: string | null;
          title?: string | null;
          selected_item_ids?: string[];
          summary?: string | null;
          reasoning?: string | null;
          style_tags?: string[];
          occasion?: string | null;
          model_output?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          request_text?: string | null;
          title?: string | null;
          selected_item_ids?: string[];
          summary?: string | null;
          reasoning?: string | null;
          style_tags?: string[];
          occasion?: string | null;
          model_output?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      feedback: {
        Row: {
          id: string;
          user_id: string;
          recommendation_id: string;
          rating: FeedbackRating;
          reason_tags: string[];
          comment: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          recommendation_id: string;
          rating: FeedbackRating;
          reason_tags?: string[];
          comment?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          recommendation_id?: string;
          rating?: FeedbackRating;
          reason_tags?: string[];
          comment?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      user_style_profiles: {
        Row: {
          user_id: string;
          preferred_styles: string[];
          preferred_colors: string[];
          preferred_occasions: string[];
          avoid_styles: string[];
          avoid_colors: string[];
          favorite_item_ids: string[];
          disliked_item_ids: string[];
          style_summary: string | null;
          feedback_count: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          preferred_styles?: string[];
          preferred_colors?: string[];
          preferred_occasions?: string[];
          avoid_styles?: string[];
          avoid_colors?: string[];
          favorite_item_ids?: string[];
          disliked_item_ids?: string[];
          style_summary?: string | null;
          feedback_count?: number;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          preferred_styles?: string[];
          preferred_colors?: string[];
          preferred_occasions?: string[];
          avoid_styles?: string[];
          avoid_colors?: string[];
          favorite_item_ids?: string[];
          disliked_item_ids?: string[];
          style_summary?: string | null;
          feedback_count?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_personal_profiles: {
        Row: {
          user_id: string;
          height_cm: number | null;
          weight_kg: number | null;
          age: number | null;
          gender: string | null;
          body_notes: string | null;
          fit_goals: string[];
          size_notes: string | null;
          avoid_body_focus: string[];
          updated_at: string;
        };
        Insert: {
          user_id: string;
          height_cm?: number | null;
          weight_kg?: number | null;
          age?: number | null;
          gender?: string | null;
          body_notes?: string | null;
          fit_goals?: string[];
          size_notes?: string | null;
          avoid_body_focus?: string[];
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          height_cm?: number | null;
          weight_kg?: number | null;
          age?: number | null;
          gender?: string | null;
          body_notes?: string | null;
          fit_goals?: string[];
          size_notes?: string | null;
          avoid_body_focus?: string[];
          updated_at?: string;
        };
        Relationships: [];
      };
      travel_plans: {
        Row: {
          id: string;
          user_id: string;
          destination: string;
          start_date: string | null;
          days: number;
          purpose: string | null;
          style_preference: string | null;
          weather_context: Json | null;
          packing_list: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          destination: string;
          start_date?: string | null;
          days: number;
          purpose?: string | null;
          style_preference?: string | null;
          weather_context?: Json | null;
          packing_list?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          destination?: string;
          start_date?: string | null;
          days?: number;
          purpose?: string | null;
          style_preference?: string | null;
          weather_context?: Json | null;
          packing_list?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      travel_plan_days: {
        Row: {
          id: string;
          plan_id: string;
          day_index: number;
          date: string | null;
          title: string | null;
          selected_item_ids: string[];
          summary: string | null;
          reasoning: string | null;
          weather: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          plan_id: string;
          day_index: number;
          date?: string | null;
          title?: string | null;
          selected_item_ids?: string[];
          summary?: string | null;
          reasoning?: string | null;
          weather?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          plan_id?: string;
          day_index?: number;
          date?: string | null;
          title?: string | null;
          selected_item_ids?: string[];
          summary?: string | null;
          reasoning?: string | null;
          weather?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      shopping_checks: {
        Row: {
          id: string;
          user_id: string;
          product_image_url: string | null;
          product_analysis: Json | null;
          compatibility_score: number | null;
          matched_item_ids: string[];
          outfit_ideas: Json | null;
          recommendation: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          product_image_url?: string | null;
          product_analysis?: Json | null;
          compatibility_score?: number | null;
          matched_item_ids?: string[];
          outfit_ideas?: Json | null;
          recommendation?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          product_image_url?: string | null;
          product_analysis?: Json | null;
          compatibility_score?: number | null;
          matched_item_ids?: string[];
          outfit_ideas?: Json | null;
          recommendation?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      product_recommendations: {
        Row: {
          id: string;
          title: string;
          brand: string | null;
          category: string | null;
          color: string | null;
          style_tags: string[];
          occasion_tags: string[];
          price_min: number | null;
          price_max: number | null;
          image_url: string | null;
          product_url: string;
          merchant: string | null;
          commission_type: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          brand?: string | null;
          category?: string | null;
          color?: string | null;
          style_tags?: string[];
          occasion_tags?: string[];
          price_min?: number | null;
          price_max?: number | null;
          image_url?: string | null;
          product_url: string;
          merchant?: string | null;
          commission_type?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          brand?: string | null;
          category?: string | null;
          color?: string | null;
          style_tags?: string[];
          occasion_tags?: string[];
          price_min?: number | null;
          price_max?: number | null;
          image_url?: string | null;
          product_url?: string;
          merchant?: string | null;
          commission_type?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      commerce_clicks: {
        Row: {
          id: string;
          user_id: string | null;
          product_recommendation_id: string | null;
          shopping_check_id: string | null;
          source: string;
          target_url: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          product_recommendation_id?: string | null;
          shopping_check_id?: string | null;
          source?: string;
          target_url: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          product_recommendation_id?: string | null;
          shopping_check_id?: string | null;
          source?: string;
          target_url?: string;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      event_logs: {
        Row: {
          id: string;
          user_id: string | null;
          event_name: string;
          entity_type: string | null;
          entity_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          event_name: string;
          entity_type?: string | null;
          entity_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          event_name?: string;
          entity_type?: string | null;
          entity_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      style_knowledge_entries: {
        Row: {
          id: string;
          title: string;
          category: string;
          tags: string[];
          content: string;
          priority: number;
          is_active: boolean;
          embedding: unknown | null;
          embedding_text: string | null;
          embedding_updated_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          category: string;
          tags?: string[];
          content: string;
          priority?: number;
          is_active?: boolean;
          embedding?: unknown | null;
          embedding_text?: string | null;
          embedding_updated_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          category?: string;
          tags?: string[];
          content?: string;
          priority?: number;
          is_active?: boolean;
          embedding?: unknown | null;
          embedding_text?: string | null;
          embedding_updated_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      match_closet_items: {
        Args: {
          query_embedding: number[];
          match_user_id: string;
          match_count?: number;
        };
        Returns: {
          id: string;
          similarity: number;
        }[];
      };
      match_style_knowledge_entries: {
        Args: {
          query_embedding: number[];
          match_count?: number;
        };
        Returns: {
          id: string;
          similarity: number;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type ClosetItem = Database["public"]["Tables"]["closet_items"]["Row"];
export type OutfitRecommendation =
  Database["public"]["Tables"]["outfit_recommendations"]["Row"];
export type Feedback = Database["public"]["Tables"]["feedback"]["Row"];
export type UserStyleProfile =
  Database["public"]["Tables"]["user_style_profiles"]["Row"];
export type UserPersonalProfile =
  Database["public"]["Tables"]["user_personal_profiles"]["Row"];
export type TravelPlan = Database["public"]["Tables"]["travel_plans"]["Row"];
export type TravelPlanDay =
  Database["public"]["Tables"]["travel_plan_days"]["Row"];
export type ShoppingCheck =
  Database["public"]["Tables"]["shopping_checks"]["Row"];
export type ProductRecommendationRow =
  Database["public"]["Tables"]["product_recommendations"]["Row"];
export type CommerceClick =
  Database["public"]["Tables"]["commerce_clicks"]["Row"];
export type EventLog = Database["public"]["Tables"]["event_logs"]["Row"];
export type StyleKnowledgeEntryRow =
  Database["public"]["Tables"]["style_knowledge_entries"]["Row"];
