import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEffect } from "react";

const CATEGORIAS_PADRAO = [
  "Software",
  "Contas do Escritório",
  "Prestação de Serviços",
  "Colaboradores",
  "Marketing",
];

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
      const { error } = await supabase.from("categorias").insert(rows);
      if (!error) {
        queryClient.invalidateQueries({ queryKey: ["categorias"] });
      }
    };
    seed();
  }, [user, query.isLoading, query.data]);

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

  return { ...query, create };
}
