import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface Subcategoria {
  id: string;
  categoria_id: string;
  nome: string;
  created_at: string;
  categorias?: { nome: string } | null;
}

export function useSubcategorias(categoriaId?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["subcategorias", categoriaId],
    queryFn: async () => {
      if (!categoriaId) return [] as Subcategoria[];
      const { data, error } = await (supabase as any)
        .from("subcategorias")
        .select("*")
        .eq("categoria_id", categoriaId)
        .order("nome");
      if (error) throw error;
      return (data || []) as Subcategoria[];
    },
    enabled: !!user && !!categoriaId,
  });

  const allSubcategorias = useQuery({
    queryKey: ["subcategorias-all"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("subcategorias")
        .select("*, categorias(nome)")
        .order("nome");
      if (error) throw error;
      return (data || []) as Subcategoria[];
    },
    enabled: !!user,
  });

  const create = useMutation({
    mutationFn: async (params: { categoria_id: string; nome: string }) => {
      const { error } = await (supabase as any)
        .from("subcategorias")
        .insert(params);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subcategorias"] });
      queryClient.invalidateQueries({ queryKey: ["subcategorias-all"] });
      toast.success("Subcategoria criada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      // Check if any transactions use this subcategoria name
      const { data: sub } = await (supabase as any)
        .from("subcategorias")
        .select("nome")
        .eq("id", id)
        .single();
      if (sub) {
        const { count } = await supabase
          .from("transacoes")
          .select("id", { count: "exact", head: true })
          .eq("subcategoria", sub.nome)
          .is("deleted_at", null);
        if (count && count > 0) {
          throw new Error(`Não é possível excluir: ${count} transação(ões) usa(m) esta subcategoria`);
        }
      }
      const { error } = await (supabase as any)
        .from("subcategorias")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subcategorias"] });
      queryClient.invalidateQueries({ queryKey: ["subcategorias-all"] });
      toast.success("Subcategoria removida");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, nome }: { id: string; nome: string }) => {
      const { error } = await (supabase as any)
        .from("subcategorias")
        .update({ nome })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subcategorias"] });
      queryClient.invalidateQueries({ queryKey: ["subcategorias-all"] });
      toast.success("Subcategoria atualizada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { ...query, allSubcategorias, create, remove, update };
}
