// Legacy compatibility — now fetches from DB via hooks
// This file is kept for backward compatibility but should be replaced
// by useSubcategorias hook in components

// Hardcoded fallback for when DB is not available
const SUBCATEGORIAS_FALLBACK: Record<string, string[]> = {
  "Custos Fixos": ["Imóvel", "Internet", "Escritório"],
};

export function getSubcategorias(categoriaNome: string | undefined | null): string[] {
  if (!categoriaNome) return [];
  return SUBCATEGORIAS_FALLBACK[categoriaNome] || [];
}

export function hasSubcategorias(categoriaNome: string | undefined | null): boolean {
  return getSubcategorias(categoriaNome).length > 0;
}
