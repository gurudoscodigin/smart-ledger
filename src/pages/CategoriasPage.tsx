import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useCategorias } from "@/hooks/useCategorias";
import { useSubcategorias } from "@/hooks/useSubcategorias";
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, FolderTree } from "lucide-react";
import { toast } from "sonner";

function SubcategoriasList({ categoriaId }: { categoriaId: string }) {
  const { data: subs, create, remove, update } = useSubcategorias(categoriaId);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleAdd = () => {
    if (!newName.trim()) return;
    create.mutate({ categoria_id: categoriaId, nome: newName.trim() });
    setNewName("");
    setAddOpen(false);
  };

  const handleUpdate = () => {
    if (!editId || !editName.trim()) return;
    update.mutate({ id: editId, nome: editName.trim() });
    setEditId(null);
  };

  return (
    <div className="ml-6 mt-2 space-y-1">
      {(subs || []).map((sub: any) => (
        <div key={sub.id} className="flex items-center gap-2 py-1 px-3 rounded-md hover:bg-accent/40 group">
          {editId === sub.id ? (
            <>
              <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-7 text-sm flex-1" autoFocus
                onKeyDown={e => { if (e.key === "Enter") handleUpdate(); if (e.key === "Escape") setEditId(null); }} />
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={handleUpdate}>Salvar</Button>
            </>
          ) : (
            <>
              <span className="text-sm text-muted-foreground flex-1">↳ {sub.nome}</span>
              <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100"
                onClick={() => { setEditId(sub.id); setEditName(sub.nome); }}>
                <Pencil className="w-3 h-3" />
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive"
                onClick={() => remove.mutate(sub.id)}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </>
          )}
        </div>
      ))}
      {addOpen ? (
        <div className="flex items-center gap-2 px-3">
          <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome da subcategoria" className="h-7 text-sm flex-1" autoFocus
            onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setAddOpen(false); }} />
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={handleAdd}>Criar</Button>
        </div>
      ) : (
        <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground ml-3" onClick={() => setAddOpen(true)}>
          <Plus className="w-3 h-3 mr-1" /> Nova Subcategoria
        </Button>
      )}
    </div>
  );
}

export default function CategoriasPage() {
  const { data: categorias, isLoading, create, remove, update } = useCategorias();
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [editCatId, setEditCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState("");
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleCreateCat = () => {
    if (!newCatName.trim()) return;
    create.mutate({ nome: newCatName.trim() });
    setNewCatName("");
    setNewCatOpen(false);
  };

  const handleUpdateCat = () => {
    if (!editCatId || !editCatName.trim()) return;
    update.mutate({ id: editCatId, nome: editCatName.trim() });
    setEditCatId(null);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Categorias</h1>
            <p className="text-sm text-muted-foreground">Gerencie categorias e subcategorias do sistema</p>
          </div>
          <Button onClick={() => setNewCatOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Nova Categoria
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-12">Carregando...</p>
        ) : (
          <div className="space-y-2">
            {(categorias || []).map(cat => (
              <Card key={cat.id} className="glass-card">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleExpand(cat.id)}>
                      {expandedCats.has(cat.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </Button>
                    {editCatId === cat.id ? (
                      <div className="flex items-center gap-2 flex-1">
                        <Input value={editCatName} onChange={e => setEditCatName(e.target.value)} className="h-8 text-sm flex-1" autoFocus
                          onKeyDown={e => { if (e.key === "Enter") handleUpdateCat(); if (e.key === "Escape") setEditCatId(null); }} />
                        <Button size="sm" variant="outline" className="h-8" onClick={handleUpdateCat}>Salvar</Button>
                      </div>
                    ) : (
                      <>
                        <FolderTree className="w-4 h-4 text-primary" />
                        <span className="font-medium text-sm flex-1">{cat.nome}</span>
                        <Button size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => { setEditCatId(cat.id); setEditCatName(cat.nome); }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                          onClick={() => remove.mutate(cat.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                  {expandedCats.has(cat.id) && <SubcategoriasList categoriaId={cat.id} />}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* New Category Dialog */}
      <Dialog open={newCatOpen} onOpenChange={setNewCatOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova Categoria</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label>Nome</Label>
            <Input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Ex: Logística"
              onKeyDown={e => { if (e.key === "Enter") handleCreateCat(); }} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCatOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateCat} disabled={create.isPending}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
