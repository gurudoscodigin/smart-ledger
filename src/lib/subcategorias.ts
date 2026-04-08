// Mapeamento de categorias para subcategorias
// Se a categoria não está aqui, não tem subcategoria
export const SUBCATEGORIAS: Record<string, string[]> = {
  "Marketing": ["Influencer", "UGC", "Tráfego Pago"],
  "Colaboradores": ["PJ", "Colaborador Fixo"],
};

export function getSubcategorias(categoriaNome: string | undefined | null): string[] {
  if (!categoriaNome) return [];
  return SUBCATEGORIAS[categoriaNome] || [];
}

export function hasSubcategorias(categoriaNome: string | undefined | null): boolean {
  return getSubcategorias(categoriaNome).length > 0;
}
