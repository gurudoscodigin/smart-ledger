import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEffect } from "react";

const CATEGORIAS_PADRAO = [
  "Marketing",
  "Custos Fixos",
  "Software",
  "Colaboradores",
  "Insumos e Diversos",
];

const SUBCATEGORIAS_PADRAO: Record<string, string[]> = {
  "Custos Fixos": ["Imóvel", "Internet", "Escritório"],
};

export function useCategorias() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["categorias"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categorias")
        .select("*")
        .order("nome");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Seed default categories if none exist
  useEffect(() => {
    if (!user || query.isLoading || !query.data) return;
    if (query.data.length > 0) return;

    const seed = async () => {
      const rows = CATEGORIAS_PADRAO.map(nome => ({ nome, user_id: user.id }));
      const { data: inserted, error } = await supabase
        .from("categorias")
        .insert(rows)
        .select();
      if (!error && inserted) {
        // Seed subcategorias for categories that have defaults
        const subRows: { categoria_id: string; nome: string }[] = [];
        for (const cat of inserted) {
          const subs = SUBCATEGORIAS_PADRAO[cat.nome];
          if (subs) {
            for (const nome of subs) {
              subRows.push({ categoria_id: cat.id, nome });
            }
          }
        }
        if (subRows.length > 0) {
          await (supabase as any).from("subcategorias").insert(subRows);
        }
        queryClient.invalidateQueries({ queryKey: ["categorias"] });
        queryClient.invalidateQueries({ queryKey: ["subcategorias"] });
      }
    };
    seed();
  }, [user, query.isLoading, query.data, queryClient]);

  const create = useMutation({
    mutationFn: async (params: { nome: string; eh_colaborador?: boolean }) => {
      const { error } = await supabase
        .from("categorias")
        .insert({ ...params, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categorias"] });
      toast.success("Categoria criada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { count } = await supabase
        .from("transacoes")
        .select("id", { count: "exact", head: true })
        .eq("categoria_id", id)
        .is("deleted_at", null);
      if (count && count > 0) {
        throw new Error(`Não é possível excluir: ${count} transação(ões) vinculada(s)`);
      }
      const { error } = await supabase
        .from("categorias")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categorias"] });
      toast.success("Categoria removida");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, nome }: { id: string; nome: string }) => {
      const { error } = await supabase
        .from("categorias")
        .update({ nome })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categorias"] });
      toast.success("Categoria atualizada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { ...query, create, remove, update };
}
