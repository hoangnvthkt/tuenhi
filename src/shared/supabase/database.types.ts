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
    PostgrestVersion: '14.5';
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
      import_runs: {
        Row: {
          actor_id: string;
          adapter_id: string | null;
          committed_at: string | null;
          correlation_id: string;
          created_at: string;
          expires_at: string;
          file_name: string;
          file_sha256: string;
          id: string;
          idempotency_key: string;
          invalid_rows: number;
          mode: string;
          next_chunk_index: number;
          result: Json | null;
          status: string;
          target_type: string;
          template_version: number | null;
          total_rows: number;
          valid_rows: number;
          validated_at: string | null;
        };
        Insert: {
          actor_id: string;
          adapter_id?: string | null;
          committed_at?: string | null;
          correlation_id?: string;
          created_at?: string;
          expires_at?: string;
          file_name: string;
          file_sha256: string;
          id?: string;
          idempotency_key: string;
          invalid_rows?: number;
          mode: string;
          next_chunk_index?: number;
          result?: Json | null;
          status?: string;
          target_type: string;
          template_version?: number | null;
          total_rows?: number;
          valid_rows?: number;
          validated_at?: string | null;
        };
        Update: {
          actor_id?: string;
          adapter_id?: string | null;
          committed_at?: string | null;
          correlation_id?: string;
          created_at?: string;
          expires_at?: string;
          file_name?: string;
          file_sha256?: string;
          id?: string;
          idempotency_key?: string;
          invalid_rows?: number;
          mode?: string;
          next_chunk_index?: number;
          result?: Json | null;
          status?: string;
          target_type?: string;
          template_version?: number | null;
          total_rows?: number;
          valid_rows?: number;
          validated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'import_runs_actor_id_fkey';
            columns: ['actor_id'];
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
      legacy_sale_lines: {
        Row: {
          created_at: string;
          id: string;
          legacy_sale_id: string;
          line_discount: number | null;
          line_number: number;
          line_total: number | null;
          line_total_provenance: string | null;
          product_code: string;
          product_id: string | null;
          product_label: string;
          quantity: number | null;
          source_row_number: number;
          unit_price: number | null;
          unit_price_provenance: string | null;
          warning_codes: string[];
        };
        Insert: {
          created_at?: string;
          id?: string;
          legacy_sale_id: string;
          line_discount?: number | null;
          line_number: number;
          line_total?: number | null;
          line_total_provenance?: string | null;
          product_code?: string;
          product_id?: string | null;
          product_label: string;
          quantity?: number | null;
          source_row_number: number;
          unit_price?: number | null;
          unit_price_provenance?: string | null;
          warning_codes?: string[];
        };
        Update: {
          created_at?: string;
          id?: string;
          legacy_sale_id?: string;
          line_discount?: number | null;
          line_number?: number;
          line_total?: number | null;
          line_total_provenance?: string | null;
          product_code?: string;
          product_id?: string | null;
          product_label?: string;
          quantity?: number | null;
          source_row_number?: number;
          unit_price?: number | null;
          unit_price_provenance?: string | null;
          warning_codes?: string[];
        };
        Relationships: [
          {
            foreignKeyName: 'legacy_sale_lines_legacy_sale_id_fkey';
            columns: ['legacy_sale_id'];
            isOneToOne: false;
            referencedRelation: 'legacy_sales';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'legacy_sale_lines_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'product_catalog_read';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'legacy_sale_lines_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
        ];
      };
      legacy_sales: {
        Row: {
          adapter_id: string;
          channel_label: string;
          correlation_id: string;
          created_at: string;
          created_by: string;
          customer_id: string | null;
          customer_label: string;
          customer_phone: string;
          data_quality_status: string;
          id: string;
          mapping_version: number;
          payment_label: string;
          payment_method: string | null;
          profile_id: string | null;
          reported_discount_total: number | null;
          reported_net_total: number | null;
          reported_subtotal: number | null;
          sales_channel_id: string | null;
          sold_on: string | null;
          source_file_sha256: string;
          source_import_run_id: string;
          source_note: string;
          source_row_start: number;
          source_sale_number: string;
          source_status_label: string;
          staff_label: string;
          warning_codes: string[];
        };
        Insert: {
          adapter_id?: string;
          channel_label?: string;
          correlation_id: string;
          created_at?: string;
          created_by: string;
          customer_id?: string | null;
          customer_label?: string;
          customer_phone?: string;
          data_quality_status: string;
          id?: string;
          mapping_version?: number;
          payment_label?: string;
          payment_method?: string | null;
          profile_id?: string | null;
          reported_discount_total?: number | null;
          reported_net_total?: number | null;
          reported_subtotal?: number | null;
          sales_channel_id?: string | null;
          sold_on?: string | null;
          source_file_sha256: string;
          source_import_run_id: string;
          source_note?: string;
          source_row_start: number;
          source_sale_number: string;
          source_status_label?: string;
          staff_label?: string;
          warning_codes?: string[];
        };
        Update: {
          adapter_id?: string;
          channel_label?: string;
          correlation_id?: string;
          created_at?: string;
          created_by?: string;
          customer_id?: string | null;
          customer_label?: string;
          customer_phone?: string;
          data_quality_status?: string;
          id?: string;
          mapping_version?: number;
          payment_label?: string;
          payment_method?: string | null;
          profile_id?: string | null;
          reported_discount_total?: number | null;
          reported_net_total?: number | null;
          reported_subtotal?: number | null;
          sales_channel_id?: string | null;
          sold_on?: string | null;
          source_file_sha256?: string;
          source_import_run_id?: string;
          source_note?: string;
          source_row_start?: number;
          source_sale_number?: string;
          source_status_label?: string;
          staff_label?: string;
          warning_codes?: string[];
        };
        Relationships: [
          {
            foreignKeyName: 'legacy_sales_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'legacy_sales_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'legacy_sales_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'legacy_sales_sales_channel_id_fkey';
            columns: ['sales_channel_id'];
            isOneToOne: false;
            referencedRelation: 'sales_channels';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'legacy_sales_source_import_run_id_fkey';
            columns: ['source_import_run_id'];
            isOneToOne: false;
            referencedRelation: 'import_runs';
            referencedColumns: ['id'];
          },
        ];
      };
      payments: {
        Row: {
          amount: number;
          captured_by: string;
          correlation_id: string;
          id: string;
          method: string;
          paid_at: string;
          reversal_reason: string | null;
          reversed_at: string | null;
          reversed_by: string | null;
          sale_id: string;
          status: string;
          transfer_proof_path: string | null;
        };
        Insert: {
          amount: number;
          captured_by: string;
          correlation_id: string;
          id?: string;
          method: string;
          paid_at?: string;
          reversal_reason?: string | null;
          reversed_at?: string | null;
          reversed_by?: string | null;
          sale_id: string;
          status: string;
          transfer_proof_path?: string | null;
        };
        Update: {
          amount?: number;
          captured_by?: string;
          correlation_id?: string;
          id?: string;
          method?: string;
          paid_at?: string;
          reversal_reason?: string | null;
          reversed_at?: string | null;
          reversed_by?: string | null;
          sale_id?: string;
          status?: string;
          transfer_proof_path?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'payments_captured_by_fkey';
            columns: ['captured_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payments_reversed_by_fkey';
            columns: ['reversed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payments_sale_id_fkey';
            columns: ['sale_id'];
            isOneToOne: true;
            referencedRelation: 'sales';
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
      purchase_receipt_lines: {
        Row: {
          created_at: string;
          id: string;
          line_order: number;
          product_id: string;
          product_name: string;
          purchase_receipt_id: string;
          received_qty: number;
          sku: string;
          unit_name: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          line_order: number;
          product_id: string;
          product_name: string;
          purchase_receipt_id: string;
          received_qty: number;
          sku: string;
          unit_name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          line_order?: number;
          product_id?: string;
          product_name?: string;
          purchase_receipt_id?: string;
          received_qty?: number;
          sku?: string;
          unit_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'purchase_receipt_lines_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'product_catalog_read';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchase_receipt_lines_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchase_receipt_lines_purchase_receipt_id_fkey';
            columns: ['purchase_receipt_id'];
            isOneToOne: false;
            referencedRelation: 'purchase_receipts';
            referencedColumns: ['id'];
          },
        ];
      };
      purchase_receipts: {
        Row: {
          cancel_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          correlation_id: string;
          created_at: string;
          created_by: string;
          id: string;
          note: string | null;
          posted_at: string | null;
          posted_by: string | null;
          receipt_number: string | null;
          received_at: string;
          reverse_reason: string | null;
          reversed_at: string | null;
          reversed_by: string | null;
          status: string;
          submitted_at: string | null;
          submitted_by: string | null;
          supplier_id: string | null;
          updated_at: string;
          version: number;
        };
        Insert: {
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          correlation_id?: string;
          created_at?: string;
          created_by: string;
          id?: string;
          note?: string | null;
          posted_at?: string | null;
          posted_by?: string | null;
          receipt_number?: string | null;
          received_at: string;
          reverse_reason?: string | null;
          reversed_at?: string | null;
          reversed_by?: string | null;
          status?: string;
          submitted_at?: string | null;
          submitted_by?: string | null;
          supplier_id?: string | null;
          updated_at?: string;
          version?: number;
        };
        Update: {
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          correlation_id?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          note?: string | null;
          posted_at?: string | null;
          posted_by?: string | null;
          receipt_number?: string | null;
          received_at?: string;
          reverse_reason?: string | null;
          reversed_at?: string | null;
          reversed_by?: string | null;
          status?: string;
          submitted_at?: string | null;
          submitted_by?: string | null;
          supplier_id?: string | null;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'purchase_receipts_cancelled_by_fkey';
            columns: ['cancelled_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchase_receipts_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchase_receipts_posted_by_fkey';
            columns: ['posted_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchase_receipts_reversed_by_fkey';
            columns: ['reversed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchase_receipts_submitted_by_fkey';
            columns: ['submitted_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchase_receipts_supplier_id_fkey';
            columns: ['supplier_id'];
            isOneToOne: false;
            referencedRelation: 'suppliers';
            referencedColumns: ['id'];
          },
        ];
      };
      sale_lines: {
        Row: {
          allocated_order_discount: number;
          created_at: string;
          gross_amount: number;
          id: string;
          line_discount_amount: number;
          line_order: number;
          net_amount: number;
          product_id: string;
          product_name: string;
          quantity: number;
          sale_id: string;
          sku: string;
          unit_name: string;
          unit_sale_price: number;
        };
        Insert: {
          allocated_order_discount?: number;
          created_at?: string;
          gross_amount: number;
          id?: string;
          line_discount_amount?: number;
          line_order: number;
          net_amount: number;
          product_id: string;
          product_name: string;
          quantity: number;
          sale_id: string;
          sku: string;
          unit_name: string;
          unit_sale_price: number;
        };
        Update: {
          allocated_order_discount?: number;
          created_at?: string;
          gross_amount?: number;
          id?: string;
          line_discount_amount?: number;
          line_order?: number;
          net_amount?: number;
          product_id?: string;
          product_name?: string;
          quantity?: number;
          sale_id?: string;
          sku?: string;
          unit_name?: string;
          unit_sale_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'sale_lines_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'product_catalog_read';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sale_lines_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sale_lines_sale_id_fkey';
            columns: ['sale_id'];
            isOneToOne: false;
            referencedRelation: 'sales';
            referencedColumns: ['id'];
          },
        ];
      };
      sale_return_lines: {
        Row: {
          accepted_qty: number | null;
          created_at: string;
          id: string;
          line_order: number;
          original_sale_line_id: string;
          product_id: string;
          product_name: string;
          refund_amount: number;
          requested_qty: number;
          sale_return_id: string;
          sku: string;
          unit_name: string;
        };
        Insert: {
          accepted_qty?: number | null;
          created_at?: string;
          id?: string;
          line_order: number;
          original_sale_line_id: string;
          product_id: string;
          product_name: string;
          refund_amount?: number;
          requested_qty: number;
          sale_return_id: string;
          sku: string;
          unit_name: string;
        };
        Update: {
          accepted_qty?: number | null;
          created_at?: string;
          id?: string;
          line_order?: number;
          original_sale_line_id?: string;
          product_id?: string;
          product_name?: string;
          refund_amount?: number;
          requested_qty?: number;
          sale_return_id?: string;
          sku?: string;
          unit_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sale_return_lines_original_sale_line_id_fkey';
            columns: ['original_sale_line_id'];
            isOneToOne: false;
            referencedRelation: 'sale_lines';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sale_return_lines_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'product_catalog_read';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sale_return_lines_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sale_return_lines_sale_return_id_fkey';
            columns: ['sale_return_id'];
            isOneToOne: false;
            referencedRelation: 'sale_returns';
            referencedColumns: ['id'];
          },
        ];
      };
      sale_return_payments: {
        Row: {
          amount: number;
          correlation_id: string;
          id: string;
          method: string;
          refunded_at: string;
          refunded_by: string;
          sale_return_id: string;
          status: string;
          transfer_proof_path: string | null;
        };
        Insert: {
          amount: number;
          correlation_id: string;
          id?: string;
          method: string;
          refunded_at?: string;
          refunded_by: string;
          sale_return_id: string;
          status: string;
          transfer_proof_path?: string | null;
        };
        Update: {
          amount?: number;
          correlation_id?: string;
          id?: string;
          method?: string;
          refunded_at?: string;
          refunded_by?: string;
          sale_return_id?: string;
          status?: string;
          transfer_proof_path?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'sale_return_payments_refunded_by_fkey';
            columns: ['refunded_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sale_return_payments_sale_return_id_fkey';
            columns: ['sale_return_id'];
            isOneToOne: true;
            referencedRelation: 'sale_returns';
            referencedColumns: ['id'];
          },
        ];
      };
      sale_returns: {
        Row: {
          cancel_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          completed_at: string | null;
          completed_by: string | null;
          correlation_id: string;
          created_at: string;
          created_by: string;
          id: string;
          original_sale_id: string;
          reason: string;
          refund_total: number;
          requested_at: string | null;
          requested_by: string | null;
          return_number: string | null;
          status: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          completed_at?: string | null;
          completed_by?: string | null;
          correlation_id?: string;
          created_at?: string;
          created_by: string;
          id?: string;
          original_sale_id: string;
          reason: string;
          refund_total?: number;
          requested_at?: string | null;
          requested_by?: string | null;
          return_number?: string | null;
          status?: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          completed_at?: string | null;
          completed_by?: string | null;
          correlation_id?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          original_sale_id?: string;
          reason?: string;
          refund_total?: number;
          requested_at?: string | null;
          requested_by?: string | null;
          return_number?: string | null;
          status?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'sale_returns_cancelled_by_fkey';
            columns: ['cancelled_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sale_returns_completed_by_fkey';
            columns: ['completed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sale_returns_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sale_returns_original_sale_id_fkey';
            columns: ['original_sale_id'];
            isOneToOne: false;
            referencedRelation: 'sales';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sale_returns_requested_by_fkey';
            columns: ['requested_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      sales: {
        Row: {
          cancel_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          completed_at: string | null;
          completed_by: string | null;
          correlation_id: string;
          created_at: string;
          created_by: string;
          customer_id: string | null;
          customer_name_snapshot: string | null;
          customer_phone_snapshot: string | null;
          discount_total: number;
          id: string;
          line_discount_total: number;
          net_total: number;
          note: string | null;
          order_discount_total: number;
          sale_number: string | null;
          sales_channel_code_snapshot: string | null;
          sales_channel_id: string;
          sales_channel_name_snapshot: string | null;
          staff_name_snapshot: string | null;
          status: string;
          subtotal: number;
          updated_at: string;
          version: number;
        };
        Insert: {
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          completed_at?: string | null;
          completed_by?: string | null;
          correlation_id?: string;
          created_at?: string;
          created_by: string;
          customer_id?: string | null;
          customer_name_snapshot?: string | null;
          customer_phone_snapshot?: string | null;
          discount_total?: number;
          id?: string;
          line_discount_total?: number;
          net_total?: number;
          note?: string | null;
          order_discount_total?: number;
          sale_number?: string | null;
          sales_channel_code_snapshot?: string | null;
          sales_channel_id: string;
          sales_channel_name_snapshot?: string | null;
          staff_name_snapshot?: string | null;
          status?: string;
          subtotal?: number;
          updated_at?: string;
          version?: number;
        };
        Update: {
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          completed_at?: string | null;
          completed_by?: string | null;
          correlation_id?: string;
          created_at?: string;
          created_by?: string;
          customer_id?: string | null;
          customer_name_snapshot?: string | null;
          customer_phone_snapshot?: string | null;
          discount_total?: number;
          id?: string;
          line_discount_total?: number;
          net_total?: number;
          note?: string | null;
          order_discount_total?: number;
          sale_number?: string | null;
          sales_channel_code_snapshot?: string | null;
          sales_channel_id?: string;
          sales_channel_name_snapshot?: string | null;
          staff_name_snapshot?: string | null;
          status?: string;
          subtotal?: number;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'sales_cancelled_by_fkey';
            columns: ['cancelled_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sales_completed_by_fkey';
            columns: ['completed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sales_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sales_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sales_sales_channel_id_fkey';
            columns: ['sales_channel_id'];
            isOneToOne: false;
            referencedRelation: 'sales_channels';
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
      stock_count_lines: {
        Row: {
          counted_qty: number | null;
          created_at: string;
          difference_qty: number | null;
          id: string;
          inventory_version_snapshot: number;
          line_order: number;
          product_id: string;
          product_name: string;
          sku: string;
          stock_count_id: string;
          system_qty_snapshot: number;
          unit_name: string;
        };
        Insert: {
          counted_qty?: number | null;
          created_at?: string;
          difference_qty?: number | null;
          id?: string;
          inventory_version_snapshot: number;
          line_order: number;
          product_id: string;
          product_name: string;
          sku: string;
          stock_count_id: string;
          system_qty_snapshot: number;
          unit_name: string;
        };
        Update: {
          counted_qty?: number | null;
          created_at?: string;
          difference_qty?: number | null;
          id?: string;
          inventory_version_snapshot?: number;
          line_order?: number;
          product_id?: string;
          product_name?: string;
          sku?: string;
          stock_count_id?: string;
          system_qty_snapshot?: number;
          unit_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'stock_count_lines_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'product_catalog_read';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stock_count_lines_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stock_count_lines_stock_count_id_fkey';
            columns: ['stock_count_id'];
            isOneToOne: false;
            referencedRelation: 'stock_counts';
            referencedColumns: ['id'];
          },
        ];
      };
      stock_counts: {
        Row: {
          cancel_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          correlation_id: string;
          count_number: string | null;
          count_type: string;
          created_at: string;
          created_by: string;
          id: string;
          note: string | null;
          posted_at: string | null;
          posted_by: string | null;
          status: string;
          submitted_at: string | null;
          submitted_by: string | null;
          updated_at: string;
          version: number;
        };
        Insert: {
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          correlation_id?: string;
          count_number?: string | null;
          count_type?: string;
          created_at?: string;
          created_by: string;
          id?: string;
          note?: string | null;
          posted_at?: string | null;
          posted_by?: string | null;
          status?: string;
          submitted_at?: string | null;
          submitted_by?: string | null;
          updated_at?: string;
          version?: number;
        };
        Update: {
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          correlation_id?: string;
          count_number?: string | null;
          count_type?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          note?: string | null;
          posted_at?: string | null;
          posted_by?: string | null;
          status?: string;
          submitted_at?: string | null;
          submitted_by?: string | null;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'stock_counts_cancelled_by_fkey';
            columns: ['cancelled_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stock_counts_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stock_counts_posted_by_fkey';
            columns: ['posted_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stock_counts_submitted_by_fkey';
            columns: ['submitted_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      stock_movements: {
        Row: {
          actor_id: string;
          correlation_id: string;
          id: string;
          movement_type: string;
          note: string | null;
          occurred_at: string;
          product_id: string;
          quantity_after: number;
          quantity_delta: number;
          reference_id: string;
          reference_type: string;
        };
        Insert: {
          actor_id: string;
          correlation_id: string;
          id?: string;
          movement_type: string;
          note?: string | null;
          occurred_at?: string;
          product_id: string;
          quantity_after: number;
          quantity_delta: number;
          reference_id: string;
          reference_type: string;
        };
        Update: {
          actor_id?: string;
          correlation_id?: string;
          id?: string;
          movement_type?: string;
          note?: string | null;
          occurred_at?: string;
          product_id?: string;
          quantity_after?: number;
          quantity_delta?: number;
          reference_id?: string;
          reference_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'stock_movements_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stock_movements_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'product_catalog_read';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stock_movements_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
        ];
      };
      store_settings: {
        Row: {
          address: string | null;
          contact_phone: string | null;
          created_at: string;
          display_name: string;
          id: number;
          invoice_footer: string | null;
          logo_path: string | null;
          updated_at: string;
          updated_by: string | null;
          version: number;
          zalo: string | null;
        };
        Insert: {
          address?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          display_name: string;
          id?: number;
          invoice_footer?: string | null;
          logo_path?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
          zalo?: string | null;
        };
        Update: {
          address?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          display_name?: string;
          id?: number;
          invoice_footer?: string | null;
          logo_path?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
          zalo?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'store_settings_updated_by_fkey';
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
      cancel_opening_stock: {
        Args: {
          p_count_id: string;
          p_expected_version: number;
          p_idempotency_key: string;
          p_reason: string;
        };
        Returns: Json;
      };
      cancel_purchase_receipt: {
        Args: {
          p_expected_version: number;
          p_idempotency_key: string;
          p_reason: string;
          p_receipt_id: string;
        };
        Returns: Json;
      };
      cancel_sale: {
        Args: {
          p_expected_version: number;
          p_idempotency_key: string;
          p_reason: string;
          p_sale_id: string;
        };
        Returns: Json;
      };
      cancel_sale_return: {
        Args: {
          p_expected_version: number;
          p_idempotency_key: string;
          p_reason: string;
          p_return_id: string;
        };
        Returns: Json;
      };
      cancel_stock_count: {
        Args: {
          p_count_id: string;
          p_expected_version: number;
          p_idempotency_key: string;
          p_reason: string;
        };
        Returns: Json;
      };
      cleanup_phase1a_test_users: {
        Args: { p_user_ids: string[] };
        Returns: Json;
      };
      cleanup_phase1b_test_users: {
        Args: { p_user_ids: string[] };
        Returns: Json;
      };
      cleanup_phase1c_test_users: {
        Args: { p_user_ids: string[] };
        Returns: Json;
      };
      cleanup_phase1e_test_users: {
        Args: { p_user_ids: string[] };
        Returns: Json;
      };
      cleanup_phase1f_test_users: {
        Args: { p_user_ids: string[] };
        Returns: Json;
      };
      commit_import: {
        Args: { p_idempotency_key: string; p_import_run_id: string };
        Returns: Json;
      };
      commit_legacy_sales_import: {
        Args: { p_idempotency_key: string; p_import_run_id: string };
        Returns: Json;
      };
      complete_initial_password_change: {
        Args: { p_user_id: string };
        Returns: Json;
      };
      complete_sale: {
        Args: {
          p_expected_version: number;
          p_idempotency_key: string;
          p_payment_method: string;
          p_sale_id: string;
          p_transfer_proof_path?: string;
        };
        Returns: Json;
      };
      complete_sale_return: {
        Args: {
          p_expected_version: number;
          p_idempotency_key: string;
          p_lines: Json;
          p_refund_method: string;
          p_return_id: string;
          p_transfer_proof_path?: string;
        };
        Returns: Json;
      };
      create_import_run: {
        Args: {
          p_file_name: string;
          p_file_sha256: string;
          p_idempotency_key: string;
          p_mode: string;
          p_target_type: string;
          p_template_version: number;
        };
        Returns: Json;
      };
      create_sale_return_request: {
        Args: {
          p_idempotency_key: string;
          p_lines: Json;
          p_original_sale_id: string;
          p_reason: string;
        };
        Returns: Json;
      };
      discard_sale_draft: {
        Args: {
          p_expected_version: number;
          p_idempotency_key: string;
          p_sale_id: string;
        };
        Returns: Json;
      };
      dispose_owner_pilot_mock_data: {
        Args: {
          p_keep_sales_channels: boolean;
          p_keep_store_settings: boolean;
          p_manifest_sha256: string;
        };
        Returns: Json;
      };
      finalize_owner_pilot_mock_storage_disposal: {
        Args: { p_deleted_paths: Json; p_receipt_id: string };
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
      get_customer_detail: {
        Args: { p_customer_id: string; p_from?: string; p_to?: string };
        Returns: Json;
      };
      get_effective_permissions: { Args: { p_user_id: string }; Returns: Json };
      get_import_result: { Args: { p_import_run_id: string }; Returns: Json };
      get_import_validation_result: {
        Args: {
          p_cursor_row_number?: number;
          p_import_run_id: string;
          p_limit?: number;
        };
        Returns: Json;
      };
      get_inventory_valuation: {
        Args: {
          p_cursor_id?: string;
          p_cursor_name?: string;
          p_limit?: number;
          p_search?: string;
        };
        Returns: Json;
      };
      get_legacy_sale: { Args: { p_legacy_sale_id: string }; Returns: Json };
      get_legacy_sales: {
        Args: {
          p_cursor_id?: string;
          p_cursor_sold_on?: string;
          p_filters?: Json;
          p_limit?: number;
        };
        Returns: Json;
      };
      get_my_command_outcome: {
        Args: { p_command_name: string; p_idempotency_key: string };
        Returns: Json;
      };
      get_my_notifications: {
        Args: {
          p_cursor_created_at?: string;
          p_cursor_id?: string;
          p_limit?: number;
          p_unread_only?: boolean;
        };
        Returns: Json;
      };
      get_my_sales_summary: {
        Args: { p_from: string; p_to: string };
        Returns: Json;
      };
      get_my_session_context: { Args: never; Returns: Json };
      get_opening_stock_document: {
        Args: { p_count_id: string };
        Returns: Json;
      };
      get_operational_dashboard: {
        Args: { p_from: string; p_to: string };
        Returns: Json;
      };
      get_owner_dashboard: {
        Args: { p_from: string; p_to: string };
        Returns: Json;
      };
      get_owner_pilot_mock_manifest: {
        Args: {
          p_keep_sales_channels: boolean;
          p_keep_store_settings: boolean;
        };
        Returns: Json;
      };
      get_owner_pilot_real_data_verification: {
        Args: { p_stage: string };
        Returns: Json;
      };
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
      get_product_relationship_context: {
        Args: { p_product_id: string };
        Returns: Json;
      };
      get_product_sale_price_history: {
        Args: {
          p_cursor_id?: string;
          p_cursor_valid_from?: string;
          p_limit?: number;
          p_product_id: string;
        };
        Returns: Json;
      };
      get_profit_report: {
        Args: {
          p_cursor_id?: string;
          p_cursor_occurred_at?: string;
          p_from: string;
          p_limit?: number;
          p_to: string;
        };
        Returns: Json;
      };
      get_project_lifecycle: { Args: never; Returns: Json };
      get_purchase_receipt_cost_detail: {
        Args: { p_receipt_id: string };
        Returns: Json;
      };
      get_purchase_receipt_operational: {
        Args: { p_receipt_id: string };
        Returns: Json;
      };
      get_revenue_report: {
        Args: { p_from: string; p_scope: string; p_to: string };
        Returns: Json;
      };
      get_sale_detail: { Args: { p_sale_id: string }; Returns: Json };
      get_sale_draft_print: { Args: { p_sale_id: string }; Returns: Json };
      get_sale_invoice: { Args: { p_sale_id: string }; Returns: Json };
      get_sale_return: { Args: { p_return_id: string }; Returns: Json };
      get_staff_reactivation_recovery: {
        Args: { p_user_id: string; p_idempotency_key: string };
        Returns: Json;
      };
      get_staff_access_capability: { Args: never; Returns: Json };
      get_stock_count: { Args: { p_count_id: string }; Returns: Json };
      get_store_settings: { Args: never; Returns: Json };
      get_supplier_detail: { Args: { p_supplier_id: string }; Returns: Json };
      list_categories: {
        Args: { p_include_inactive?: boolean };
        Returns: Json;
      };
      list_customer_products: {
        Args: {
          p_cursor_last_purchased_at?: string;
          p_cursor_net_purchased_qty?: string;
          p_cursor_product_id?: string;
          p_customer_id: string;
          p_from?: string;
          p_limit?: number;
          p_search?: string;
          p_to?: string;
        };
        Returns: Json;
      };
      list_customer_returns: {
        Args: {
          p_cursor_completed_at?: string;
          p_cursor_return_id?: string;
          p_customer_id: string;
          p_from?: string;
          p_limit?: number;
          p_to?: string;
        };
        Returns: Json;
      };
      list_customer_sales: {
        Args: {
          p_cursor_completed_at?: string;
          p_cursor_sale_id?: string;
          p_customer_id: string;
          p_from?: string;
          p_limit?: number;
          p_to?: string;
        };
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
      list_import_runs: {
        Args: {
          p_cursor_created_at?: string;
          p_cursor_id?: string;
          p_limit?: number;
          p_status?: string;
          p_target_type?: string;
        };
        Returns: Json;
      };
      list_opening_balance_suggestions: {
        Args: { p_cursor_id?: string; p_limit?: number };
        Returns: Json;
      };
      list_opening_stock_documents: {
        Args: {
          p_cursor_id?: string;
          p_cursor_updated_at?: string;
          p_limit?: number;
        };
        Returns: Json;
      };
      list_posted_purchase_history: {
        Args: {
          p_cursor_line_id?: string;
          p_cursor_receipt_id?: string;
          p_cursor_received_at?: string;
          p_from?: string;
          p_limit?: number;
          p_product_id?: string;
          p_supplier_id?: string;
          p_to?: string;
        };
        Returns: Json;
      };
      list_product_suppliers: {
        Args: {
          p_cursor_last_received_at?: string;
          p_cursor_supplier_id?: string;
          p_limit?: number;
          p_product_id: string;
        };
        Returns: Json;
      };
      list_purchase_receipts: {
        Args: {
          p_cursor_id?: string;
          p_cursor_updated_at?: string;
          p_filters?: Json;
          p_limit?: number;
        };
        Returns: Json;
      };
      list_sale_returns: {
        Args: {
          p_cursor_id?: string;
          p_cursor_updated_at?: string;
          p_filters?: Json;
          p_limit?: number;
        };
        Returns: Json;
      };
      list_sale_returns_v2: {
        Args: {
          p_cursor_id?: string;
          p_cursor_updated_at?: string;
          p_filters?: Json;
          p_limit?: number;
        };
        Returns: Json;
      };
      list_sales: {
        Args: {
          p_cursor_id?: string;
          p_cursor_sort_at?: string;
          p_filters?: Json;
          p_limit?: number;
        };
        Returns: Json;
      };
      list_sales_v2: {
        Args: {
          p_cursor_id?: string;
          p_cursor_sort_at?: string;
          p_filters?: Json;
          p_limit?: number;
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
      list_stock_counts: {
        Args: {
          p_cursor_id?: string;
          p_cursor_updated_at?: string;
          p_filters?: Json;
          p_limit?: number;
        };
        Returns: Json;
      };
      list_stock_counts_v2: {
        Args: {
          p_cursor_id?: string;
          p_cursor_updated_at?: string;
          p_filters?: Json;
          p_limit?: number;
        };
        Returns: Json;
      };
      list_supplier_products: {
        Args: {
          p_cursor_last_received_at?: string;
          p_cursor_product_id?: string;
          p_limit?: number;
          p_search?: string;
          p_supplier_id: string;
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
      lookup_sale_for_return: {
        Args: { p_full_sale_number: string };
        Returns: Json;
      };
      mark_all_notifications_read: { Args: never; Returns: Json };
      mark_notification_read: {
        Args: { p_notification_id: string };
        Returns: Json;
      };
      post_opening_stock: {
        Args: {
          p_count_id: string;
          p_expected_version: number;
          p_idempotency_key: string;
        };
        Returns: Json;
      };
      post_purchase_receipt: {
        Args: {
          p_cost_lines: Json;
          p_expected_version: number;
          p_idempotency_key: string;
          p_receipt_id: string;
        };
        Returns: Json;
      };
      post_stock_count: {
        Args: {
          p_count_id: string;
          p_estimated_costs: Json;
          p_expected_version: number;
          p_idempotency_key: string;
        };
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
      record_auth_hardening: { Args: never; Returns: Json };
      record_staff_access_waiver: { Args: { p_reason: string }; Returns: Json };
      refresh_stock_count_snapshot: {
        Args: {
          p_count_id: string;
          p_expected_version: number;
          p_idempotency_key: string;
        };
        Returns: Json;
      };
      remove_product_image: {
        Args: { p_idempotency_key: string; p_product_image_id: string };
        Returns: Json;
      };
      reverse_purchase_receipt: {
        Args: {
          p_idempotency_key: string;
          p_reason: string;
          p_receipt_id: string;
        };
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
      save_import_mapping: {
        Args: { p_import_run_id: string; p_mapping: Json };
        Returns: Json;
      };
      save_legacy_import_mapping: {
        Args: { p_import_run_id: string; p_mapping: Json };
        Returns: Json;
      };
      save_opening_stock_draft: {
        Args: {
          p_count_id: string;
          p_expected_version: number;
          p_idempotency_key: string;
          p_lines: Json;
          p_note: string;
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
      save_purchase_receipt_draft: {
        Args: {
          p_expected_version: number;
          p_idempotency_key: string;
          p_lines: Json;
          p_note: string;
          p_receipt_id: string;
          p_received_at: string;
          p_supplier_id: string;
        };
        Returns: Json;
      };
      save_sale_draft: {
        Args: {
          p_customer_id: string;
          p_expected_version: number;
          p_idempotency_key: string;
          p_lines: Json;
          p_note: string;
          p_order_discount: string;
          p_sale_id: string;
          p_sales_channel_id: string;
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
      save_stock_count: {
        Args: {
          p_count_id: string;
          p_expected_version: number;
          p_idempotency_key: string;
          p_lines: Json;
          p_note: string;
        };
        Returns: Json;
      };
      save_store_settings: {
        Args: {
          p_expected_version: number;
          p_idempotency_key: string;
          p_settings: Json;
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
      submit_opening_stock: {
        Args: {
          p_count_id: string;
          p_expected_version: number;
          p_idempotency_key: string;
        };
        Returns: Json;
      };
      submit_purchase_receipt: {
        Args: {
          p_expected_version: number;
          p_idempotency_key: string;
          p_receipt_id: string;
        };
        Returns: Json;
      };
      submit_stock_count: {
        Args: {
          p_count_id: string;
          p_expected_version: number;
          p_idempotency_key: string;
        };
        Returns: Json;
      };
      transition_project_lifecycle: {
        Args: { p_cutover_at?: string; p_target_mode: string };
        Returns: Json;
      };
      validate_import_rows: {
        Args: {
          p_chunk_index: number;
          p_import_run_id: string;
          p_is_last_chunk: boolean;
          p_rows: Json;
        };
        Returns: Json;
      };
      validate_legacy_sales_import: {
        Args: { p_import_run_id: string };
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
