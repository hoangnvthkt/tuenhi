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
      categories: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          is_active: boolean;
          name: string;
          name_normalized: string;
          updated_at: string;
          updated_by: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          is_active?: boolean;
          name: string;
          name_normalized: string;
          updated_at?: string;
          updated_by: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          name_normalized?: string;
          updated_at?: string;
          updated_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'categories_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'categories_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      customers: {
        Row: {
          address: string | null;
          code: string | null;
          code_normalized: string | null;
          company_name: string | null;
          created_at: string;
          created_by: string;
          customer_group: string | null;
          customer_type: string;
          email: string | null;
          id: string;
          is_active: boolean;
          name: string;
          name_normalized: string;
          notes: string | null;
          phone_e164: string | null;
          tax_code: string | null;
          updated_at: string;
          updated_by: string;
          version: number;
        };
        Insert: {
          address?: string | null;
          code?: string | null;
          code_normalized?: string | null;
          company_name?: string | null;
          created_at?: string;
          created_by: string;
          customer_group?: string | null;
          customer_type?: string;
          email?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          name_normalized: string;
          notes?: string | null;
          phone_e164?: string | null;
          tax_code?: string | null;
          updated_at?: string;
          updated_by: string;
          version?: number;
        };
        Update: {
          address?: string | null;
          code?: string | null;
          code_normalized?: string | null;
          company_name?: string | null;
          created_at?: string;
          created_by?: string;
          customer_group?: string | null;
          customer_type?: string;
          email?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          name_normalized?: string;
          notes?: string | null;
          phone_e164?: string | null;
          tax_code?: string | null;
          updated_at?: string;
          updated_by?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'customers_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'customers_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      inventory_balances: {
        Row: {
          on_hand_qty: number;
          product_id: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          on_hand_qty?: number;
          product_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          on_hand_qty?: number;
          product_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'inventory_balances_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: true;
            referencedRelation: 'product_catalog_read';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inventory_balances_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: true;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
        ];
      };
      product_images: {
        Row: {
          created_at: string;
          id: string;
          is_primary: boolean;
          object_path: string;
          product_id: string;
          sort_order: number;
          uploaded_by: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_primary?: boolean;
          object_path: string;
          product_id: string;
          sort_order?: number;
          uploaded_by: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_primary?: boolean;
          object_path?: string;
          product_id?: string;
          sort_order?: number;
          uploaded_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'product_images_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'product_catalog_read';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'product_images_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'product_images_uploaded_by_fkey';
            columns: ['uploaded_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      products: {
        Row: {
          barcode: string | null;
          category_id: string | null;
          created_at: string;
          created_by: string;
          description: string | null;
          id: string;
          is_active: boolean;
          min_stock_qty: number;
          name: string;
          name_normalized: string;
          sku: string;
          sku_normalized: string;
          specifications: Json;
          unit_name: string;
          updated_at: string;
          updated_by: string;
          version: number;
        };
        Insert: {
          barcode?: string | null;
          category_id?: string | null;
          created_at?: string;
          created_by: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          min_stock_qty?: number;
          name: string;
          name_normalized: string;
          sku: string;
          sku_normalized: string;
          specifications?: Json;
          unit_name: string;
          updated_at?: string;
          updated_by: string;
          version?: number;
        };
        Update: {
          barcode?: string | null;
          category_id?: string | null;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          min_stock_qty?: number;
          name?: string;
          name_normalized?: string;
          sku?: string;
          sku_normalized?: string;
          specifications?: Json;
          unit_name?: string;
          updated_at?: string;
          updated_by?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'products_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'products_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'products_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
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
      sales_channels: {
        Row: {
          code: string;
          created_at: string;
          created_by: string | null;
          id: string;
          is_active: boolean;
          name: string;
          name_normalized: string;
          sort_order: number;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          code: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          name_normalized: string;
          sort_order?: number;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          name_normalized?: string;
          sort_order?: number;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'sales_channels_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sales_channels_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      suppliers: {
        Row: {
          address: string | null;
          code: string | null;
          code_normalized: string | null;
          created_at: string;
          created_by: string;
          email: string | null;
          id: string;
          is_active: boolean;
          name: string;
          name_normalized: string;
          notes: string | null;
          phone_e164: string | null;
          updated_at: string;
          updated_by: string;
          version: number;
        };
        Insert: {
          address?: string | null;
          code?: string | null;
          code_normalized?: string | null;
          created_at?: string;
          created_by: string;
          email?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          name_normalized: string;
          notes?: string | null;
          phone_e164?: string | null;
          updated_at?: string;
          updated_by: string;
          version?: number;
        };
        Update: {
          address?: string | null;
          code?: string | null;
          code_normalized?: string | null;
          created_at?: string;
          created_by?: string;
          email?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          name_normalized?: string;
          notes?: string | null;
          phone_e164?: string | null;
          updated_at?: string;
          updated_by?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'suppliers_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'suppliers_updated_by_fkey';
            columns: ['updated_by'];
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
      product_catalog_read: {
        Row: {
          barcode: string | null;
          category_id: string | null;
          category_name: string | null;
          created_at: string | null;
          current_sale_price: number | null;
          description: string | null;
          id: string | null;
          inventory_version: number | null;
          is_active: boolean | null;
          min_stock_qty: number | null;
          name: string | null;
          name_normalized: string | null;
          on_hand_qty: number | null;
          primary_image_path: string | null;
          sale_price_valid_from: string | null;
          sku: string | null;
          sku_normalized: string | null;
          unit_name: string | null;
          updated_at: string | null;
          version: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'products_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      attach_product_image: {
        Args: {
          p_idempotency_key: string;
          p_is_primary: boolean;
          p_object_path: string;
          p_product_id: string;
          p_sort_order: number;
        };
        Returns: Json;
      };
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
      get_product_catalog: {
        Args: {
          p_category_id?: string;
          p_cursor_id?: string;
          p_cursor_name?: string;
          p_include_inactive?: boolean;
          p_limit?: number;
          p_search?: string;
          p_stock_state?: string;
        };
        Returns: Json;
      };
      get_product_detail: { Args: { p_product_id: string }; Returns: Json };
      get_product_sale_price_history: {
        Args: {
          p_cursor_id?: string;
          p_cursor_valid_from?: string;
          p_limit?: number;
          p_product_id: string;
        };
        Returns: Json;
      };
      list_categories: {
        Args: { p_include_inactive?: boolean };
        Returns: Json;
      };
      list_customers: {
        Args: {
          p_cursor_id?: string;
          p_cursor_name?: string;
          p_limit?: number;
          p_search?: string;
        };
        Returns: Json;
      };
      list_sales_channels: {
        Args: { p_include_inactive?: boolean };
        Returns: Json;
      };
      list_staff: {
        Args: {
          p_cursor_created_at?: string;
          p_cursor_id?: string;
          p_limit?: number;
        };
        Returns: Json;
      };
      list_suppliers: {
        Args: {
          p_cursor_id?: string;
          p_cursor_name?: string;
          p_limit?: number;
          p_search?: string;
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
      remove_product_image: {
        Args: { p_idempotency_key: string; p_product_image_id: string };
        Returns: Json;
      };
      save_category: {
        Args: {
          p_category_id: string;
          p_idempotency_key: string;
          p_is_active: boolean;
          p_name: string;
        };
        Returns: Json;
      };
      save_customer: {
        Args: {
          p_customer: Json;
          p_customer_id: string;
          p_expected_version: number;
          p_idempotency_key: string;
        };
        Returns: Json;
      };
      save_product: {
        Args: {
          p_expected_version: number;
          p_idempotency_key: string;
          p_product: Json;
          p_product_id: string;
        };
        Returns: Json;
      };
      save_sales_channel: {
        Args: {
          p_channel_id: string;
          p_code: string;
          p_idempotency_key: string;
          p_is_active: boolean;
          p_name: string;
          p_sort_order: number;
        };
        Returns: Json;
      };
      save_supplier: {
        Args: {
          p_expected_version: number;
          p_idempotency_key: string;
          p_supplier: Json;
          p_supplier_id: string;
        };
        Returns: Json;
      };
      set_product_sale_price: {
        Args: {
          p_change_reason: string;
          p_idempotency_key: string;
          p_product_id: string;
          p_sale_price: string;
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
