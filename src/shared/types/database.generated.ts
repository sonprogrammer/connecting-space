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
      service_offerings: {
        Row: {
          id: string; slug: string; name: string; description: string;
          price_label: string; price_min: number | null; price_max: number | null;
          duration_label: string; included_items: Json; excluded_items: Json;
          ai_guidance: string | null; is_published: boolean; sort_order: number;
          created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; slug: string; name: string; description: string;
          price_label: string; price_min?: number | null; price_max?: number | null;
          duration_label: string; included_items?: Json; excluded_items?: Json;
          ai_guidance?: string | null; is_published?: boolean; sort_order?: number;
          created_at?: string; updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["service_offerings"]["Insert"]>;
        Relationships: [];
      };
      faq_items: {
        Row: {
          id: string; question: string; answer: string; ai_guidance: string | null;
          is_published: boolean; sort_order: number; created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; question: string; answer: string; ai_guidance?: string | null;
          is_published?: boolean; sort_order?: number; created_at?: string; updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["faq_items"]["Insert"]>;
        Relationships: [];
      };
      inquiry_reply_drafts: {
        Row: {
          id: string; inquiry_id: string; generation_record_id: string | null;
          summary: string; draft_text: string; needs_confirmation: Json;
          status: Database["public"]["Enums"]["inquiry_reply_draft_status"];
          last_error: string | null; updated_by: string | null; created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; inquiry_id: string; generation_record_id?: string | null;
          summary?: string; draft_text?: string; needs_confirmation?: Json;
          status?: Database["public"]["Enums"]["inquiry_reply_draft_status"];
          last_error?: string | null; updated_by?: string | null; created_at?: string; updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["inquiry_reply_drafts"]["Insert"]>;
        Relationships: [];
      };
      automation_jobs: {
        Row: {
          id: string; inquiry_id: string;
          job_type: Database["public"]["Enums"]["automation_job_type"];
          status: Database["public"]["Enums"]["automation_job_status"];
          payload: Json; attempt_count: number; max_attempts: number; available_at: string;
          locked_at: string | null; locked_by: string | null; last_error: string | null;
          completed_at: string | null; created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; inquiry_id: string;
          job_type: Database["public"]["Enums"]["automation_job_type"];
          status?: Database["public"]["Enums"]["automation_job_status"];
          payload?: Json; attempt_count?: number; max_attempts?: number; available_at?: string;
          locked_at?: string | null; locked_by?: string | null; last_error?: string | null;
          completed_at?: string | null; created_at?: string; updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["automation_jobs"]["Insert"]>;
        Relationships: [];
      };
      notification_deliveries: {
        Row: {
          id: string; inquiry_id: string; draft_id: string;
          channel: Database["public"]["Enums"]["notification_channel"];
          status: Database["public"]["Enums"]["notification_delivery_status"];
          attempt_count: number; last_error: string | null; sent_at: string | null;
          created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; inquiry_id: string; draft_id: string;
          channel?: Database["public"]["Enums"]["notification_channel"];
          status?: Database["public"]["Enums"]["notification_delivery_status"];
          attempt_count?: number; last_error?: string | null; sent_at?: string | null;
          created_at?: string; updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["notification_deliveries"]["Insert"]>;
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
      enqueue_automation_job: {
        Args: { p_inquiry_id: string; p_job_type: Database["public"]["Enums"]["automation_job_type"]; p_payload?: Json };
        Returns: string;
      };
      requeue_automation_job: {
        Args: {
          p_inquiry_id: string;
          p_job_type: Database["public"]["Enums"]["automation_job_type"];
          p_payload?: Json;
          p_now?: string;
        };
        Returns: Database["public"]["Tables"]["automation_jobs"]["Row"];
      };
      create_inquiry_with_automation: {
        Args: { p_inquiry: Json };
        Returns: Array<{ id: string; status: Database["public"]["Enums"]["inquiry_status"] }>;
      };
      claim_automation_jobs: {
        Args: { p_worker_id: string; p_limit?: number; p_now?: string };
        Returns: Database["public"]["Tables"]["automation_jobs"]["Row"][];
      };
      claim_automation_job_by_id: {
        Args: { p_job_id: string; p_worker_id: string; p_now?: string };
        Returns: Database["public"]["Tables"]["automation_jobs"]["Row"][];
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
      inquiry_reply_draft_status: "generating" | "ready" | "failed";
      automation_job_type: "generate_inquiry_reply" | "send_slack_notification";
      automation_job_status: "pending" | "processing" | "retry" | "completed" | "failed";
      notification_channel: "slack";
      notification_delivery_status: "pending" | "processing" | "retry" | "sent" | "failed";
    };
    CompositeTypes: Record<string, never>;
  };
};
