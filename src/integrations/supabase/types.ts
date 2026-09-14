export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alerts_log: {
        Row: {
          id: string
          message: string
          sym: string
          triggered_at: string
          user_id: string
        }
        Insert: {
          id?: string
          message: string
          sym: string
          triggered_at?: string
          user_id: string
        }
        Update: {
          id?: string
          message?: string
          sym?: string
          triggered_at?: string
          user_id?: string
        }
        Relationships: []
      }
      auction_scrape_cache: {
        Row: {
          content: string
          fetched_at: string
          id: string
          url: string
        }
        Insert: {
          content: string
          fetched_at?: string
          id?: string
          url: string
        }
        Update: {
          content?: string
          fetched_at?: string
          id?: string
          url?: string
        }
        Relationships: []
      }
      auction_seen: {
        Row: {
          addr_key: string
          address: string
          auction_date: string | null
          created_at: string
          first_seen_at: string
          id: string
          watch_id: string
        }
        Insert: {
          addr_key: string
          address?: string
          auction_date?: string | null
          created_at?: string
          first_seen_at?: string
          id?: string
          watch_id: string
        }
        Update: {
          addr_key?: string
          address?: string
          auction_date?: string | null
          created_at?: string
          first_seen_at?: string
          id?: string
          watch_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auction_seen_watch_id_fkey"
            columns: ["watch_id"]
            isOneToOne: false
            referencedRelation: "auction_watches"
            referencedColumns: ["id"]
          },
        ]
      }
      auction_watches: {
        Row: {
          active: boolean
          city: string
          county: string
          created_at: string
          days_ahead: number
          id: string
          label: string
          last_run_at: string | null
          last_run_note: string | null
          max_price: number
          notify_email: string
          state: string
          updated_at: string
          user_id: string
          zip: string
        }
        Insert: {
          active?: boolean
          city?: string
          county?: string
          created_at?: string
          days_ahead?: number
          id?: string
          label?: string
          last_run_at?: string | null
          last_run_note?: string | null
          max_price?: number
          notify_email: string
          state?: string
          updated_at?: string
          user_id: string
          zip?: string
        }
        Update: {
          active?: boolean
          city?: string
          county?: string
          created_at?: string
          days_ahead?: number
          id?: string
          label?: string
          last_run_at?: string | null
          last_run_note?: string | null
          max_price?: number
          notify_email?: string
          state?: string
          updated_at?: string
          user_id?: string
          zip?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      flipscan_store: {
        Row: {
          data: Json
          id: string
          key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          data?: Json
          id?: string
          key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          data?: Json
          id?: string
          key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      portfolios: {
        Row: {
          avg_price: number
          created_at: string
          id: string
          qty: number
          sym: string
          user_id: string
        }
        Insert: {
          avg_price: number
          created_at?: string
          id?: string
          qty: number
          sym: string
          user_id: string
        }
        Update: {
          avg_price?: number
          created_at?: string
          id?: string
          qty?: number
          sym?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      property_follows: {
        Row: {
          active: boolean
          addr_key: string
          address: string
          auction_date: string | null
          auction_date_label: string | null
          auction_type: string | null
          city: string
          county: string
          created_at: string
          id: string
          last_checked_at: string | null
          last_note: string | null
          notified_at: string | null
          notify_email: string
          opening_bid: number | null
          source_url: string | null
          state: string
          updated_at: string
          user_id: string
          zip: string
        }
        Insert: {
          active?: boolean
          addr_key: string
          address: string
          auction_date?: string | null
          auction_date_label?: string | null
          auction_type?: string | null
          city?: string
          county?: string
          created_at?: string
          id?: string
          last_checked_at?: string | null
          last_note?: string | null
          notified_at?: string | null
          notify_email: string
          opening_bid?: number | null
          source_url?: string | null
          state?: string
          updated_at?: string
          user_id: string
          zip?: string
        }
        Update: {
          active?: boolean
          addr_key?: string
          address?: string
          auction_date?: string | null
          auction_date_label?: string | null
          auction_type?: string | null
          city?: string
          county?: string
          created_at?: string
          id?: string
          last_checked_at?: string | null
          last_note?: string | null
          notified_at?: string | null
          notify_email?: string
          opening_bid?: number | null
          source_url?: string | null
          state?: string
          updated_at?: string
          user_id?: string
          zip?: string
        }
        Relationships: []
      }
      research_agent_seen: {
        Row: {
          addr_key: string
          address: string
          auto_added: boolean
          created_at: string
          first_seen_at: string
          grade: string
          id: string
          score: number
          source: string
          watch_id: string
        }
        Insert: {
          addr_key: string
          address?: string
          auto_added?: boolean
          created_at?: string
          first_seen_at?: string
          grade?: string
          id?: string
          score?: number
          source?: string
          watch_id: string
        }
        Update: {
          addr_key?: string
          address?: string
          auto_added?: boolean
          created_at?: string
          first_seen_at?: string
          grade?: string
          id?: string
          score?: number
          source?: string
          watch_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_agent_seen_watch_id_fkey"
            columns: ["watch_id"]
            isOneToOne: false
            referencedRelation: "auction_watches"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_api_keys: {
        Row: {
          anthropic: string | null
          attom: string | null
          created_at: string
          extras: Json
          rentcast: string | null
          supabase_anon: string | null
          supabase_url: string | null
          tracerfy: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          anthropic?: string | null
          attom?: string | null
          created_at?: string
          extras?: Json
          rentcast?: string | null
          supabase_anon?: string | null
          supabase_url?: string | null
          tracerfy?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          anthropic?: string | null
          attom?: string | null
          created_at?: string
          extras?: Json
          rentcast?: string | null
          supabase_anon?: string | null
          supabase_url?: string | null
          tracerfy?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      watchlists: {
        Row: {
          alert_price: number | null
          alert_type: string
          created_at: string
          id: string
          sym: string
          user_id: string
        }
        Insert: {
          alert_price?: number | null
          alert_type?: string
          created_at?: string
          id?: string
          sym: string
          user_id: string
        }
        Update: {
          alert_price?: number | null
          alert_type?: string
          created_at?: string
          id?: string
          sym?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
