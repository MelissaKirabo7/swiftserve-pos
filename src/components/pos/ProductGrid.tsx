import { Plus, TriangleAlert } from "lucide-react";
import { formatMoney, SETTINGS, type Product } from "@/data/catalog";
import { cn } from "@/lib/utils";

export function ProductGrid({
  products,
  onAdd,
}: {
  products: Product[];
  onAdd: (p: Product) => void;
}) {
  if (products.length === 0) {
    return (
      <div className="grid place-items-center rounded-2xl border border-dashed border-border py-20 text-sm text-muted-foreground">
        No products match this search.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {products.map((p) => {
        const out = p.stock <= 0;
        const low = !out && p.stock <= SETTINGS.lowStockAlert;
        return (
          <button
            key={p.id}
            type="button"
            disabled={out}
            onClick={() => onAdd(p)}
            className={cn(
              "group relative flex flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-3 text-left shadow-tile transition-all",
              out
                ? "cursor-not-allowed opacity-55"
                : "hover:-translate-y-0.5 hover:border-primary/40 active:translate-y-0 active:scale-[0.99]",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="rounded-lg bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-secondary-foreground">
                {p.category}
              </span>
              {low ? (
                <span className="flex items-center gap-1 rounded-lg bg-warning/20 px-1.5 py-0.5 text-[10px] font-semibold text-warning-foreground">
                  <TriangleAlert className="size-3" /> Low
                </span>
              ) : null}
              {out ? (
                <span className="rounded-lg bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                  Out
                </span>
              ) : null}
            </div>

            <div>
              <p className="font-display text-sm font-semibold leading-snug">{p.name}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground numeric">
                {p.sku} · {p.stock} in stock
              </p>
            </div>

            <div className="flex items-center justify-between">
              <span className="font-display text-base font-bold numeric">
                {formatMoney(p.price)}
              </span>
              <span className="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground transition-transform group-hover:scale-105">
                <Plus className="size-4" />
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
