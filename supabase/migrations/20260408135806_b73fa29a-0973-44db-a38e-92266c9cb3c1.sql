
-- Enum types
CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'assistente');
CREATE TYPE public.bandeira_cartao AS ENUM ('visa', 'mastercard', 'elo', 'amex');
CREATE TYPE public.tipo_funcao_cartao AS ENUM ('debito', 'credito', 'multiplo');
CREATE TYPE public.formato_emissao AS ENUM ('fisico', 'virtual');
CREATE TYPE public.status_transacao AS ENUM ('pendente', 'pago', 'atrasado', 'cancelado');
CREATE TYPE public.categoria_tipo AS ENUM ('fixa', 'avulsa', 'variavel', 'divida');
CREATE TYPE public.origem_conta AS ENUM ('email', 'site', 'pix', 'boleto', 'debito_automatico', 'dinheiro', 'cartao');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  telegram_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles (separate table per security guidelines)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'assistente',
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

-- Bancos
CREATE TABLE public.bancos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  nome TEXT NOT NULL,
  saldo_atual DECIMAL(15,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bancos ENABLE ROW LEVEL SECURITY;

-- Cartoes
CREATE TABLE public.cartoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  banco_id UUID REFERENCES public.bancos(id) ON DELETE SET NULL,
  apelido TEXT NOT NULL,
  final_cartao CHAR(4) NOT NULL,
  bandeira bandeira_cartao NOT NULL,
  tipo_funcao tipo_funcao_cartao NOT NULL,
  formato formato_emissao NOT NULL DEFAULT 'fisico',
  limite_total DECIMAL(15,2) NOT NULL DEFAULT 0,
  limite_disponivel DECIMAL(15,2) NOT NULL DEFAULT 0,
  dia_fechamento INTEGER NOT NULL CHECK (dia_fechamento BETWEEN 1 AND 31),
  dia_vencimento INTEGER NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 31),
  data_validade DATE,
  id_cartao_pai UUID REFERENCES public.cartoes(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cartoes ENABLE ROW LEVEL SECURITY;

-- Categorias
CREATE TABLE public.categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  nome TEXT NOT NULL,
  eh_colaborador BOOLEAN NOT NULL DEFAULT false,
  instrucoes_coleta TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;

-- Recorrencias Fixas (moldes)
CREATE TABLE public.recorrencias_fixas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  nome TEXT NOT NULL,
  dia_vencimento_padrao INTEGER NOT NULL CHECK (dia_vencimento_padrao BETWEEN 1 AND 31),
  valor_estimado DECIMAL(15,2) NOT NULL DEFAULT 0,
  eh_variavel BOOLEAN NOT NULL DEFAULT false,
  categoria_id UUID REFERENCES public.categorias(id) ON DELETE SET NULL,
  cartao_id UUID REFERENCES public.cartoes(id) ON DELETE SET NULL,
  banco_id UUID REFERENCES public.bancos(id) ON DELETE SET NULL,
  origem origem_conta,
  url_site_login TEXT,
  instrucoes_coleta TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.recorrencias_fixas ENABLE ROW LEVEL SECURITY;

-- Transacoes (central)
CREATE TABLE public.transacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  descricao TEXT NOT NULL,
  valor DECIMAL(15,2) NOT NULL,
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,
  status status_transacao NOT NULL DEFAULT 'pendente',
  categoria_tipo categoria_tipo NOT NULL,
  origem origem_conta,
  categoria_id UUID REFERENCES public.categorias(id) ON DELETE SET NULL,
  cartao_id UUID REFERENCES public.cartoes(id) ON DELETE SET NULL,
  banco_id UUID REFERENCES public.bancos(id) ON DELETE SET NULL,
  recorrencia_id UUID REFERENCES public.recorrencias_fixas(id) ON DELETE SET NULL,
  id_contrato TEXT,
  parcela_atual INTEGER,
  parcela_total INTEGER,
  url_site_login TEXT,
  instrucoes_coleta TEXT,
  importado_via_excel BOOLEAN NOT NULL DEFAULT false,
  registrado_por UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.transacoes ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_transacoes_status ON public.transacoes(status);
CREATE INDEX idx_transacoes_vencimento ON public.transacoes(data_vencimento);
CREATE INDEX idx_transacoes_cartao ON public.transacoes(cartao_id);
CREATE INDEX idx_transacoes_deleted ON public.transacoes(deleted_at);

-- Comprovantes
CREATE TABLE public.comprovantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transacao_id UUID REFERENCES public.transacoes(id) ON DELETE CASCADE NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  drive_url TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.comprovantes ENABLE ROW LEVEL SECURITY;

-- Audit logs (imutável)
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Convites
CREATE TABLE public.convites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  role app_role NOT NULL DEFAULT 'assistente',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  used_by UUID REFERENCES auth.users(id),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.convites ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Profiles
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin views all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- User roles
CREATE POLICY "Users view own role" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admin manages roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Bancos
CREATE POLICY "Users manage own bancos" ON public.bancos FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin views all bancos" ON public.bancos FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Cartoes
CREATE POLICY "Users manage own cartoes" ON public.cartoes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin views all cartoes" ON public.cartoes FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Categorias
CREATE POLICY "Users manage own categorias" ON public.categorias FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin views all categorias" ON public.categorias FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Recorrencias
CREATE POLICY "Users manage own recorrencias" ON public.recorrencias_fixas FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin views all recorrencias" ON public.recorrencias_fixas FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Transacoes
CREATE POLICY "Users view own transacoes" ON public.transacoes FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'));
CREATE POLICY "Users insert transacoes" ON public.transacoes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own transacoes" ON public.transacoes FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'));
CREATE POLICY "Admin deletes transacoes" ON public.transacoes FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Comprovantes
CREATE POLICY "Users manage own comprovantes" ON public.comprovantes FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.transacoes t WHERE t.id = transacao_id AND (t.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin')))
);

-- Audit logs (read only for admin)
CREATE POLICY "Admin views audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "System inserts audit logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- Convites
CREATE POLICY "Admin manages convites" ON public.convites FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_bancos_updated_at BEFORE UPDATE ON public.bancos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_cartoes_updated_at BEFORE UPDATE ON public.cartoes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_recorrencias_updated_at BEFORE UPDATE ON public.recorrencias_fixas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_transacoes_updated_at BEFORE UPDATE ON public.transacoes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Audit trigger function
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data)
  VALUES (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Audit triggers on sensitive tables
CREATE TRIGGER audit_cartoes AFTER INSERT OR UPDATE OR DELETE ON public.cartoes FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();
CREATE TRIGGER audit_transacoes AFTER INSERT OR UPDATE OR DELETE ON public.transacoes FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();
CREATE TRIGGER audit_user_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- Auto-assign admin role on first user profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name');
  
  -- First user gets admin role
  IF NOT EXISTS (SELECT 1 FROM public.user_roles LIMIT 1) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'assistente');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
