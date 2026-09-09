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
      payment_receipts: {
        Row: {
          id: string;
          payment_id: string;
          amount: number;
          received_at: string;
          idempotency_key: string;
          memo: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          payment_id: string;
          amount: number;
          received_at?: string;
          idempotency_key: string;
          memo?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payment_receipts"]["Insert"]>;
        Relationships: [];
      };
      quotes: {
        Row: {
          id: string;
          inquiry_id: string;
          status: Database["public"]["Enums"]["quote_status"];
          latest_version_id: string | null;
          approved_version_id: string | null;
          delivery_method: Database["public"]["Enums"]["quote_delivery_method"] | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          inquiry_id: string;
          status?: Database["public"]["Enums"]["quote_status"];
          latest_version_id?: string | null;
          approved_version_id?: string | null;
          delivery_method?: Database["public"]["Enums"]["quote_delivery_method"] | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["quotes"]["Insert"]>;
        Relationships: [];
      };
      quote_versions: {
        Row: {
          id: string;
          quote_id: string;
          version_number: number;
          title: string;
          body: string;
          scope_items: Json;
          total_amount: number;
          estimated_start_date: string | null;
          estimated_end_date: string | null;
          deposit_amount: number;
          balance_amount: number;
          deposit_terms: string;
          balance_terms: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          quote_id: string;
          version_number: number;
          title: string;
          body: string;
          scope_items: Json;
          total_amount: number;
          estimated_start_date?: string | null;
          estimated_end_date?: string | null;
          deposit_amount: number;
          balance_amount: number;
          deposit_terms: string;
          balance_terms: string;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["quote_versions"]["Insert"]>;
        Relationships: [];
      };
      quote_approval_tokens: {
        Row: {
          id: string;
          quote_version_id: string;
          token_hash: string;
          expires_at: string | null;
          revoked_at: string | null;
          used_at: string | null;
          replaced_by_id: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          quote_version_id: string;
          token_hash: string;
          expires_at?: string | null;
          revoked_at?: string | null;
          used_at?: string | null;
          replaced_by_id?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["quote_approval_tokens"]["Insert"]>;
        Relationships: [];
      };
      quote_approvals: {
        Row: {
          id: string;
          quote_id: string;
          quote_version_id: string;
          approval_token_id: string;
          approved_at: string;
          client_ip: string | null;
          user_agent: string | null;
        };
        Insert: {
          id?: string;
          quote_id: string;
          quote_version_id: string;
          approval_token_id: string;
          approved_at?: string;
          client_ip?: string | null;
          user_agent?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["quote_approvals"]["Insert"]>;
        Relationships: [];
      };
      quote_email_deliveries: {
        Row: {
          id: string; quote_id: string; quote_version_id: string; approval_token_id: string;
          generation: number; status: Database["public"]["Enums"]["quote_delivery_status"];
          encrypted_payload: string; payload_nonce: string; payload_auth_tag: string;
          attempt_count: number; max_attempts: number; available_at: string;
          locked_at: string | null; locked_by: string | null; provider_message_id: string | null;
          dispatch_started_at: string | null; error_code: string | null; sent_at: string | null;
          completed_at: string | null; superseded_at: string | null; created_at: string; updated_at: string;
        };
        Insert: {
          id: string; quote_id: string; quote_version_id: string; approval_token_id: string;
          generation: number; status?: Database["public"]["Enums"]["quote_delivery_status"];
          encrypted_payload: string; payload_nonce: string; payload_auth_tag: string;
          attempt_count?: number; max_attempts?: number; available_at?: string;
          locked_at?: string | null; locked_by?: string | null; provider_message_id?: string | null;
          dispatch_started_at?: string | null; error_code?: string | null; sent_at?: string | null;
          completed_at?: string | null; superseded_at?: string | null; created_at?: string; updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["quote_email_deliveries"]["Insert"]>;
        Relationships: [];
      };
      quote_manual_deliveries: {
        Row: {
          id: string;
          quote_id: string;
          quote_version_id: string;
          approval_token_id: string;
          generation: number;
          idempotency_key_hash: string;
          issued_at: string;
          expires_at: string;
          superseded_at: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id: string;
          quote_id: string;
          quote_version_id: string;
          approval_token_id: string;
          generation: number;
          idempotency_key_hash: string;
          issued_at: string;
          expires_at: string;
          superseded_at?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["quote_manual_deliveries"]["Insert"]>;
        Relationships: [];
      };
      quote_expiration_alerts: {
        Row: {
          id: string; quote_id: string; quote_version_id: string; approval_token_id: string;
          status: Database["public"]["Enums"]["quote_delivery_status"];
          attempt_count: number; max_attempts: number; available_at: string;
          locked_at: string | null; locked_by: string | null; error_code: string | null;
          sent_at: string | null; completed_at: string | null; created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; quote_id: string; quote_version_id: string; approval_token_id: string;
          status?: Database["public"]["Enums"]["quote_delivery_status"];
          attempt_count?: number; max_attempts?: number; available_at?: string;
          locked_at?: string | null; locked_by?: string | null; error_code?: string | null;
          sent_at?: string | null; completed_at?: string | null; created_at?: string; updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["quote_expiration_alerts"]["Insert"]>;
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
      convert_inquiry_to_project: {
        Args: {
          p_inquiry_id: string;
          p_customer_name: string;
          p_customer_memo?: string | null;
          p_project_name: string;
          p_contract_amount: number;
          p_expected_launch_date?: string | null;
          p_project_memo?: string | null;
        };
        Returns: Array<{
          inquiry_id: string;
          customer_id: string;
          project_id: string;
          reused_customer: boolean;
          reused_project: boolean;
        }>;
      };
      create_quote_with_version: {
        Args: {
          p_inquiry_id: string;
          p_title: string;
          p_body: string;
          p_scope_items: Json;
          p_total_amount: number;
          p_estimated_start_date?: string | null;
          p_estimated_end_date?: string | null;
          p_deposit_amount: number;
          p_balance_amount: number;
          p_deposit_terms: string;
          p_balance_terms: string;
        };
        Returns: Array<{
          created_quote_id: string;
          created_quote_version_id: string;
          created_version_number: number;
          created_status: Database["public"]["Enums"]["quote_status"];
        }>;
      };
      create_quote_version: {
        Args: {
          p_quote_id: string;
          p_title: string;
          p_body: string;
          p_scope_items: Json;
          p_total_amount: number;
          p_estimated_start_date?: string | null;
          p_estimated_end_date?: string | null;
          p_deposit_amount: number;
          p_balance_amount: number;
          p_deposit_terms: string;
          p_balance_terms: string;
        };
        Returns: Array<{
          created_quote_id: string;
          created_quote_version_id: string;
          created_version_number: number;
          created_status: Database["public"]["Enums"]["quote_status"];
        }>;
      };
      issue_quote_approval_token: {
        Args: { p_quote_version_id: string; p_token_hash: string };
        Returns: Array<{ issued_token_id: string; issued_expires_at: string }>;
      };
      revoke_quote_approval_token: {
        Args: { p_quote_version_id: string };
        Returns: Array<{ was_revoked: boolean }>;
      };
      cancel_quote: {
        Args: { p_quote_id: string };
        Returns: Array<{
          cancelled_quote_id: string;
          cancelled_status: Database["public"]["Enums"]["quote_status"];
        }>;
      };
      get_public_quote_by_token: {
        Args: { p_token_hash: string };
        Returns: Array<{
          availability: string;
          quote_id: string | null;
          quote_version_id: string | null;
          version_number: number | null;
          customer_name: string | null;
          title: string | null;
          body: string | null;
          scope_items: Json | null;
          total_amount: number | null;
          estimated_start_date: string | null;
          estimated_end_date: string | null;
          deposit_amount: number | null;
          balance_amount: number | null;
          deposit_terms: string | null;
          balance_terms: string | null;
          expires_at: string | null;
        }>;
      };
      approve_quote_by_token: {
        Args: {
          p_token_hash: string;
          p_client_ip?: string | null;
          p_user_agent?: string | null;
        };
        Returns: Array<{
          result: string;
          approved_quote_id: string | null;
          approved_quote_version_id: string | null;
          approved_at: string | null;
        }>;
      };
      enqueue_quote_email_delivery: {
        Args: {
          p_job_id: string; p_quote_version_id: string; p_token_id: string; p_token_hash: string;
          p_encrypted_payload: string; p_payload_nonce: string; p_payload_auth_tag: string; p_now?: string;
        };
        Returns: Array<{ result: string; delivery: Database["public"]["Tables"]["quote_email_deliveries"]["Row"] }>;
      };
      issue_quote_manual_delivery: {
        Args: {
          p_delivery_id: string;
          p_quote_version_id: string;
          p_token_id: string;
          p_token_hash: string;
          p_idempotency_key_hash: string;
          p_reissue?: boolean;
          p_issued_at?: string;
        };
        Returns: Array<{
          result: string;
          delivery: Database["public"]["Tables"]["quote_manual_deliveries"]["Row"];
        }>;
      };
      claim_quote_email_deliveries: {
        Args: { p_worker_id: string; p_limit?: number; p_now?: string };
        Returns: Database["public"]["Tables"]["quote_email_deliveries"]["Row"][];
      };
      finalize_quote_email_delivery: {
        Args: { p_job_id: string; p_provider_message_id: string; p_sent_at?: string };
        Returns: Database["public"]["Tables"]["quote_email_deliveries"]["Row"];
      };
      fail_quote_email_delivery: {
        Args: { p_job_id: string; p_error_code: string; p_now?: string };
        Returns: Database["public"]["Tables"]["quote_email_deliveries"]["Row"];
      };
      retry_quote_email_delivery: {
        Args: { p_job_id: string; p_now?: string };
        Returns: Array<{ result: string; delivery: Database["public"]["Tables"]["quote_email_deliveries"]["Row"] }>;
      };
      schedule_quote_lifecycle: {
        Args: { p_now?: string };
        Returns: Array<{ expired_count: number; alert_count: number }>;
      };
      claim_quote_expiration_alerts: {
        Args: { p_worker_id: string; p_limit?: number; p_now?: string };
        Returns: Database["public"]["Tables"]["quote_expiration_alerts"]["Row"][];
      };
      finalize_quote_expiration_alert: {
        Args: { p_alert_id: string; p_sent_at?: string };
        Returns: Database["public"]["Tables"]["quote_expiration_alerts"]["Row"];
      };
      fail_quote_expiration_alert: {
        Args: { p_alert_id: string; p_error_code: string; p_now?: string };
        Returns: Database["public"]["Tables"]["quote_expiration_alerts"]["Row"];
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
      quote_status: "draft" | "sent" | "approved" | "expired" | "cancelled";
      quote_delivery_status: "queued" | "processing" | "retry" | "sent" | "failed";
      quote_delivery_method: "email" | "manual";
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
