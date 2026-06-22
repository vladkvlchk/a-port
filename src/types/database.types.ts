/**
 * Supabase database types for A-port.
 *
 * Hand-authored to mirror `supabase/migrations/*.sql`. Once the project is
 * linked you can regenerate with:
 *
 *   supabase gen types typescript --linked > src/types/database.types.ts
 *
 * Note: pgvector columns are serialised as strings over PostgREST (the
 * `[0.1,0.2,...]` literal), which is why `embedding` is typed as `string`.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "author" | "buyer" | "arbitrator";

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          address: string | null;
          public_key: string | null;
          handle: string | null;
          bio: string | null;
          stripe_id: string | null;
          role: UserRole;
          trust_score: number;
          subscription_price_usd: number | null;
          stripe_product_id: string | null;
          stripe_price_id: string | null;
          stripe_customer_id_self: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          address?: string | null;
          public_key?: string | null;
          handle?: string | null;
          bio?: string | null;
          stripe_id?: string | null;
          role?: UserRole;
          trust_score?: number;
          subscription_price_usd?: number | null;
          stripe_product_id?: string | null;
          stripe_price_id?: string | null;
          stripe_customer_id_self?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          address?: string | null;
          public_key?: string | null;
          handle?: string | null;
          bio?: string | null;
          stripe_id?: string | null;
          role?: UserRole;
          trust_score?: number;
          subscription_price_usd?: number | null;
          stripe_product_id?: string | null;
          stripe_price_id?: string | null;
          stripe_customer_id_self?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      articles: {
        Row: {
          id: string;
          author_id: string;
          namespace: string | null;
          title: string;
          description: string;
          body_encrypted: string;
          price_usd: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          namespace?: string | null;
          title: string;
          description: string;
          body_encrypted: string;
          price_usd?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          author_id?: string;
          namespace?: string | null;
          title?: string;
          description?: string;
          body_encrypted?: string;
          price_usd?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "articles_author_id_fkey";
            columns: ["author_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      embeddings: {
        Row: {
          id: string;
          article_id: string;
          /** pgvector(1536) serialised as a `[..]` literal string. */
          embedding: string;
        };
        Insert: {
          id?: string;
          article_id: string;
          embedding: string;
        };
        Update: {
          id?: string;
          article_id?: string;
          embedding?: string;
        };
        Relationships: [
          {
            foreignKeyName: "embeddings_article_id_fkey";
            columns: ["article_id"];
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
        ];
      };
      purchases: {
        Row: {
          id: string;
          article_id: string;
          buyer_id: string;
          amount_usd: number;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          article_id: string;
          buyer_id: string;
          amount_usd?: number;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          article_id?: string;
          buyer_id?: string;
          amount_usd?: number;
          status?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchases_article_id_fkey";
            columns: ["article_id"];
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchases_buyer_id_fkey";
            columns: ["buyer_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      disputes: {
        Row: {
          id: string;
          article_id: string | null;
          buyer_id: string | null;
          reason: string;
          status: string;
          trust_score_adjustment: number;
          rationale: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          article_id?: string | null;
          buyer_id?: string | null;
          reason: string;
          status: string;
          trust_score_adjustment?: number;
          rationale?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          article_id?: string | null;
          buyer_id?: string | null;
          reason?: string;
          status?: string;
          trust_score_adjustment?: number;
          rationale?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      reports: {
        Row: {
          id: string;
          article_id: string;
          reporter_id: string | null;
          reason: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          article_id: string;
          reporter_id?: string | null;
          reason: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          article_id?: string;
          reporter_id?: string | null;
          reason?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reports_article_id_fkey";
            columns: ["article_id"];
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_reporter_id_fkey";
            columns: ["reporter_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      payout_methods: {
        Row: {
          id: string;
          agent_id: string;
          kind: string;
          address: string;
          details: Json;
          verified: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          agent_id: string;
          kind: string;
          address: string;
          details?: Json;
          verified?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          agent_id?: string;
          kind?: string;
          address?: string;
          details?: Json;
          verified?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payout_methods_agent_id_fkey";
            columns: ["agent_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          id: string;
          follower_id: string;
          creator_id: string;
          tier: string;
          status: string;
          current_period_end: string | null;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          follower_id: string;
          creator_id: string;
          tier?: string;
          status?: string;
          current_period_end?: string | null;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          follower_id?: string;
          creator_id?: string;
          tier?: string;
          status?: string;
          current_period_end?: string | null;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_follower_id_fkey";
            columns: ["follower_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_creator_id_fkey";
            columns: ["creator_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      publish_article: {
        Args: {
          p_author_id: string;
          p_namespace: string;
          p_description: string;
          p_body: string;
          p_price_usd: number;
          p_embedding: string;
        };
        Returns: string;
      };
      match_articles: {
        Args: {
          query_embedding: string;
          match_threshold: number;
          match_count: number;
        };
        Returns: {
          id: string;
          author_id: string;
          namespace: string | null;
          description: string;
          price_usd: number;
          created_at: string;
          similarity: number;
        }[];
      };
    };
    Enums: {
      user_role: UserRole;
    };
    CompositeTypes: Record<string, never>;
  };
}

/* ------------------------------------------------------------------------- */
/* Convenience aliases                                                       */
/* ------------------------------------------------------------------------- */

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type FunctionReturns<T extends keyof Database["public"]["Functions"]> =
  Database["public"]["Functions"][T]["Returns"];

export type UserRow = Tables<"users">;
export type ArticleRow = Tables<"articles">;
export type EmbeddingRow = Tables<"embeddings">;
export type PurchaseRow = Tables<"purchases">;
export type DisputeRow = Tables<"disputes">;
export type ReportRow = Tables<"reports">;
export type MatchedArticle = FunctionReturns<"match_articles">[number];
