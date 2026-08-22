export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.15';
  };
  api: {
    Tables: {
      profiles: {
        Row: {
          created_at: string;
          created_by: string | null;
          display_name: string;
          email: string;
          id: string;
          is_active: boolean;
          last_login_at: string | null;
          must_change_password: boolean;
          phone: string | null;
          role_template: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          display_name: string;
          email: string;
          id: string;
          is_active?: boolean;
          last_login_at?: string | null;
          must_change_password?: boolean;
          phone?: string | null;
          role_template: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          display_name?: string;
          email?: string;
          id?: string;
          is_active?: boolean;
          last_login_at?: string | null;
          must_change_password?: boolean;
          phone?: string | null;
          role_template?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      user_notifications: {
        Row: {
          action_route: string | null;
          category: string;
          correlation_id: string;
          created_at: string;
          dedupe_key: string | null;
          entity_id: string | null;
          entity_type: string | null;
          expires_at: string;
          id: string;
          message: string;
          metadata: Json;
          read_at: string | null;
          severity: string;
          title: string;
          user_id: string;
        };
        Insert: {
          action_route?: string | null;
          category: string;
          correlation_id?: string;
          created_at?: string;
          dedupe_key?: string | null;
          entity_id?: string | null;
          entity_type?: string | null;
          expires_at?: string;
          id?: string;
          message: string;
          metadata?: Json;
          read_at?: string | null;
          severity: string;
          title: string;
          user_id: string;
        };
        Update: {
          action_route?: string | null;
          category?: string;
          correlation_id?: string;
          created_at?: string;
          dedupe_key?: string | null;
          entity_id?: string | null;
          entity_type?: string | null;
          expires_at?: string;
          id?: string;
          message?: string;
          metadata?: Json;
          read_at?: string | null;
          severity?: string;
          title?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_notifications_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      authorize_staff_admin: { Args: never; Returns: Json };
      cleanup_phase1a_test_users: {
        Args: { p_user_ids: string[] };
        Returns: Json;
      };
      complete_initial_password_change: {
        Args: { p_user_id: string };
        Returns: Json;
      };
      finalize_staff_profile: {
        Args: {
          p_created_by: string;
          p_display_name: string;
          p_email: string;
          p_idempotency_key: string;
          p_role_template: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      get_effective_permissions: { Args: { p_user_id: string }; Returns: Json };
      get_my_notifications: {
        Args: {
          p_cursor_created_at?: string;
          p_cursor_id?: string;
          p_limit?: number;
          p_unread_only?: boolean;
        };
        Returns: Json;
      };
      get_my_session_context: { Args: never; Returns: Json };
      list_staff: {
        Args: {
          p_cursor_created_at?: string;
          p_cursor_id?: string;
          p_limit?: number;
        };
        Returns: Json;
      };
      mark_all_notifications_read: { Args: never; Returns: Json };
      mark_notification_read: {
        Args: { p_notification_id: string };
        Returns: Json;
      };
      prepare_staff_password_reset: {
        Args: {
          p_idempotency_key: string;
          p_reason: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      set_staff_active: {
        Args: {
          p_active: boolean;
          p_idempotency_key: string;
          p_reason: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      set_staff_permission_override: {
        Args: {
          p_effect: string;
          p_idempotency_key: string;
          p_permission_code: string;
          p_reason: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      set_staff_role: {
        Args: {
          p_idempotency_key: string;
          p_reason: string;
          p_role: string;
          p_user_id: string;
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
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  api: {
    Enums: {},
  },
} as const;
