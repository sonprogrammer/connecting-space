export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      admins: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          display_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          display_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      inquiries: {
        Row: {
          id: string;
          customer_name: string;
          email: string | null;
          phone: string | null;
          company_name: string | null;
          website_url: string | null;
          service_type: string;
          budget_min: number | null;
          budget_max: number | null;
          desired_launch_date: string | null;
          message: string;
          source: string | null;
          status: Database["public"]["Enums"]["inquiry_status"];
          admin_notes: string | null;
          converted_customer_id: string | null;
          converted_project_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_name: string;
          email?: string | null;
          phone?: string | null;
          company_name?: string | null;
          website_url?: string | null;
          service_type: string;
          budget_min?: number | null;
          budget_max?: number | null;
          desired_launch_date?: string | null;
          message: string;
          source?: string | null;
          status?: Database["public"]["Enums"]["inquiry_status"];
          admin_notes?: string | null;
          converted_customer_id?: string | null;
          converted_project_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["inquiries"]["Insert"]>;
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          inquiry_id: string | null;
          name: string;
          email: string | null;
          phone: string | null;
          company_name: string | null;
          website_url: string | null;
          memo: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          inquiry_id?: string | null;
          name: string;
          email?: string | null;
          phone?: string | null;
          company_name?: string | null;
          website_url?: string | null;
          memo?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["customers"]["Insert"]>;
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          customer_id: string;
          inquiry_id: string | null;
          name: string;
          description: string | null;
          status: Database["public"]["Enums"]["project_status"];
          contract_amount: number;
          expected_start_date: string | null;
          expected_launch_date: string | null;
          launched_at: string | null;
          memo: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          inquiry_id?: string | null;
          name: string;
          description?: string | null;
          status?: Database["public"]["Enums"]["project_status"];
          contract_amount?: number;
          expected_start_date?: string | null;
          expected_launch_date?: string | null;
          launched_at?: string | null;
          memo?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["projects"]["Insert"]>;
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          project_id: string;
          kind: Database["public"]["Enums"]["payment_kind"];
          status: Database["public"]["Enums"]["payment_status"];
          amount: number;
          due_date: string | null;
          paid_at: string | null;
          memo: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          kind: Database["public"]["Enums"]["payment_kind"];
          status?: Database["public"]["Enums"]["payment_status"];
          amount: number;
          due_date?: string | null;
          paid_at?: string | null;
          memo?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Insert"]>;
        Relationships: [];
      };
      portfolio_items: {
        Row: {
          id: string;
          project_id: string | null;
          title: string;
          slug: string;
          summary: string | null;
          image_url: string | null;
          site_url: string | null;
          industry: string | null;
          is_published: boolean;
          published_at: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id?: string | null;
          title: string;
          slug: string;
          summary?: string | null;
          image_url?: string | null;
          site_url?: string | null;
          industry?: string | null;
          is_published?: boolean;
          published_at?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["portfolio_items"]["Insert"]>;
        Relationships: [];
      };
      ai_generation_records: {
        Row: {
          id: string;
          project_id: string | null;
          inquiry_id: string | null;
          kind: Database["public"]["Enums"]["ai_generation_kind"];
          provider: string;
          model: string;
          prompt: string;
          output: string | null;
          input_tokens: number | null;
          output_tokens: number | null;
          error_message: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id?: string | null;
          inquiry_id?: string | null;
          kind: Database["public"]["Enums"]["ai_generation_kind"];
          provider: string;
          model: string;
          prompt: string;
          output?: string | null;
          input_tokens?: number | null;
          output_tokens?: number | null;
          error_message?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ai_generation_records"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
    };
    Enums: {
      inquiry_status: "new" | "contacted" | "qualified" | "converted" | "closed";
      project_status:
        | "planning"
        | "in_progress"
        | "review"
        | "completed"
        | "paused"
        | "cancelled";
      payment_kind: "deposit" | "balance" | "extra";
      payment_status: "expected" | "paid" | "overdue" | "cancelled";
      ai_generation_kind:
        | "inquiry_reply"
        | "proposal"
        | "contract"
        | "imweb_code";
    };
    CompositeTypes: Record<string, never>;
  };
};
