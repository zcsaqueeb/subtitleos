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
      api_keys: {
        Row: {
          created_at: string
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          revoked: boolean
          usage_count: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          revoked?: boolean
          usage_count?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          revoked?: boolean
          usage_count?: number
          user_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      contact_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: string
          message_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          message_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_audit_log_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "contact_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_messages: {
        Row: {
          attachments: Json
          created_at: string
          email: string
          handled: boolean
          id: string
          message: string
          status: Database["public"]["Enums"]["contact_status"]
          user_id: string | null
        }
        Insert: {
          attachments?: Json
          created_at?: string
          email: string
          handled?: boolean
          id?: string
          message: string
          status?: Database["public"]["Enums"]["contact_status"]
          user_id?: string | null
        }
        Update: {
          attachments?: Json
          created_at?: string
          email?: string
          handled?: boolean
          id?: string
          message?: string
          status?: Database["public"]["Enums"]["contact_status"]
          user_id?: string | null
        }
        Relationships: []
      }
      contact_replies: {
        Row: {
          attachments: Json
          author_id: string
          body: string
          channel: string
          created_at: string
          id: string
          message_id: string
        }
        Insert: {
          attachments?: Json
          author_id: string
          body: string
          channel?: string
          created_at?: string
          id?: string
          message_id: string
        }
        Update: {
          attachments?: Json
          author_id?: string
          body?: string
          channel?: string
          created_at?: string
          id?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_replies_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "contact_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      dub_characters: {
        Row: {
          character_type: string
          clone_provider: string
          created_at: string
          id: string
          locked: boolean
          name: string
          project_id: string
          sample_line: string | null
          updated_at: string
          voice_id: string | null
          voice_provider: string
        }
        Insert: {
          character_type?: string
          clone_provider?: string
          created_at?: string
          id?: string
          locked?: boolean
          name: string
          project_id: string
          sample_line?: string | null
          updated_at?: string
          voice_id?: string | null
          voice_provider?: string
        }
        Update: {
          character_type?: string
          clone_provider?: string
          created_at?: string
          id?: string
          locked?: boolean
          name?: string
          project_id?: string
          sample_line?: string | null
          updated_at?: string
          voice_id?: string | null
          voice_provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "dub_characters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "dub_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      dub_lines: {
        Row: {
          audio_url: string | null
          character_id: string | null
          created_at: string
          emotion: string | null
          end_ms: number | null
          id: string
          idx: number
          locked: boolean
          project_id: string
          rendered_ms: number | null
          start_ms: number | null
          stretch_factor: number | null
          text: string
          translated_text: string | null
          trim_ms: number | null
          updated_at: string
        }
        Insert: {
          audio_url?: string | null
          character_id?: string | null
          created_at?: string
          emotion?: string | null
          end_ms?: number | null
          id?: string
          idx: number
          locked?: boolean
          project_id: string
          rendered_ms?: number | null
          start_ms?: number | null
          stretch_factor?: number | null
          text: string
          translated_text?: string | null
          trim_ms?: number | null
          updated_at?: string
        }
        Update: {
          audio_url?: string | null
          character_id?: string | null
          created_at?: string
          emotion?: string | null
          end_ms?: number | null
          id?: string
          idx?: number
          locked?: boolean
          project_id?: string
          rendered_ms?: number | null
          start_ms?: number | null
          stretch_factor?: number | null
          text?: string
          translated_text?: string | null
          trim_ms?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dub_lines_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "dub_characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dub_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "dub_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      dub_projects: {
        Row: {
          created_at: string
          final_video_url: string | null
          id: string
          lipsync_job_id: string | null
          lipsync_status: string | null
          name: string
          source_lang: string | null
          source_video_name: string | null
          source_video_path: string | null
          status: string
          style_preset: string | null
          target_lang: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          final_video_url?: string | null
          id?: string
          lipsync_job_id?: string | null
          lipsync_status?: string | null
          name: string
          source_lang?: string | null
          source_video_name?: string | null
          source_video_path?: string | null
          status?: string
          style_preset?: string | null
          target_lang?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          final_video_url?: string | null
          id?: string
          lipsync_job_id?: string | null
          lipsync_status?: string | null
          name?: string
          source_lang?: string | null
          source_video_name?: string | null
          source_video_path?: string | null
          status?: string
          style_preset?: string | null
          target_lang?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dub_render_progress: {
        Row: {
          id: string
          line_id: string | null
          message: string | null
          pct: number
          project_id: string
          stage: string
          updated_at: string
        }
        Insert: {
          id?: string
          line_id?: string | null
          message?: string | null
          pct?: number
          project_id: string
          stage: string
          updated_at?: string
        }
        Update: {
          id?: string
          line_id?: string | null
          message?: string | null
          pct?: number
          project_id?: string
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dub_render_progress_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "dub_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dub_render_progress_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "dub_projects"
            referencedColumns: ["id"]
          },
        ]
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
      glossaries: {
        Row: {
          created_at: string
          entries: Json
          id: string
          is_default: boolean
          name: string
          source_lang: string | null
          target_lang: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entries?: Json
          id?: string
          is_default?: boolean
          name: string
          source_lang?: string | null
          target_lang?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entries?: Json
          id?: string
          is_default?: boolean
          name?: string
          source_lang?: string | null
          target_lang?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          admin_notes: string | null
          amount_inr: number | null
          amount_usd: number
          charge_id: string | null
          created_at: string
          currency: string | null
          hosted_url: string | null
          id: string
          note: string | null
          notified_at: string | null
          paid_at: string | null
          payer_name: string | null
          payer_vpa: string | null
          plan: string
          provider: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
          utr: string | null
        }
        Insert: {
          admin_notes?: string | null
          amount_inr?: number | null
          amount_usd: number
          charge_id?: string | null
          created_at?: string
          currency?: string | null
          hosted_url?: string | null
          id?: string
          note?: string | null
          notified_at?: string | null
          paid_at?: string | null
          payer_name?: string | null
          payer_vpa?: string | null
          plan: string
          provider?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
          utr?: string | null
        }
        Update: {
          admin_notes?: string | null
          amount_inr?: number | null
          amount_usd?: number
          charge_id?: string | null
          created_at?: string
          currency?: string | null
          hosted_url?: string | null
          id?: string
          note?: string | null
          notified_at?: string | null
          paid_at?: string | null
          payer_name?: string | null
          payer_vpa?: string | null
          plan?: string
          provider?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          utr?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          banned: boolean
          created_at: string
          display_name: string | null
          email: string | null
          hide_email: boolean
          id: string
          plan: string
          plan_activated_at: string | null
          studio_onboarded_at: string | null
          theme: string
          unlimited_until: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          banned?: boolean
          created_at?: string
          display_name?: string | null
          email?: string | null
          hide_email?: boolean
          id: string
          plan?: string
          plan_activated_at?: string | null
          studio_onboarded_at?: string | null
          theme?: string
          unlimited_until?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          banned?: boolean
          created_at?: string
          display_name?: string | null
          email?: string | null
          hide_email?: boolean
          id?: string
          plan?: string
          plan_activated_at?: string | null
          studio_onboarded_at?: string | null
          theme?: string
          unlimited_until?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          bucket: string
          count: number
          identifier: string
          updated_at: string
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          identifier: string
          updated_at?: string
          window_start?: string
        }
        Update: {
          bucket?: string
          count?: number
          identifier?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
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
      transcribe_override_audit: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          payload: Json
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          payload?: Json
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          payload?: Json
          target_user_id?: string | null
        }
        Relationships: []
      }
      transcribe_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          daily_limit: number | null
          expires_at: string | null
          monthly_limit: number | null
          reason: string | null
          unlimited: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          daily_limit?: number | null
          expires_at?: string | null
          monthly_limit?: number | null
          reason?: string | null
          unlimited?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          daily_limit?: number | null
          expires_at?: string | null
          monthly_limit?: number | null
          reason?: string | null
          unlimited?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      transcription_usage: {
        Row: {
          chunks: number
          created_at: string
          duration_sec: number | null
          file_id: string
          file_name: string | null
          id: string
          user_id: string
        }
        Insert: {
          chunks?: number
          created_at?: string
          duration_sec?: number | null
          file_id: string
          file_name?: string | null
          id?: string
          user_id: string
        }
        Update: {
          chunks?: number
          created_at?: string
          duration_sec?: number | null
          file_id?: string
          file_name?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      translation_memory: {
        Row: {
          approved: boolean
          created_at: string
          hits: number
          id: string
          source_hash: string
          source_lang: string
          source_text: string
          target_lang: string
          target_text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved?: boolean
          created_at?: string
          hits?: number
          id?: string
          source_hash: string
          source_lang: string
          source_text: string
          target_lang: string
          target_text: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved?: boolean
          created_at?: string
          hits?: number
          id?: string
          source_hash?: string
          source_lang?: string
          source_text?: string
          target_lang?: string
          target_text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      translations: {
        Row: {
          char_count: number
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          file_name: string
          id: string
          source_lang: string
          source_text: string
          status: Database["public"]["Enums"]["translation_status"]
          target_lang: string
          translated_text: string | null
          user_id: string
        }
        Insert: {
          char_count?: number
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          file_name: string
          id?: string
          source_lang: string
          source_text: string
          status?: Database["public"]["Enums"]["translation_status"]
          target_lang: string
          translated_text?: string | null
          user_id: string
        }
        Update: {
          char_count?: number
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          file_name?: string
          id?: string
          source_lang?: string
          source_text?: string
          status?: Database["public"]["Enums"]["translation_status"]
          target_lang?: string
          translated_text?: string | null
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
      workspace_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["workspace_role"]
          token: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["workspace_role"]
          token?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          token?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invites_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_workspace: {
        Args: { _user: string; _workspace: string }
        Returns: boolean
      }
      check_rate_limit: {
        Args: {
          _bucket: string
          _identifier: string
          _max: number
          _window_seconds: number
        }
        Returns: {
          allowed: boolean
          remaining: number
          reset_at: string
        }[]
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      is_workspace_member: {
        Args: { _user: string; _workspace: string }
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
      workspace_role_of: {
        Args: { _user: string; _workspace: string }
        Returns: Database["public"]["Enums"]["workspace_role"]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      contact_status: "new" | "in_progress" | "resolved"
      translation_status: "pending" | "processing" | "completed" | "failed"
      workspace_role: "owner" | "admin" | "editor" | "viewer"
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
      app_role: ["admin", "moderator", "user"],
      contact_status: ["new", "in_progress", "resolved"],
      translation_status: ["pending", "processing", "completed", "failed"],
      workspace_role: ["owner", "admin", "editor", "viewer"],
    },
  },
} as const
