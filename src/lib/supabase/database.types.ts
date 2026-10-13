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
      badges: {
        Row: {
          icon: string;
          kind: string;
          reference: string;
          slug: string;
          sort: number;
          threshold: number | null;
          verse_text: string;
        };
        Insert: {
          icon: string;
          kind: string;
          reference: string;
          slug: string;
          sort: number;
          threshold?: number | null;
          verse_text: string;
        };
        Update: {
          icon?: string;
          kind?: string;
          reference?: string;
          slug?: string;
          sort?: number;
          threshold?: number | null;
          verse_text?: string;
        };
        Relationships: [];
      };
      blocks: {
        Row: {
          blocked_id: string;
          blocker_id: string;
          created_at: string;
        };
        Insert: {
          blocked_id: string;
          blocker_id: string;
          created_at?: string;
        };
        Update: {
          blocked_id?: string;
          blocker_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey";
            columns: ["blocked_id"];
            isOneToOne: false;
            referencedRelation: "profile_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "blocks_blocked_id_fkey";
            columns: ["blocked_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey";
            columns: ["blocker_id"];
            isOneToOne: false;
            referencedRelation: "profile_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey";
            columns: ["blocker_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      checkins: {
        Row: {
          created_at: string;
          edit_count: number;
          id: string;
          local_date: string;
          mood: number | null;
          note_encrypted: string | null;
          outcome: string;
          timezone: string;
          triggers: string[];
          updated_at: string;
          urge_level: number | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          edit_count?: number;
          id?: string;
          local_date: string;
          mood?: number | null;
          note_encrypted?: string | null;
          outcome: string;
          timezone: string;
          triggers?: string[];
          updated_at?: string;
          urge_level?: number | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          edit_count?: number;
          id?: string;
          local_date?: string;
          mood?: number | null;
          note_encrypted?: string | null;
          outcome?: string;
          timezone?: string;
          triggers?: string[];
          updated_at?: string;
          urge_level?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "checkins_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profile_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "checkins_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      comments: {
        Row: {
          author_id: string | null;
          body: string | null;
          created_at: string;
          deleted_at: string | null;
          edited_at: string | null;
          group_id: string;
          id: string;
          post_id: string;
          removed_by_admin: boolean;
        };
        Insert: {
          author_id?: string | null;
          body?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          edited_at?: string | null;
          group_id: string;
          id?: string;
          post_id: string;
          removed_by_admin?: boolean;
        };
        Update: {
          author_id?: string | null;
          body?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          edited_at?: string | null;
          group_id?: string;
          id?: string;
          post_id?: string;
          removed_by_admin?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profile_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
        ];
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
      group_goals: {
        Row: {
          group_id: string;
          period: string;
          set_at: string;
          set_by: string | null;
          target: number;
        };
        Insert: {
          group_id: string;
          period: string;
          set_at?: string;
          set_by?: string | null;
          target: number;
        };
        Update: {
          group_id?: string;
          period?: string;
          set_at?: string;
          set_by?: string | null;
          target?: number;
        };
        Relationships: [
          {
            foreignKeyName: "group_goals_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: true;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_goals_set_by_fkey";
            columns: ["set_by"];
            isOneToOne: false;
            referencedRelation: "profile_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_goals_set_by_fkey";
            columns: ["set_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
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
      group_member_stats: {
        Row: {
          checkins_in_challenge: number;
          clean_days_in_challenge: number;
          group_id: string;
          updated_at: string;
          user_id: string;
          xp_in_group: number;
        };
        Insert: {
          checkins_in_challenge?: number;
          clean_days_in_challenge?: number;
          group_id: string;
          updated_at?: string;
          user_id: string;
          xp_in_group?: number;
        };
        Update: {
          checkins_in_challenge?: number;
          clean_days_in_challenge?: number;
          group_id?: string;
          updated_at?: string;
          user_id?: string;
          xp_in_group?: number;
        };
        Relationships: [
          {
            foreignKeyName: "group_member_stats_group_id_user_id_fkey";
            columns: ["group_id", "user_id"];
            isOneToOne: true;
            referencedRelation: "group_checkins_today";
            referencedColumns: ["group_id", "user_id"];
          },
          {
            foreignKeyName: "group_member_stats_group_id_user_id_fkey";
            columns: ["group_id", "user_id"];
            isOneToOne: true;
            referencedRelation: "group_members";
            referencedColumns: ["group_id", "user_id"];
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
      leaderboard_entries: {
        Row: {
          encourager: number;
          encourager_at: string | null;
          encourager_week: number;
          encourager_week_at: string | null;
          free_days: number;
          free_days_at: string | null;
          free_days_week: number;
          free_days_week_at: string | null;
          goal_days: number;
          goal_key: string | null;
          group_id: string;
          level: number;
          level_at: string | null;
          refreshed_at: string;
          stale_at: string | null;
          streak: number;
          streak_at: string | null;
          user_id: string;
          week_of: string;
          xp: number;
          xp_at: string | null;
          xp_week: number;
          xp_week_at: string | null;
        };
        Insert: {
          encourager?: number;
          encourager_at?: string | null;
          encourager_week?: number;
          encourager_week_at?: string | null;
          free_days?: number;
          free_days_at?: string | null;
          free_days_week?: number;
          free_days_week_at?: string | null;
          goal_days?: number;
          goal_key?: string | null;
          group_id: string;
          level?: number;
          level_at?: string | null;
          refreshed_at?: string;
          stale_at?: string | null;
          streak?: number;
          streak_at?: string | null;
          user_id: string;
          week_of: string;
          xp?: number;
          xp_at?: string | null;
          xp_week?: number;
          xp_week_at?: string | null;
        };
        Update: {
          encourager?: number;
          encourager_at?: string | null;
          encourager_week?: number;
          encourager_week_at?: string | null;
          free_days?: number;
          free_days_at?: string | null;
          free_days_week?: number;
          free_days_week_at?: string | null;
          goal_days?: number;
          goal_key?: string | null;
          group_id?: string;
          level?: number;
          level_at?: string | null;
          refreshed_at?: string;
          stale_at?: string | null;
          streak?: number;
          streak_at?: string | null;
          user_id?: string;
          week_of?: string;
          xp?: number;
          xp_at?: string | null;
          xp_week?: number;
          xp_week_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "leaderboard_entries_group_id_user_id_fkey";
            columns: ["group_id", "user_id"];
            isOneToOne: true;
            referencedRelation: "group_checkins_today";
            referencedColumns: ["group_id", "user_id"];
          },
          {
            foreignKeyName: "leaderboard_entries_group_id_user_id_fkey";
            columns: ["group_id", "user_id"];
            isOneToOne: true;
            referencedRelation: "group_members";
            referencedColumns: ["group_id", "user_id"];
          },
        ];
      };
      level_tiers: {
        Row: {
          era: string;
          name: string;
          reference: string;
          tier: number;
          verse_text: string;
        };
        Insert: {
          era: string;
          name: string;
          reference: string;
          tier: number;
          verse_text: string;
        };
        Update: {
          era?: string;
          name?: string;
          reference?: string;
          tier?: number;
          verse_text?: string;
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
      posts: {
        Row: {
          author_id: string | null;
          badge: string | null;
          body: string | null;
          created_at: string;
          deleted_at: string | null;
          edited_at: string | null;
          group_id: string;
          id: string;
          kind: string;
          pinned: boolean;
          removed_by_admin: boolean;
        };
        Insert: {
          author_id?: string | null;
          badge?: string | null;
          body?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          edited_at?: string | null;
          group_id: string;
          id?: string;
          kind: string;
          pinned?: boolean;
          removed_by_admin?: boolean;
        };
        Update: {
          author_id?: string | null;
          badge?: string | null;
          body?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          edited_at?: string | null;
          group_id?: string;
          id?: string;
          kind?: string;
          pinned?: boolean;
          removed_by_admin?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profile_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "posts_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "posts_badge_fkey";
            columns: ["badge"];
            isOneToOne: false;
            referencedRelation: "badges";
            referencedColumns: ["slug"];
          },
          {
            foreignKeyName: "posts_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
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
      reactions: {
        Row: {
          created_at: string;
          group_id: string;
          id: string;
          kind: string;
          target_id: string;
          target_type: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          group_id: string;
          id?: string;
          kind: string;
          target_id: string;
          target_type: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          group_id?: string;
          id?: string;
          kind?: string;
          target_id?: string;
          target_type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reactions_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reactions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profile_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reactions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      reports: {
        Row: {
          created_at: string;
          group_id: string;
          id: string;
          note: string | null;
          reason: string;
          reporter_id: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          snapshot: string | null;
          status: string;
          subject_id: string | null;
          target_id: string;
          target_type: string;
        };
        Insert: {
          created_at?: string;
          group_id: string;
          id?: string;
          note?: string | null;
          reason: string;
          reporter_id?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          snapshot?: string | null;
          status?: string;
          subject_id?: string | null;
          target_id: string;
          target_type: string;
        };
        Update: {
          created_at?: string;
          group_id?: string;
          id?: string;
          note?: string | null;
          reason?: string;
          reporter_id?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          snapshot?: string | null;
          status?: string;
          subject_id?: string | null;
          target_id?: string;
          target_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reports_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "profile_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "profile_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_subject_id_fkey";
            columns: ["subject_id"];
            isOneToOne: false;
            referencedRelation: "profile_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_subject_id_fkey";
            columns: ["subject_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_badges: {
        Row: {
          badge: string;
          earned_at: string;
          user_id: string;
        };
        Insert: {
          badge: string;
          earned_at?: string;
          user_id: string;
        };
        Update: {
          badge?: string;
          earned_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_badges_badge_fkey";
            columns: ["badge"];
            isOneToOne: false;
            referencedRelation: "badges";
            referencedColumns: ["slug"];
          },
          {
            foreignKeyName: "user_badges_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profile_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_badges_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_stats: {
        Row: {
          checkin_streak: number;
          clean_streaks: number;
          current_streak: number;
          highest_level: number;
          last_checkin_date: string | null;
          last_clean_date: string | null;
          level: number;
          level_before_save: number | null;
          level_open: number | null;
          level_open_highest: number | null;
          level_open_progress_days: number | null;
          level_open_until: string | null;
          level_progress_days: number;
          longest_streak: number;
          total_checkins: number;
          total_clean_days: number;
          updated_at: string;
          user_id: string;
          xp: number;
        };
        Insert: {
          checkin_streak?: number;
          clean_streaks?: number;
          current_streak?: number;
          highest_level?: number;
          last_checkin_date?: string | null;
          last_clean_date?: string | null;
          level?: number;
          level_before_save?: number | null;
          level_open?: number | null;
          level_open_highest?: number | null;
          level_open_progress_days?: number | null;
          level_open_until?: string | null;
          level_progress_days?: number;
          longest_streak?: number;
          total_checkins?: number;
          total_clean_days?: number;
          updated_at?: string;
          user_id: string;
          xp?: number;
        };
        Update: {
          checkin_streak?: number;
          clean_streaks?: number;
          current_streak?: number;
          highest_level?: number;
          last_checkin_date?: string | null;
          last_clean_date?: string | null;
          level?: number;
          level_before_save?: number | null;
          level_open?: number | null;
          level_open_highest?: number | null;
          level_open_progress_days?: number | null;
          level_open_until?: string | null;
          level_progress_days?: number;
          longest_streak?: number;
          total_checkins?: number;
          total_clean_days?: number;
          updated_at?: string;
          user_id?: string;
          xp?: number;
        };
        Relationships: [
          {
            foreignKeyName: "user_stats_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profile_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_stats_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      xp_config: {
        Row: {
          cap: number | null;
          description: string;
          key: string;
          points: number;
        };
        Insert: {
          cap?: number | null;
          description: string;
          key: string;
          points: number;
        };
        Update: {
          cap?: number | null;
          description?: string;
          key?: string;
          points?: number;
        };
        Relationships: [];
      };
      xp_ledger: {
        Row: {
          created_at: string;
          group_id: string | null;
          id: string;
          kind: string;
          local_date: string;
          points: number;
          reason: string;
          revision: number;
          source_key: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          group_id?: string | null;
          id?: string;
          kind?: string;
          local_date: string;
          points: number;
          reason: string;
          revision: number;
          source_key: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          group_id?: string | null;
          id?: string;
          kind?: string;
          local_date?: string;
          points?: number;
          reason?: string;
          revision?: number;
          source_key?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "xp_ledger_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "xp_ledger_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profile_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "xp_ledger_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      group_checkins_today: {
        Row: {
          checked_in_today: boolean | null;
          current_streak: number | null;
          group_id: string | null;
          level: number | null;
          mood: number | null;
          outcome: string | null;
          triggers: string[] | null;
          urge_level: number | null;
          user_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_cards: {
        Row: {
          avatar_path: string | null;
          badges: string[] | null;
          bio: string | null;
          display_name: string | null;
          favourite_verse: string | null;
          handle: string | null;
          id: string | null;
          joined_at: string | null;
          level: number | null;
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
      block_member: { Args: { p_user: string }; Returns: undefined };
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
      create_comment: { Args: { p_body: string; p_post: string }; Returns: string };
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
      create_post: { Args: { p_body: string; p_group: string; p_kind: string }; Returns: string };
      create_signup_ticket: {
        Args: { p_policy_version: string; p_timezone?: string; p_token_hash: string; p_ttl_minutes?: number };
        Returns: undefined;
      };
      decline_covenant_change: { Args: { p_proposal: string }; Returns: undefined };
      decline_join_request: { Args: { p_group: string; p_user: string }; Returns: undefined };
      delete_comment: { Args: { p_comment: string }; Returns: undefined };
      delete_group: { Args: { p_confirm_name: string; p_group: string }; Returns: undefined };
      delete_post: { Args: { p_post: string }; Returns: undefined };
      edit_comment: { Args: { p_body: string; p_comment: string }; Returns: undefined };
      edit_post: { Args: { p_body: string; p_post: string }; Returns: undefined };
      end_group_goal: { Args: { p_group: string }; Returns: undefined };
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
      group_invite_people: {
        Args: { p_invite: string };
        Returns: {
          member_id: string;
          member_status: string;
          since: string;
        }[];
      };
      group_leaderboard: {
        Args: { p_after?: number; p_board?: string; p_group: string; p_limit?: number; p_period?: string };
        Returns: {
          is_hidden: boolean;
          is_me: boolean;
          member_id: string;
          place: number;
          score: number;
        }[];
      };
      group_reports: {
        Args: { p_group: string };
        Returns: {
          created_at: string;
          id: string;
          note: string;
          post_id: string;
          reason: string;
          reports_on_target: number;
          snapshot: string;
          still_there: boolean;
          subject_id: string;
          target_id: string;
          target_type: string;
        }[];
      };
      group_together: { Args: { p_group: string }; Returns: Json };
      group_wall: {
        Args: { p_before?: string; p_group: string; p_kind?: string; p_limit?: number };
        Returns: {
          author_id: string;
          badge: string;
          body: string;
          comment_count: number;
          created_at: string;
          edited_at: string;
          id: string;
          is_mine: boolean;
          kind: string;
          my_reactions: string[];
          pinned: boolean;
          reactions: Json;
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
      mark_session_mfa_verified: { Args: { p_session_id: string; p_user_id: string }; Returns: boolean };
      my_audit_events: {
        Args: Record<PropertyKey, never>;
        Returns: {
          action: string;
          created_at: string;
          device: string;
        }[];
      };
      my_blocked_people: {
        Args: Record<PropertyKey, never>;
        Returns: {
          blocked_at: string;
          display_name: string;
          handle: string;
          user_id: string;
        }[];
      };
      my_checkin_overview: { Args: Record<PropertyKey, never>; Returns: Json };
      my_level: { Args: Record<PropertyKey, never>; Returns: Json };
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
      my_social_export: { Args: Record<PropertyKey, never>; Returns: Json };
      pin_post: { Args: { p_pinned: boolean; p_post: string }; Returns: undefined };
      post_comments: {
        Args: { p_post: string };
        Returns: {
          author_id: string;
          body: string;
          created_at: string;
          edited_at: string;
          id: string;
          is_mine: boolean;
          my_reactions: string[];
          reactions: Json;
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
      report_content: {
        Args: { p_group: string; p_note?: string; p_reason: string; p_target: string; p_target_type: string };
        Returns: string;
      };
      request_account_deletion: { Args: Record<PropertyKey, never>; Returns: string };
      resolve_report: { Args: { p_outcome: string; p_report: string }; Returns: undefined };
      revoke_group_invite: { Args: { p_invite: string }; Returns: undefined };
      revoke_my_session: { Args: { p_session_id: string }; Returns: boolean };
      run_account_purge: { Args: Record<PropertyKey, never>; Returns: number };
      save_checkin_reflection: {
        Args: { p_local_date: string; p_note_encrypted?: string; p_triggers?: string[] };
        Returns: undefined;
      };
      set_group_goal: { Args: { p_group: string; p_period: string; p_target: number }; Returns: undefined };
      set_group_member_role: { Args: { p_group: string; p_role: string; p_user: string }; Returns: undefined };
      set_group_picture_pending: { Args: { p_group: string; p_path: string }; Returns: string };
      set_reaction: {
        Args: { p_kind: string; p_on: boolean; p_target: string; p_target_type: string };
        Returns: undefined;
      };
      submit_checkin: {
        Args: {
          p_local_date: string;
          p_mood?: number;
          p_note_encrypted?: string;
          p_outcome: string;
          p_triggers?: string[];
          p_urge_level?: number;
        };
        Returns: string;
      };
      submit_offline_checkin: {
        Args: {
          p_local_date: string;
          p_mood?: number;
          p_note_encrypted?: string;
          p_outcome: string;
          p_recorded_at: string;
          p_triggers?: string[];
          p_urge_level?: number;
        };
        Returns: string;
      };
      transfer_group_ownership: { Args: { p_group: string; p_new_owner: string }; Returns: undefined };
      unarchive_group: { Args: { p_group: string }; Returns: undefined };
      unblock_member: { Args: { p_user: string }; Returns: undefined };
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
      wall_post: {
        Args: { p_post: string };
        Returns: {
          author_id: string;
          badge: string;
          body: string;
          comment_count: number;
          created_at: string;
          edited_at: string;
          group_id: string;
          id: string;
          is_mine: boolean;
          kind: string;
          my_reactions: string[];
          pinned: boolean;
          reactions: Json;
        }[];
      };
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
