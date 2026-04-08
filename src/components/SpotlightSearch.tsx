import { useState, useEffect, useRef } from "react";
import { Search, CreditCard, FileText, User, X } from "lucide-react";
import { Input } from "@/components/ui/input";

export function SpotlightSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Mock results
  const results = query.length > 1 ? [
    { type: "transaction", icon: FileText, label: `Adobe Creative Cloud`, detail: "R$ 124,00 · Março · Pago", color: "text-status-paid" },
    { type: "card", icon: CreditCard, label: `Cartão Roxinho`, detail: "Final 0781 · Limite: R$ 4.200", color: "text-primary" },
    { type: "user", icon: User, label: `Maria Santos`, detail: "Assistente · Telegram vinculado", color: "text-muted-foreground" },
  ].filter(r => r.label.toLowerCase().includes(query.toLowerCase())) : [];

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent/60 text-muted-foreground text-sm hover:bg-accent transition-colors"
      >
        <Search className="w-3.5 h-3.5" />
        <span>Buscar...</span>
        <kbd className="hidden sm:inline-flex ml-2 text-[10px] bg-background px-1.5 py-0.5 rounded border border-border font-mono">
          ⌘K
        </kbd>
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-foreground/5 backdrop-blur-sm z-50" onClick={() => { setOpen(false); setQuery(""); }} />

      {/* Search panel */}
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg z-50">
        <div className="glass-card shadow-lg overflow-hidden">
          <div className="flex items-center gap-3 p-4 border-b border-border/50">
            <Search className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar transações, cartões, usuários..."
              className="flex-1 bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
            />
            <button onClick={() => { setOpen(false); setQuery(""); }} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>

          {results.length > 0 && (
            <div className="p-2 max-h-72 overflow-auto">
              {results.map((r, i) => (
                <button
                  key={i}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent/60 transition-colors text-left"
                >
                  <r.icon className={`w-4 h-4 ${r.color} flex-shrink-0`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{r.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.detail}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {query.length > 1 && results.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nenhum resultado para "{query}"
            </div>
          )}
        </div>
      </div>
    </>
  );
}
