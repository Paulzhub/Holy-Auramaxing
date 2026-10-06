export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          id: string;
          metadata: NonNullable<Json>;
          target_id: string | null;
          target_type: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          metadata?: NonNullable<Json>;
          target_id?: string | null;
          target_type?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          metadata?: NonNullable<Json>;
          target_id?: string | null;
          target_type?: string | null;
        };
        Relationships: [];
      };
      consents: {
        Row: {
          granted_at: string;
          id: string;
          kind: string;
          policy_version: string;
          user_id: string;
          withdrawn_at: string | null;
        };
        Insert: {
          granted_at?: string;
          id?: string;
          kind: string;
          policy_version: string;
          user_id: string;
          withdrawn_at?: string | null;
        };
        Update: {
          granted_at?: string;
          id?: string;
          kind?: string;
          policy_version?: string;
          user_id?: string;
          withdrawn_at?: string | null;
        };
        Relationships: [];
      };
      notification_settings: {
        Row: {
          discreet_mode: boolean;
          quiet_hours_end: string;
          quiet_hours_start: string;
          reminder_time: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          discreet_mode?: boolean;
          quiet_hours_end?: string;
          quiet_hours_start?: string;
          reminder_time?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          discreet_mode?: boolean;
          quiet_hours_end?: string;
          quiet_hours_start?: string;
          reminder_time?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_settings_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profile_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_settings_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      privacy_settings: {
        Row: {
          bio_visibility: string;
          profile_visibility: string;
          testimony_visibility: string;
          updated_at: string;
          user_id: string;
          verse_visibility: string;
        };
        Insert: {
          bio_visibility?: string;
          profile_visibility?: string;
          testimony_visibility?: string;
          updated_at?: string;
          user_id: string;
          verse_visibility?: string;
        };
        Update: {
          bio_visibility?: string;
          profile_visibility?: string;
          testimony_visibility?: string;
          updated_at?: string;
          user_id?: string;
          verse_visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: "privacy_settings_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profile_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "privacy_settings_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_private: {
        Row: {
          my_why_encrypted: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          my_why_encrypted?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          my_why_encrypted?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_private_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profile_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profile_private_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          adult_confirmed_at: string;
          avatar_path: string | null;
          avatar_pending_path: string | null;
          avatar_status: string;
          bio: string | null;
          created_at: string;
          deleted_at: string | null;
          deletion_requested_at: string | null;
          display_name: string | null;
          favourite_verse: string | null;
          handle: string;
          id: string;
          locale: string;
          onboarded_at: string | null;
          testimony: string | null;
          theme_pref: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          adult_confirmed_at: string;
          avatar_path?: string | null;
          avatar_pending_path?: string | null;
          avatar_status?: string;
          bio?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          deletion_requested_at?: string | null;
          display_name?: string | null;
          favourite_verse?: string | null;
          handle: string;
          id: string;
          locale?: string;
          onboarded_at?: string | null;
          testimony?: string | null;
          theme_pref?: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          adult_confirmed_at?: string;
          avatar_path?: string | null;
          avatar_pending_path?: string | null;
          avatar_status?: string;
          bio?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          deletion_requested_at?: string | null;
          display_name?: string | null;
          favourite_verse?: string | null;
          handle?: string;
          id?: string;
          locale?: string;
          onboarded_at?: string | null;
          testimony?: string | null;
          theme_pref?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      profile_cards: {
        Row: {
          avatar_path: string | null;
          bio: string | null;
          display_name: string | null;
          favourite_verse: string | null;
          handle: string | null;
          id: string | null;
          joined_at: string | null;
          testimony: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      complete_oauth_signup: { Args: { p_token: string; p_user_id: string }; Returns: boolean };
      complete_onboarding: { Args: Record<PropertyKey, never>; Returns: undefined };
      create_signup_ticket: {
        Args: { p_policy_version: string; p_timezone?: string; p_token_hash: string; p_ttl_minutes?: number };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
