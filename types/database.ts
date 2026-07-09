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
          comment: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          recommendation_id: string;
          rating: FeedbackRating;
          comment?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          recommendation_id?: string;
          rating?: FeedbackRating;
          comment?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type ClosetItem = Database["public"]["Tables"]["closet_items"]["Row"];
export type OutfitRecommendation =
  Database["public"]["Tables"]["outfit_recommendations"]["Row"];
export type Feedback = Database["public"]["Tables"]["feedback"]["Row"];
