export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      bf_suggestions: {
        Row: {
          id: string
          subpage_id: string
          section_index: number
          text: string
          votes: number
          user_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          subpage_id: string
          section_index: number
          text: string
          votes?: number
          user_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          subpage_id?: string
          section_index?: number
          text?: string
          votes?: number
          user_id?: string | null
          created_at?: string
        }
      }
      community_reports: {
        Row: {
          id: string
          reporter_id: string | null
          content_type: string
          content_id: string
          reason: string
          created_at: string
        }
        Insert: {
          id?: string
          reporter_id?: string | null
          content_type: string
          content_id: string
          reason: string
          created_at?: string
        }
        Update: {
          id?: string
          reporter_id?: string | null
          content_type?: string
          content_id?: string
          reason?: string
          created_at?: string
        }
      }
      bf_community_recipes: {
        Row: {
          id: string
          title: string
          content: string
          votes: number
          user_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          content: string
          votes?: number
          user_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          content?: string
          votes?: number
          user_id?: string | null
          created_at?: string
        }
      }
      bf_community_recipe_votes: {
        Row: {
          recipe_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          recipe_id: string
          user_id: string
          created_at?: string
        }
        Update: {
          recipe_id?: string
          user_id?: string
          created_at?: string
        }
      }
      bf_suggestion_votes: {
        Row: {
          suggestion_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          suggestion_id: string
          user_id: string
          created_at?: string
        }
        Update: {
          suggestion_id?: string
          user_id?: string
          created_at?: string
        }
      }
      profiles: {
        Row: {
          id: string
          created_at: string
          email: string | null
          full_name: string | null
          avatar_url: string | null
        }
        Insert: {
          id: string
          created_at?: string
          email?: string | null
          full_name?: string | null
          avatar_url?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          email?: string | null
          full_name?: string | null
          avatar_url?: string | null
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
