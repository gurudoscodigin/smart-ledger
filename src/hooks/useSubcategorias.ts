import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function useSubcategorias(categoriaId?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["subcategorias", categoriaId],
    queryFn: async () => {
      if (!categoriaId) return [];
      const { data, error } = await supabase
        .from("subcategorias")
        .select("*")
        .eq("categoria_id", categoriaId)
        .order("nome");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !!categoriaId,
  });

  const allSubcategorias = useQuery({
    queryKey: ["subcategorias-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subcategorias")
        .select("*, categorias(nome)")
        .order("nome");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const create = useMutation({
    mutationFn: async (params: { categoria_id: string; nome: string }) => {
      const { error } = await supabase
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
      const { error } = await supabase
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

  return { ...query, allSubcategorias, create, remove };
}
