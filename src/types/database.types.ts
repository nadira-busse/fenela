export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      action_events: {
        Row: {
          anchor_id: string;
          client_event_id: string;
          event_type: string;
          id: string;
          local_date: string;
          occurred_at: string;
          time_zone: string;
        };
        Insert: {
          anchor_id: string;
          client_event_id: string;
          event_type: string;
          id?: string;
          local_date: string;
          occurred_at?: string;
          time_zone: string;
        };
        Update: {
          anchor_id?: string;
          client_event_id?: string;
          event_type?: string;
          id?: string;
          local_date?: string;
          occurred_at?: string;
          time_zone?: string;
        };
        Relationships: [
          {
            foreignKeyName: "action_events_anchor_id_fkey";
            columns: ["anchor_id"];
            isOneToOne: false;
            referencedRelation: "anchors";
            referencedColumns: ["id"];
          },
        ];
      };
      anchors: {
        Row: {
          archived_at: string | null;
          created_at: string;
          goal_id: string;
          id: string;
          position: number;
          source: string;
          status: string;
          text: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          goal_id: string;
          id?: string;
          position: number;
          source: string;
          status?: string;
          text: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          goal_id?: string;
          id?: string;
          position?: number;
          source?: string;
          status?: string;
          text?: string;
        };
        Relationships: [
          {
            foreignKeyName: "anchors_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
        ];
      };
      devices: {
        Row: {
          created_at: string;
          id: string;
          last_seen_at: string;
          revoked_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          last_seen_at?: string;
          revoked_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          last_seen_at?: string;
          revoked_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      friction_events: {
        Row: {
          anchor_id: string;
          client_event_id: string;
          id: string;
          local_date: string;
          occurred_at: string;
          reason: string;
          time_zone: string;
        };
        Insert: {
          anchor_id: string;
          client_event_id: string;
          id?: string;
          local_date: string;
          occurred_at?: string;
          reason: string;
          time_zone: string;
        };
        Update: {
          anchor_id?: string;
          client_event_id?: string;
          id?: string;
          local_date?: string;
          occurred_at?: string;
          reason?: string;
          time_zone?: string;
        };
        Relationships: [
          {
            foreignKeyName: "friction_events_anchor_id_fkey";
            columns: ["anchor_id"];
            isOneToOne: false;
            referencedRelation: "anchors";
            referencedColumns: ["id"];
          },
        ];
      };
      goals: {
        Row: {
          archived_at: string | null;
          completed_at: string | null;
          created_at: string;
          id: string;
          initial_struggle: string;
          interpretation_source: string | null;
          personal_anchor_interpretation: Json | null;
          status: string;
          title: string;
          user_id: string;
          why: string;
        };
        Insert: {
          archived_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          initial_struggle: string;
          interpretation_source?: string | null;
          personal_anchor_interpretation?: Json | null;
          status?: string;
          title: string;
          user_id: string;
          why: string;
        };
        Update: {
          archived_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          initial_struggle?: string;
          interpretation_source?: string | null;
          personal_anchor_interpretation?: Json | null;
          status?: string;
          title?: string;
          user_id?: string;
          why?: string;
        };
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          auth_key: string;
          created_at: string;
          device_id: string;
          endpoint: string;
          id: string;
          p256dh: string;
          updated_at: string;
        };
        Insert: {
          auth_key: string;
          created_at?: string;
          device_id: string;
          endpoint: string;
          id?: string;
          p256dh: string;
          updated_at?: string;
        };
        Update: {
          auth_key?: string;
          created_at?: string;
          device_id?: string;
          endpoint?: string;
          id?: string;
          p256dh?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: true;
            referencedRelation: "devices";
            referencedColumns: ["id"];
          },
        ];
      };
      reflections: {
        Row: {
          created_at: string;
          facts_snapshot: Json;
          generated_text: string;
          generation_mode: string;
          id: string;
          model: string | null;
          period_end: string;
          period_start: string;
          reflection_type: string;
          time_zone: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          facts_snapshot: Json;
          generated_text: string;
          generation_mode: string;
          id?: string;
          model?: string | null;
          period_end: string;
          period_start: string;
          reflection_type: string;
          time_zone: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          facts_snapshot?: Json;
          generated_text?: string;
          generation_mode?: string;
          id?: string;
          model?: string | null;
          period_end?: string;
          period_start?: string;
          reflection_type?: string;
          time_zone?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      reminder_preferences: {
        Row: {
          created_at: string;
          enabled: boolean;
          start_time: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          enabled?: boolean;
          start_time?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          enabled?: boolean;
          start_time?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_preferences: {
        Row: {
          action_trigger: string;
          anchor_choice_mode: string;
          anti_help: string[];
          created_at: string;
          display_name: string;
          main_challenge: string;
          resistance_pattern: string;
          time_zone: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          action_trigger?: string;
          anchor_choice_mode?: string;
          anti_help?: string[];
          created_at?: string;
          display_name: string;
          main_challenge?: string;
          resistance_pattern?: string;
          time_zone: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          action_trigger?: string;
          anchor_choice_mode?: string;
          anti_help?: string[];
          created_at?: string;
          display_name?: string;
          main_challenge?: string;
          resistance_pattern?: string;
          time_zone?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
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
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
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
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
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
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
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
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
