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
      group_covenant_agreements: {
        Row: {
          agreed_at: string;
          group_id: string;
          proposal_id: string;
          user_id: string;
        };
        Insert: {
          agreed_at?: string;
          group_id: string;
          proposal_id: string;
          user_id: string;
        };
        Update: {
          agreed_at?: string;
          group_id?: string;
          proposal_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "group_covenant_agreements_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_covenant_agreements_proposal_id_fkey";
            columns: ["proposal_id"];
            isOneToOne: false;
            referencedRelation: "group_covenant_proposals";
            referencedColumns: ["id"];
          },
        ];
      };
      group_covenant_proposals: {
        Row: {
          closed_at: string | null;
          covenant_text: string;
          created_at: string;
          expires_at: string;
          group_id: string;
          id: string;
          leaderboard_hiding_allowed: boolean;
          min_share_level: string;
          outcome: string | null;
          proposed_by: string | null;
        };
        Insert: {
          closed_at?: string | null;
          covenant_text: string;
          created_at?: string;
          expires_at?: string;
          group_id: string;
          id?: string;
          leaderboard_hiding_allowed: boolean;
          min_share_level: string;
          outcome?: string | null;
          proposed_by?: string | null;
        };
        Update: {
          closed_at?: string | null;
          covenant_text?: string;
          created_at?: string;
          expires_at?: string;
          group_id?: string;
          id?: string;
          leaderboard_hiding_allowed?: boolean;
          min_share_level?: string;
          outcome?: string | null;
          proposed_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "group_covenant_proposals_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
        ];
      };
      group_invites: {
        Row: {
          code_hash: string;
          created_at: string;
          created_by: string | null;
          expires_at: string;
          group_id: string;
          id: string;
          max_uses: number | null;
          revoked_at: string | null;
          token_hash: string;
          use_count: number;
        };
        Insert: {
          code_hash: string;
          created_at?: string;
          created_by?: string | null;
          expires_at: string;
          group_id: string;
          id?: string;
          max_uses?: number | null;
          revoked_at?: string | null;
          token_hash: string;
          use_count?: number;
        };
        Update: {
          code_hash?: string;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string;
          group_id?: string;
          id?: string;
          max_uses?: number | null;
          revoked_at?: string | null;
          token_hash?: string;
          use_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "group_invites_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
        ];
      };
      group_members: {
        Row: {
          covenant_accepted_at: string | null;
          group_id: string;
          invite_id: string | null;
          joined_at: string | null;
          leaderboard_hidden: boolean;
          requested_at: string;
          role: string;
          share_level: string;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          covenant_accepted_at?: string | null;
          group_id: string;
          invite_id?: string | null;
          joined_at?: string | null;
          leaderboard_hidden?: boolean;
          requested_at?: string;
          role?: string;
          share_level: string;
          status: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          covenant_accepted_at?: string | null;
          group_id?: string;
          invite_id?: string | null;
          joined_at?: string | null;
          leaderboard_hidden?: boolean;
          requested_at?: string;
          role?: string;
          share_level?: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_members_invite_id_fkey";
            columns: ["invite_id"];
            isOneToOne: false;
            referencedRelation: "group_invites";
            referencedColumns: ["id"];
          },
        ];
      };
      groups: {
        Row: {
          archived_at: string | null;
          challenge_days: number | null;
          challenge_type: string;
          covenant_text: string;
          covenant_updated_at: string;
          cover_path: string | null;
          cover_pending_path: string | null;
          cover_status: string;
          created_at: string;
          description: string | null;
          end_date: string | null;
          group_timezone: string;
          id: string;
          join_policy: string;
          leaderboard_hiding_allowed: boolean;
          max_members: number;
          member_count: number;
          min_share_level: string;
          name: string;
          owner_id: string;
          slug: string;
          start_date: string;
          updated_at: string;
        };
        Insert: {
          archived_at?: string | null;
          challenge_days?: number | null;
          challenge_type: string;
          covenant_text: string;
          covenant_updated_at?: string;
          cover_path?: string | null;
          cover_pending_path?: string | null;
          cover_status?: string;
          created_at?: string;
          description?: string | null;
          end_date?: string | null;
          group_timezone: string;
          id?: string;
          join_policy?: string;
          leaderboard_hiding_allowed?: boolean;
          max_members?: number;
          member_count?: number;
          min_share_level?: string;
          name: string;
          owner_id: string;
          slug: string;
          start_date: string;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          challenge_days?: number | null;
          challenge_type?: string;
          covenant_text?: string;
          covenant_updated_at?: string;
          cover_path?: string | null;
          cover_pending_path?: string | null;
          cover_status?: string;
          created_at?: string;
          description?: string | null;
          end_date?: string | null;
          group_timezone?: string;
          id?: string;
          join_policy?: string;
          leaderboard_hiding_allowed?: boolean;
          max_members?: number;
          member_count?: number;
          min_share_level?: string;
          name?: string;
          owner_id?: string;
          slug?: string;
          start_date?: string;
          updated_at?: string;
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
      agree_to_covenant_change: { Args: { p_proposal: string }; Returns: boolean };
      allow_group_member_back: { Args: { p_group: string; p_user: string }; Returns: undefined };
      approve_join_request: { Args: { p_group: string; p_user: string }; Returns: undefined };
      archive_group: { Args: { p_group: string }; Returns: undefined };
      auth_gate: {
        Args: Record<PropertyKey, never>;
        Returns: {
          mfa_pending: boolean;
          session_active: boolean;
        }[];
      };
      cancel_account_deletion: { Args: Record<PropertyKey, never>; Returns: boolean };
      change_group_covenant: {
        Args: {
          p_covenant_text: string;
          p_group: string;
          p_leaderboard_hiding_allowed: boolean;
          p_min_share_level: string;
        };
        Returns: string;
      };
      claim_storage_purges: {
        Args: { p_limit?: number };
        Returns: {
          bucket: string;
          id: string;
          prefix: string;
        }[];
      };
      clear_recovery_codes: { Args: { p_user_id: string }; Returns: undefined };
      complete_oauth_signup: { Args: { p_token: string; p_user_id: string }; Returns: boolean };
      complete_onboarding: { Args: Record<PropertyKey, never>; Returns: undefined };
      complete_storage_purge: { Args: { p_id: string }; Returns: undefined };
      create_group: {
        Args: {
          p_challenge_days: number;
          p_challenge_type: string;
          p_covenant_text: string;
          p_description: string;
          p_join_policy: string;
          p_leaderboard_hiding_allowed: boolean;
          p_max_members: number;
          p_min_share_level: string;
          p_my_share_level: string;
          p_name: string;
          p_start_date: string;
          p_timezone: string;
        };
        Returns: string;
      };
      create_group_invite: {
        Args: {
          p_code_hash: string;
          p_expires_in_days: number;
          p_group: string;
          p_max_uses: number;
          p_token_hash: string;
        };
        Returns: string;
      };
      create_signup_ticket: {
        Args: { p_policy_version: string; p_timezone?: string; p_token_hash: string; p_ttl_minutes?: number };
        Returns: undefined;
      };
      decline_covenant_change: { Args: { p_proposal: string }; Returns: undefined };
      decline_join_request: { Args: { p_group: string; p_user: string }; Returns: undefined };
      delete_group: { Args: { p_confirm_name: string; p_group: string }; Returns: undefined };
      group_invite_details: {
        Args: { p_code_hash?: string; p_token_hash: string };
        Returns: {
          challenge_days: number;
          challenge_type: string;
          covenant_text: string;
          covenant_updated_at: string;
          description: string;
          end_date: string;
          group_id: string;
          group_name: string;
          group_timezone: string;
          join_policy: string;
          leaderboard_hiding_allowed: boolean;
          member_count: number;
          min_share_level: string;
          my_status: string;
          start_date: string;
          status: string;
        }[];
      };
      join_group: {
        Args: {
          p_accept_covenant: boolean;
          p_code_hash: string;
          p_covenant_seen: string;
          p_leaderboard_hidden: boolean;
          p_share_level: string;
          p_token_hash: string;
        };
        Returns: {
          group_id: string;
          status: string;
        }[];
      };
      leave_group: { Args: { p_group: string }; Returns: undefined };
      my_audit_events: {
        Args: Record<PropertyKey, never>;
        Returns: {
          action: string;
          created_at: string;
          device: string;
        }[];
      };
      my_sessions: {
        Args: Record<PropertyKey, never>;
        Returns: {
          device: string;
          id: string;
          is_current: boolean;
          last_active_at: string;
          signed_in_at: string;
        }[];
      };
      preview_group_invite: {
        Args: { p_code_hash?: string; p_token_hash: string };
        Returns: {
          group_name: string;
          member_count: number;
          status: string;
        }[];
      };
      record_session_device: {
        Args: { p_device_hash: string; p_label: string; p_session_id: string; p_user_id: string };
        Returns: string;
      };
      recovery_codes_remaining: { Args: Record<PropertyKey, never>; Returns: number };
      remove_group_member: { Args: { p_group: string; p_user: string }; Returns: undefined };
      remove_group_picture: { Args: { p_group: string }; Returns: string[] };
      replace_recovery_codes: { Args: { p_hashes: string[] }; Returns: number };
      request_account_deletion: { Args: Record<PropertyKey, never>; Returns: string };
      revoke_group_invite: { Args: { p_invite: string }; Returns: undefined };
      revoke_my_session: { Args: { p_session_id: string }; Returns: boolean };
      run_account_purge: { Args: Record<PropertyKey, never>; Returns: number };
      set_group_member_role: { Args: { p_group: string; p_role: string; p_user: string }; Returns: undefined };
      set_group_picture_pending: { Args: { p_group: string; p_path: string }; Returns: string };
      transfer_group_ownership: { Args: { p_group: string; p_new_owner: string }; Returns: undefined };
      unarchive_group: { Args: { p_group: string }; Returns: undefined };
      update_group_challenge: {
        Args: {
          p_challenge_days: number;
          p_challenge_type: string;
          p_group: string;
          p_join_policy: string;
          p_max_members: number;
          p_start_date: string;
          p_timezone: string;
        };
        Returns: undefined;
      };
      update_group_details: { Args: { p_description: string; p_group: string; p_name: string }; Returns: undefined };
      update_my_group_membership: {
        Args: { p_group: string; p_leaderboard_hidden: boolean; p_share_level: string };
        Returns: undefined;
      };
      use_recovery_code: { Args: { p_hash: string; p_user_id: string }; Returns: boolean };
      withdraw_covenant_change: { Args: { p_proposal: string }; Returns: undefined };
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
