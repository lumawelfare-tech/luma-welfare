// Auto-generated from verified database schema.
// Run `supabase gen types typescript --project-id mkbxigxmhqdhxmptanqr` to
// regenerate from the live schema once Supabase CLI auth is configured.

export type Database = {
  public: {
    Tables: {
      packages: {
        Row: {
          id: string
          code: string
          name: string
          description: string | null
          coverage: string
          waiting_period_months: string
          is_active: boolean
          sort_order: number
          payout_rule: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          code: string
          name: string
          description?: string | null
          coverage?: string
          waiting_period_months?: string
          is_active?: boolean
          sort_order?: number
          payout_rule?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          code?: string
          name?: string
          description?: string | null
          coverage?: string
          waiting_period_months?: string
          is_active?: boolean
          sort_order?: number
          payout_rule?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      package_tiers: {
        Row: {
          id: string
          package_id: string
          name: string
          amount: number
          description: string | null
          sort_order: number
          is_active: boolean
        }
        Insert: {
          id?: string
          package_id: string
          name: string
          amount: number
          description?: string | null
          sort_order?: number
          is_active?: boolean
        }
        Update: {
          id?: string
          package_id?: string
          name?: string
          amount?: number
          description?: string | null
          sort_order?: number
          is_active?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'package_tiers_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'packages'
            referencedColumns: ['id']
          }
        ]
      }
      package_rules: {
        Row: {
          id: string
          package_id: string
          key: string
          value: string
          description: string | null
        }
        Insert: {
          id?: string
          package_id: string
          key: string
          value?: string
          description?: string | null
        }
        Update: {
          id?: string
          package_id?: string
          key?: string
          value?: string
          description?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'package_rules_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'packages'
            referencedColumns: ['id']
          }
        ]
      }
      members: {
        Row: {
          id: string
          membership_number: string | null
          full_name: string
          id_number: string | null
          phone: string
          alt_phone: string | null
          email: string | null
          date_of_birth: string | null
          county: string | null
          location: string | null
          occupation: string | null
          status: string
          joined_at: string | null
          approved_at: string | null
          approved_by: string | null
          photo_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          membership_number?: string | null
          full_name: string
          id_number?: string | null
          phone: string
          alt_phone?: string | null
          email?: string | null
          date_of_birth?: string | null
          county?: string | null
          location?: string | null
          occupation?: string | null
          status?: string
          joined_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          photo_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          membership_number?: string | null
          full_name?: string
          id_number?: string | null
          phone?: string
          alt_phone?: string | null
          email?: string | null
          date_of_birth?: string | null
          county?: string | null
          location?: string | null
          occupation?: string | null
          status?: string
          joined_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          photo_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      family_members: {
        Row: {
          id: string
          member_id: string
          full_name: string
          relationship: string
          id_number: string | null
          date_of_birth: string | null
          tier: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          member_id: string
          full_name: string
          relationship: string
          id_number?: string | null
          date_of_birth?: string | null
          tier?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          member_id?: string
          full_name?: string
          relationship?: string
          id_number?: string | null
          date_of_birth?: string | null
          tier?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'family_members_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'members'
            referencedColumns: ['id']
          }
        ]
      }
      subscriptions: {
        Row: {
          id: string
          member_id: string
          package_id: string
          package_tier_id: string | null
          status: string
          started_at: string | null
          next_due_date: string | null
          cancelled_at: string | null
          cancelled_reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          member_id: string
          package_id: string
          package_tier_id?: string | null
          status?: string
          started_at?: string | null
          next_due_date?: string | null
          cancelled_at?: string | null
          cancelled_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          member_id?: string
          package_id?: string
          package_tier_id?: string | null
          status?: string
          started_at?: string | null
          next_due_date?: string | null
          cancelled_at?: string | null
          cancelled_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'subscriptions_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'members'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'subscriptions_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'packages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'subscriptions_package_tier_id_fkey'
            columns: ['package_tier_id']
            isOneToOne: false
            referencedRelation: 'package_tiers'
            referencedColumns: ['id']
          }
        ]
      }
      payments: {
        Row: {
          id: string
          member_id: string
          subscription_id: string | null
          package_id: string | null
          amount: number
          phone: string
          payment_reference: string | null
          mpesa_receipt: string | null
          status: string
          channel: string
          payload: unknown | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          member_id: string
          subscription_id?: string | null
          package_id?: string | null
          amount: number
          phone: string
          payment_reference?: string | null
          mpesa_receipt?: string | null
          status?: string
          channel?: string
          payload?: unknown | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          member_id?: string
          subscription_id?: string | null
          package_id?: string | null
          amount?: number
          phone?: string
          payment_reference?: string | null
          mpesa_receipt?: string | null
          status?: string
          channel?: string
          payload?: unknown | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'payments_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'members'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'payments_subscription_id_fkey'
            columns: ['subscription_id']
            isOneToOne: false
            referencedRelation: 'subscriptions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'payments_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'packages'
            referencedColumns: ['id']
          }
        ]
      }
      contributions: {
        Row: {
          id: string
          subscription_id: string
          member_id: string
          package_id: string
          period: string
          amount: number
          status: string
          payment_id: string | null
          recorded_by: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          subscription_id: string
          member_id: string
          package_id: string
          period: string
          amount: number
          status?: string
          payment_id?: string | null
          recorded_by?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          subscription_id?: string
          member_id?: string
          package_id?: string
          period?: string
          amount?: number
          status?: string
          payment_id?: string | null
          recorded_by?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'contributions_subscription_id_fkey'
            columns: ['subscription_id']
            isOneToOne: false
            referencedRelation: 'subscriptions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'contributions_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'members'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'contributions_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'packages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'contributions_payment_id_fkey'
            columns: ['payment_id']
            isOneToOne: false
            referencedRelation: 'payments'
            referencedColumns: ['id']
          }
        ]
      }
      qualifications: {
        Row: {
          id: string
          subscription_id: string
          member_id: string
          package_id: string
          status: string
          eligible_from: string | null
          criteria_met: unknown
          evaluated_at: string
          evaluated_by: string | null
          notes: string | null
        }
        Insert: {
          id?: string
          subscription_id: string
          member_id: string
          package_id: string
          status?: string
          eligible_from?: string | null
          criteria_met?: unknown
          evaluated_at?: string
          evaluated_by?: string | null
          notes?: string | null
        }
        Update: {
          id?: string
          subscription_id?: string
          member_id?: string
          package_id?: string
          status?: string
          eligible_from?: string | null
          criteria_met?: unknown
          evaluated_at?: string
          evaluated_by?: string | null
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'qualifications_subscription_id_fkey'
            columns: ['subscription_id']
            isOneToOne: false
            referencedRelation: 'subscriptions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'qualifications_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'members'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'qualifications_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'packages'
            referencedColumns: ['id']
          }
        ]
      }
      claims: {
        Row: {
          id: string
          claim_number: string
          member_id: string
          subscription_id: string
          package_id: string
          claim_type: string | null
          amount_requested: number | null
          status: string
          description: string | null
          submitted_at: string | null
          reviewed_at: string | null
          decided_at: string | null
          decided_by: string | null
          admin_notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          claim_number: string
          member_id: string
          subscription_id: string
          package_id: string
          claim_type?: string | null
          amount_requested?: number | null
          status?: string
          description?: string | null
          submitted_at?: string | null
          reviewed_at?: string | null
          decided_at?: string | null
          decided_by?: string | null
          admin_notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          claim_number?: string
          member_id?: string
          subscription_id?: string
          package_id?: string
          claim_type?: string | null
          amount_requested?: number | null
          status?: string
          description?: string | null
          submitted_at?: string | null
          reviewed_at?: string | null
          decided_at?: string | null
          decided_by?: string | null
          admin_notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'claims_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'members'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'claims_subscription_id_fkey'
            columns: ['subscription_id']
            isOneToOne: false
            referencedRelation: 'subscriptions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'claims_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'packages'
            referencedColumns: ['id']
          }
        ]
      }
      claim_documents: {
        Row: {
          id: string
          claim_id: string
          file_name: string
          file_url: string
          file_type: string | null
          size_bytes: number | null
          uploaded_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          claim_id: string
          file_name: string
          file_url: string
          file_type?: string | null
          size_bytes?: number | null
          uploaded_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          claim_id?: string
          file_name?: string
          file_url?: string
          file_type?: string | null
          size_bytes?: number | null
          uploaded_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'claim_documents_claim_id_fkey'
            columns: ['claim_id']
            isOneToOne: false
            referencedRelation: 'claims'
            referencedColumns: ['id']
          }
        ]
      }
      payouts: {
        Row: {
          id: string
          claim_id: string
          member_id: string
          package_id: string
          amount: number
          method: string
          status: string
          reference: string | null
          processed_at: string | null
          processed_by: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          claim_id: string
          member_id: string
          package_id: string
          amount: number
          method?: string
          status?: string
          reference?: string | null
          processed_at?: string | null
          processed_by?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          claim_id?: string
          member_id?: string
          package_id?: string
          amount?: number
          method?: string
          status?: string
          reference?: string | null
          processed_at?: string | null
          processed_by?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'payouts_claim_id_fkey'
            columns: ['claim_id']
            isOneToOne: false
            referencedRelation: 'claims'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'payouts_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'members'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'payouts_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'packages'
            referencedColumns: ['id']
          }
        ]
      }
      notifications: {
        Row: {
          id: string
          member_id: string | null
          channel: string
          subject: string | null
          body: string
          status: string
          sent_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          member_id?: string | null
          channel?: string
          subject?: string | null
          body: string
          status?: string
          sent_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          member_id?: string | null
          channel?: string
          subject?: string | null
          body?: string
          status?: string
          sent_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'notifications_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'members'
            referencedColumns: ['id']
          }
        ]
      }
      roles: {
        Row: {
          id: string
          name: string
          description: string | null
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
        }
        Relationships: []
      }
      permissions: {
        Row: {
          id: string
          role_id: string
          resource: string
          action: string
        }
        Insert: {
          id?: string
          role_id: string
          resource: string
          action: string
        }
        Update: {
          id?: string
          role_id?: string
          resource?: string
          action?: string
        }
        Relationships: [
          {
            foreignKeyName: 'permissions_role_id_fkey'
            columns: ['role_id']
            isOneToOne: false
            referencedRelation: 'roles'
            referencedColumns: ['id']
          }
        ]
      }
      admins: {
        Row: {
          id: string
          display_name: string
          role_id: string
          is_superadmin: boolean
          two_factor_enabled: boolean
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name: string
          role_id: string
          is_superadmin?: boolean
          two_factor_enabled?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string
          role_id?: string
          is_superadmin?: boolean
          two_factor_enabled?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'admins_role_id_fkey'
            columns: ['role_id']
            isOneToOne: false
            referencedRelation: 'roles'
            referencedColumns: ['id']
          }
        ]
      }
      audit_logs: {
        Row: {
          id: string
          actor_id: string | null
          actor_role: string | null
          action: string
          resource: string
          resource_id: string | null
          meta: unknown | null
          ip: string | null
          created_at: string
        }
        Insert: {
          id?: string
          actor_id?: string | null
          actor_role?: string | null
          action: string
          resource: string
          resource_id?: string | null
          meta?: unknown | null
          ip?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          actor_id?: string | null
          actor_role?: string | null
          action?: string
          resource?: string
          resource_id?: string | null
          meta?: unknown | null
          ip?: string | null
          created_at?: string
        }
        Relationships: []
      }
      news_events: {
        Row: {
          id: string
          title: string
          body: string
          type: string
          event_date: string | null
          is_published: boolean
          published_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          body: string
          type?: string
          event_date?: string | null
          is_published?: boolean
          published_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          body?: string
          type?: string
          event_date?: string | null
          is_published?: boolean
          published_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      gallery_items: {
        Row: {
          id: string
          title: string | null
          image_url: string
          caption: string | null
          created_at: string
        }
        Insert: {
          id?: string
          title?: string | null
          image_url: string
          caption?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          title?: string | null
          image_url?: string
          caption?: string | null
          created_at?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          key: string
          value: unknown
          description: string | null
        }
        Insert: {
          key: string
          value: unknown
          description?: string | null
        }
        Update: {
          key?: string
          value?: unknown
          description?: string | null
        }
        Relationships: []
      }
      open_questions: {
        Row: {
          id: string
          section_number: number
          question: string
          answer: string
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          section_number: number
          question: string
          answer?: string
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          section_number?: number
          question?: string
          answer?: string
          status?: string
          created_at?: string
        }
        Relationships: []
      }
    }
    Enums: {
      member_status: 'pending_approval' | 'active' | 'suspended' | 'closed'
      subscription_status: 'pending' | 'active' | 'paused' | 'cancelled' | 'rejected'
      contribution_status: 'Paid' | 'Pending' | 'Failed' | 'Reversed' | 'Late' | 'Verified'
      payment_status: 'Pending' | 'Completed' | 'Failed' | 'Reversed'
      qualification_status: 'eligible' | 'not_eligible' | 'at_risk' | 'revoked'
      claim_status: 'Draft' | 'Submitted' | 'Under Review' | 'Additional Information Required' | 'Approved' | 'Rejected' | 'Paid'
      payout_status: 'Pending' | 'Processing' | 'Completed' | 'Failed'
      notification_status: 'queued' | 'sent' | 'failed'
    }
  }
}
