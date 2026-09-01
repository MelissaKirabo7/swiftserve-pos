import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, PackagePlus, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SETTINGS, formatMoney } from "@/data/catalog";
import { usePos } from "@/lib/pos-store";
import { cn } from "@/lib/utils";


export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory · Aquila's Daddies POS" },
      {
        name: "description",
        content:
          "Track popcorn stock levels, edit prices inline, restock fast and catch low-stock items before they sell out.",
      },
      { property: "og:title", content: "Inventory · Aquila's Daddies POS" },
      {
        property: "og:description",
        content: "Live stock tracking, low-stock alerts and quick price edits for every product.",
      },
    ],
  }),
  component: InventoryPage,
});

type Filter = "All" | "Low" | "Out";

function InventoryPage() {
  const { products, updateProduct, restock } = usePos();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("All");

  const rows = useMemo(
    () =>
      products.filter((p) => {
        const matches =
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          p.sku.toLowerCase().includes(query.toLowerCase());
        if (!matches) return false;
        if (filter === "Low") return p.stock > 0 && p.stock <= SETTINGS.lowStockAlert;
        if (filter === "Out") return p.stock === 0;
        return true;
      }),
    [products, query, filter],
  );

  const stockValue = products.reduce((sum, p) => sum + p.stock * p.cost, 0);
  const lowCount = products.filter(
    (p) => p.stock > 0 && p.stock <= SETTINGS.lowStockAlert,
  ).length;

  return (
    <AppShell
      title="Inventory"
      subtitle={`${products.length} products · stock value ${formatMoney(stockValue)}`}
      actions={
        lowCount ? (
          <Badge className="gap-1 bg-warning text-warning-foreground">
            <AlertTriangle className="size-3.5" /> {lowCount} low
          </Badge>
        ) : null
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or SKU…"
              className="h-11 pl-9"
            />
          </div>
          <div className="flex gap-1.5">
            {(["All", "Low", "Out"] as Filter[]).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={f === filter ? "default" : "secondary"}
                className="rounded-xl"
                onClick={() => setFilter(f)}
              >
                {f === "All" ? "All items" : f === "Low" ? "Low stock" : "Out of stock"}
              </Button>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-tile">
          <div className="hidden grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto] gap-3 border-b border-border px-4 py-2.5 text-[11px] uppercase tracking-wider text-muted-foreground lg:grid">
            <span>Product</span>
            <span>Cost</span>
            <span>Price</span>
            <span>Stock</span>
            <span>Status</span>
            <span className="text-right">Restock</span>
          </div>
          <ul className="divide-y divide-border">
            {rows.map((p) => {
              const low = p.stock > 0 && p.stock <= SETTINGS.lowStockAlert;
              return (
                <li
                  key={p.id}
                  className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto] lg:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground numeric">
                      {p.sku} · {p.category} · {p.packets} pkt
                    </p>
                  </div>
                  <Input
                    aria-label={`Cost for ${p.name}`}
                    className="h-9 numeric"
                    value={p.cost}
                    onChange={(e) => updateProduct(p.id, { cost: Number(e.target.value) || 0 })}
                  />
                  <Input
                    aria-label={`Price for ${p.name}`}
                    className="h-9 numeric"
                    value={p.price}
                    onChange={(e) => updateProduct(p.id, { price: Number(e.target.value) || 0 })}
                  />
                  <Input
                    aria-label={`Stock for ${p.name}`}
                    className="h-9 numeric"
                    value={p.stock}
                    onChange={(e) =>
                      updateProduct(p.id, { stock: Math.max(0, Number(e.target.value) || 0) })
                    }
                  />
                  <span
                    className={cn(
                      "w-fit rounded-lg px-2 py-1 text-[11px] font-semibold",
                      p.stock === 0
                        ? "bg-destructive/10 text-destructive"
                        : low
                          ? "bg-warning/15 text-warning-foreground"
                          : "bg-success/15 text-success",
                    )}
                  >
                    {p.stock === 0 ? "Out of stock" : low ? "Low stock" : "In stock"}
                  </span>
                  <div className="flex justify-end gap-1.5">
                    {[10, 50].map((amount) => (
                      <Button
                        key={amount}
                        size="sm"
                        variant="secondary"
                        className="numeric"
                        onClick={() => {
                          restock(p.id, amount);
                          toast.success(`+${amount} added to ${p.name}`);
                        }}
                      >
                        <PackagePlus className="size-3.5" />+{amount}
                      </Button>
                    ))}
                  </div>
                </li>
              );
            })}
            {rows.length === 0 ? (
              <li className="px-4 py-10 text-center text-sm text-muted-foreground">
                No products match this filter.
              </li>
            ) : null}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
