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
      amortizacoes: {
        Row: {
          banco_id: string | null
          contrato_id: string
          created_at: string
          data_pagamento: string
          efeito: string | null
          id: string
          observacoes: string | null
          parcelas_antecipadas: number | null
          tipo: string
          transacao_id: string | null
          user_id: string
          valor: number
        }
        Insert: {
          banco_id?: string | null
          contrato_id: string
          created_at?: string
          data_pagamento: string
          efeito?: string | null
          id?: string
          observacoes?: string | null
          parcelas_antecipadas?: number | null
          tipo: string
          transacao_id?: string | null
          user_id: string
          valor: number
        }
        Update: {
          banco_id?: string | null
          contrato_id?: string
          created_at?: string
          data_pagamento?: string
          efeito?: string | null
          id?: string
          observacoes?: string | null
          parcelas_antecipadas?: number | null
          tipo?: string
          transacao_id?: string | null
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "amortizacoes_banco_id_fkey"
            columns: ["banco_id"]
            isOneToOne: false
            referencedRelation: "bancos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amortizacoes_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_divida"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amortizacoes_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_divida_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amortizacoes_transacao_id_fkey"
            columns: ["transacao_id"]
            isOneToOne: false
            referencedRelation: "transacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: string | null
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      bancos: {
        Row: {
          created_at: string
          id: string
          nome: string
          saldo_atual: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          saldo_atual?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          saldo_atual?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cartoes: {
        Row: {
          apelido: string
          banco_id: string | null
          bandeira: Database["public"]["Enums"]["bandeira_cartao"]
          created_at: string
          data_validade: string | null
          deleted_at: string | null
          dia_fechamento: number
          dia_vencimento: number
          final_cartao: string
          formato: Database["public"]["Enums"]["formato_emissao"]
          id: string
          id_cartao_pai: string | null
          limite_disponivel: number
          limite_total: number
          tipo_funcao: Database["public"]["Enums"]["tipo_funcao_cartao"]
          updated_at: string
          user_id: string
        }
        Insert: {
          apelido: string
          banco_id?: string | null
          bandeira: Database["public"]["Enums"]["bandeira_cartao"]
          created_at?: string
          data_validade?: string | null
          deleted_at?: string | null
          dia_fechamento: number
          dia_vencimento: number
          final_cartao: string
          formato?: Database["public"]["Enums"]["formato_emissao"]
          id?: string
          id_cartao_pai?: string | null
          limite_disponivel?: number
          limite_total?: number
          tipo_funcao: Database["public"]["Enums"]["tipo_funcao_cartao"]
          updated_at?: string
          user_id: string
        }
        Update: {
          apelido?: string
          banco_id?: string | null
          bandeira?: Database["public"]["Enums"]["bandeira_cartao"]
          created_at?: string
          data_validade?: string | null
          deleted_at?: string | null
          dia_fechamento?: number
          dia_vencimento?: number
          final_cartao?: string
          formato?: Database["public"]["Enums"]["formato_emissao"]
          id?: string
          id_cartao_pai?: string | null
          limite_disponivel?: number
          limite_total?: number
          tipo_funcao?: Database["public"]["Enums"]["tipo_funcao_cartao"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cartoes_banco_id_fkey"
            columns: ["banco_id"]
            isOneToOne: false
            referencedRelation: "bancos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cartoes_id_cartao_pai_fkey"
            columns: ["id_cartao_pai"]
            isOneToOne: false
            referencedRelation: "cartoes"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias: {
        Row: {
          created_at: string
          eh_colaborador: boolean
          id: string
          instrucoes_coleta: string | null
          nome: string
          user_id: string
        }
        Insert: {
          created_at?: string
          eh_colaborador?: boolean
          id?: string
          instrucoes_coleta?: string | null
          nome: string
          user_id: string
        }
        Update: {
          created_at?: string
          eh_colaborador?: boolean
          id?: string
          instrucoes_coleta?: string | null
          nome?: string
          user_id?: string
        }
        Relationships: []
      }
      comprovantes: {
        Row: {
          created_at: string
          drive_url: string | null
          file_name: string
          file_path: string
          file_type: string | null
          id: string
          transacao_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          drive_url?: string | null
          file_name: string
          file_path: string
          file_type?: string | null
          id?: string
          transacao_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          drive_url?: string | null
          file_name?: string
          file_path?: string
          file_type?: string | null
          id?: string
          transacao_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comprovantes_transacao_id_fkey"
            columns: ["transacao_id"]
            isOneToOne: false
            referencedRelation: "transacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos_divida: {
        Row: {
          banco_id: string | null
          cartao_id: string | null
          categoria_id: string | null
          created_at: string
          credor: string | null
          data_contrato: string
          data_primeira_parcela: string
          data_quitacao: string | null
          deleted_at: string | null
          descricao: string
          dia_vencimento: number
          id: string
          observacoes: string | null
          origem: Database["public"]["Enums"]["origem_conta"] | null
          parcelas_pagas: number
          status: string
          subcategoria: string | null
          taxa_juros_mensal: number | null
          total_parcelas: number
          updated_at: string
          user_id: string
          valor_parcela: number
          valor_total: number
        }
        Insert: {
          banco_id?: string | null
          cartao_id?: string | null
          categoria_id?: string | null
          created_at?: string
          credor?: string | null
          data_contrato: string
          data_primeira_parcela: string
          data_quitacao?: string | null
          deleted_at?: string | null
          descricao: string
          dia_vencimento: number
          id?: string
          observacoes?: string | null
          origem?: Database["public"]["Enums"]["origem_conta"] | null
          parcelas_pagas?: number
          status?: string
          subcategoria?: string | null
          taxa_juros_mensal?: number | null
          total_parcelas: number
          updated_at?: string
          user_id: string
          valor_parcela: number
          valor_total: number
        }
        Update: {
          banco_id?: string | null
          cartao_id?: string | null
          categoria_id?: string | null
          created_at?: string
          credor?: string | null
          data_contrato?: string
          data_primeira_parcela?: string
          data_quitacao?: string | null
          deleted_at?: string | null
          descricao?: string
          dia_vencimento?: number
          id?: string
          observacoes?: string | null
          origem?: Database["public"]["Enums"]["origem_conta"] | null
          parcelas_pagas?: number
          status?: string
          subcategoria?: string | null
          taxa_juros_mensal?: number | null
          total_parcelas?: number
          updated_at?: string
          user_id?: string
          valor_parcela?: number
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "contratos_divida_banco_id_fkey"
            columns: ["banco_id"]
            isOneToOne: false
            referencedRelation: "bancos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_divida_cartao_id_fkey"
            columns: ["cartao_id"]
            isOneToOne: false
            referencedRelation: "cartoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_divida_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      convites: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          token: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: []
      }
      fornecedores: {
        Row: {
          chave_pix: string | null
          cnpj: string | null
          created_at: string
          dados_bancarios: Json | null
          id: string
          nome: string
          notas: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          chave_pix?: string | null
          cnpj?: string | null
          created_at?: string
          dados_bancarios?: Json | null
          id?: string
          nome: string
          notas?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          chave_pix?: string | null
          cnpj?: string | null
          created_at?: string
          dados_bancarios?: Json | null
          id?: string
          nome?: string
          notas?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lembretes: {
        Row: {
          confirmado: boolean
          confirmado_at: string | null
          created_at: string
          data_lembrete: string | null
          descricao: string | null
          id: string
          notificado_telegram: boolean
          titulo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confirmado?: boolean
          confirmado_at?: string | null
          created_at?: string
          data_lembrete?: string | null
          descricao?: string | null
          id?: string
          notificado_telegram?: boolean
          titulo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          confirmado?: boolean
          confirmado_at?: string | null
          created_at?: string
          data_lembrete?: string | null
          descricao?: string | null
          id?: string
          notificado_telegram?: boolean
          titulo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      marketing_mensal: {
        Row: {
          ano: number
          created_at: string | null
          id: string
          mes: number
          observacoes: string | null
          user_id: string
          valor_total: number
        }
        Insert: {
          ano: number
          created_at?: string | null
          id?: string
          mes: number
          observacoes?: string | null
          user_id: string
          valor_total?: number
        }
        Update: {
          ano?: number
          created_at?: string | null
          id?: string
          mes?: number
          observacoes?: string | null
          user_id?: string
          valor_total?: number
        }
        Relationships: []
      }
      preferencias_origem: {
        Row: {
          banco_id: string | null
          cartao_id: string | null
          categoria_id: string | null
          created_at: string
          id: string
          item_nome: string
          origem: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          banco_id?: string | null
          cartao_id?: string | null
          categoria_id?: string | null
          created_at?: string
          id?: string
          item_nome: string
          origem?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          banco_id?: string | null
          cartao_id?: string | null
          categoria_id?: string | null
          created_at?: string
          id?: string
          item_nome?: string
          origem?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "preferencias_origem_banco_id_fkey"
            columns: ["banco_id"]
            isOneToOne: false
            referencedRelation: "bancos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preferencias_origem_cartao_id_fkey"
            columns: ["cartao_id"]
            isOneToOne: false
            referencedRelation: "cartoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preferencias_origem_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          telegram_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          telegram_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          telegram_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recorrencias_fixas: {
        Row: {
          ativo: boolean
          banco_id: string | null
          cartao_id: string | null
          categoria_id: string | null
          created_at: string
          data_fim: string | null
          data_inicio: string | null
          dia_vencimento_padrao: number
          eh_divida: boolean | null
          eh_variavel: boolean
          id: string
          instrucoes_coleta: string | null
          nome: string
          origem: Database["public"]["Enums"]["origem_conta"] | null
          parcelas_pagas: number | null
          parcelas_total: number | null
          subcategoria: string | null
          updated_at: string
          url_site_login: string | null
          user_id: string
          valor_estimado: number
        }
        Insert: {
          ativo?: boolean
          banco_id?: string | null
          cartao_id?: string | null
          categoria_id?: string | null
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          dia_vencimento_padrao: number
          eh_divida?: boolean | null
          eh_variavel?: boolean
          id?: string
          instrucoes_coleta?: string | null
          nome: string
          origem?: Database["public"]["Enums"]["origem_conta"] | null
          parcelas_pagas?: number | null
          parcelas_total?: number | null
          subcategoria?: string | null
          updated_at?: string
          url_site_login?: string | null
          user_id: string
          valor_estimado?: number
        }
        Update: {
          ativo?: boolean
          banco_id?: string | null
          cartao_id?: string | null
          categoria_id?: string | null
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          dia_vencimento_padrao?: number
          eh_divida?: boolean | null
          eh_variavel?: boolean
          id?: string
          instrucoes_coleta?: string | null
          nome?: string
          origem?: Database["public"]["Enums"]["origem_conta"] | null
          parcelas_pagas?: number | null
          parcelas_total?: number | null
          subcategoria?: string | null
          updated_at?: string
          url_site_login?: string | null
          user_id?: string
          valor_estimado?: number
        }
        Relationships: [
          {
            foreignKeyName: "recorrencias_fixas_banco_id_fkey"
            columns: ["banco_id"]
            isOneToOne: false
            referencedRelation: "bancos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recorrencias_fixas_cartao_id_fkey"
            columns: ["cartao_id"]
            isOneToOne: false
            referencedRelation: "cartoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recorrencias_fixas_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      subcategorias: {
        Row: {
          categoria_id: string
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          categoria_id: string
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          categoria_id?: string
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcategorias_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_bot_state: {
        Row: {
          id: number
          update_offset: number
          updated_at: string
        }
        Insert: {
          id?: number
          update_offset?: number
          updated_at?: string
        }
        Update: {
          id?: number
          update_offset?: number
          updated_at?: string
        }
        Relationships: []
      }
      telegram_messages: {
        Row: {
          chat_id: number
          created_at: string
          id: string
          pending_context: Json | null
          processed: boolean
          raw_update: Json
          text: string | null
          update_id: number
        }
        Insert: {
          chat_id: number
          created_at?: string
          id?: string
          pending_context?: Json | null
          processed?: boolean
          raw_update: Json
          text?: string | null
          update_id: number
        }
        Update: {
          chat_id?: number
          created_at?: string
          id?: string
          pending_context?: Json | null
          processed?: boolean
          raw_update?: Json
          text?: string | null
          update_id?: number
        }
        Relationships: []
      }
      transacoes: {
        Row: {
          banco_id: string | null
          cartao_id: string | null
          categoria_id: string | null
          categoria_tipo: Database["public"]["Enums"]["categoria_tipo"]
          contrato_id: string | null
          created_at: string
          data_pagamento: string | null
          data_vencimento: string
          deleted_at: string | null
          descricao: string
          id: string
          id_contrato: string | null
          importado_via_excel: boolean
          instrucoes_coleta: string | null
          origem: Database["public"]["Enums"]["origem_conta"] | null
          parcela_atual: number | null
          parcela_total: number | null
          recorrencia_id: string | null
          registrado_por: string | null
          status: Database["public"]["Enums"]["status_transacao"]
          subcategoria: string | null
          updated_at: string
          url_site_login: string | null
          user_id: string
          valor: number
        }
        Insert: {
          banco_id?: string | null
          cartao_id?: string | null
          categoria_id?: string | null
          categoria_tipo: Database["public"]["Enums"]["categoria_tipo"]
          contrato_id?: string | null
          created_at?: string
          data_pagamento?: string | null
          data_vencimento: string
          deleted_at?: string | null
          descricao: string
          id?: string
          id_contrato?: string | null
          importado_via_excel?: boolean
          instrucoes_coleta?: string | null
          origem?: Database["public"]["Enums"]["origem_conta"] | null
          parcela_atual?: number | null
          parcela_total?: number | null
          recorrencia_id?: string | null
          registrado_por?: string | null
          status?: Database["public"]["Enums"]["status_transacao"]
          subcategoria?: string | null
          updated_at?: string
          url_site_login?: string | null
          user_id: string
          valor: number
        }
        Update: {
          banco_id?: string | null
          cartao_id?: string | null
          categoria_id?: string | null
          categoria_tipo?: Database["public"]["Enums"]["categoria_tipo"]
          contrato_id?: string | null
          created_at?: string
          data_pagamento?: string | null
          data_vencimento?: string
          deleted_at?: string | null
          descricao?: string
          id?: string
          id_contrato?: string | null
          importado_via_excel?: boolean
          instrucoes_coleta?: string | null
          origem?: Database["public"]["Enums"]["origem_conta"] | null
          parcela_atual?: number | null
          parcela_total?: number | null
          recorrencia_id?: string | null
          registrado_por?: string | null
          status?: Database["public"]["Enums"]["status_transacao"]
          subcategoria?: string | null
          updated_at?: string
          url_site_login?: string | null
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "transacoes_banco_id_fkey"
            columns: ["banco_id"]
            isOneToOne: false
            referencedRelation: "bancos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_cartao_id_fkey"
            columns: ["cartao_id"]
            isOneToOne: false
            referencedRelation: "cartoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_divida"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_divida_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_recorrencia_id_fkey"
            columns: ["recorrencia_id"]
            isOneToOne: false
            referencedRelation: "recorrencias_fixas"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      contratos_divida_resumo: {
        Row: {
          banco_id: string | null
          cartao_id: string | null
          categoria_id: string | null
          created_at: string | null
          credor: string | null
          data_contrato: string | null
          data_primeira_parcela: string | null
          descricao: string | null
          dia_vencimento: number | null
          id: string | null
          observacoes: string | null
          origem: Database["public"]["Enums"]["origem_conta"] | null
          parcelas_pagas: number | null
          parcelas_restantes: number | null
          percentual_pago: number | null
          saldo_devedor_estimado: number | null
          status: string | null
          subcategoria: string | null
          total_amortizado: number | null
          total_parcelas: number | null
          updated_at: string | null
          user_id: string | null
          valor_parcela: number | null
          valor_total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_divida_banco_id_fkey"
            columns: ["banco_id"]
            isOneToOne: false
            referencedRelation: "bancos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_divida_cartao_id_fkey"
            columns: ["cartao_id"]
            isOneToOne: false
            referencedRelation: "cartoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_divida_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "supervisor" | "assistente"
      bandeira_cartao: "visa" | "mastercard" | "elo" | "amex"
      categoria_tipo: "fixa" | "avulsa" | "variavel" | "divida"
      formato_emissao: "fisico" | "virtual"
      origem_conta:
        | "email"
        | "site"
        | "pix"
        | "boleto"
        | "debito_automatico"
        | "dinheiro"
        | "cartao"
      status_transacao: "pendente" | "pago" | "atrasado" | "cancelado"
      tipo_funcao_cartao: "debito" | "credito" | "multiplo"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "supervisor", "assistente"],
      bandeira_cartao: ["visa", "mastercard", "elo", "amex"],
      categoria_tipo: ["fixa", "avulsa", "variavel", "divida"],
      formato_emissao: ["fisico", "virtual"],
      origem_conta: [
        "email",
        "site",
        "pix",
        "boleto",
        "debito_automatico",
        "dinheiro",
        "cartao",
      ],
      status_transacao: ["pendente", "pago", "atrasado", "cancelado"],
      tipo_funcao_cartao: ["debito", "credito", "multiplo"],
    },
  },
} as const
