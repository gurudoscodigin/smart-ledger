import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function useComprovantes(transacaoId?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["comprovantes", transacaoId],
    queryFn: async () => {
      if (!transacaoId) return [];
      const { data, error } = await supabase
        .from("comprovantes")
        .select("*")
        .eq("transacao_id", transacaoId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !!transacaoId,
  });

  const upload = useMutation({
    mutationFn: async ({ transacaoId, file }: { transacaoId: string; file: File }) => {
      const ext = file.name.split(".").pop();
      const path = `${user!.id}/${transacaoId}/${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("comprovantes")
        .upload(path, file, { contentType: file.type });
      if (uploadErr) throw uploadErr;

      const { error: dbErr } = await supabase
        .from("comprovantes")
        .insert({
          transacao_id: transacaoId,
          file_name: file.name,
          file_path: path,
          file_type: file.type,
          uploaded_by: user!.id,
        });
      if (dbErr) throw dbErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comprovantes"] });
      toast.success("Comprovante anexado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { ...query, upload };
}
