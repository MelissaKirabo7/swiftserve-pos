import { Minus, Plus, ShoppingCart, Tag, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatMoney } from "@/data/catalog";
import { cartTotals, lineTotal, type CartLine } from "@/lib/pos-store";

export function CartPanel({
  items,
  onQty,
  onDiscount,
  onRemove,
  onClear,
  onCheckout,
  customerHint,
}: {
  items: CartLine[];
  onQty: (productId: string, qty: number) => void;
  onDiscount: (productId: string, discount: number) => void;
  onRemove: (productId: string) => void;
  onClear: () => void;
  onCheckout: () => void;
  customerHint?: React.ReactNode;
}) {
  const { subtotal, discount, total, packets } = cartTotals(items);

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card shadow-panel">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="size-4 text-primary" />
          <h2 className="font-display text-sm font-semibold">Active Sale</h2>
          <span className="rounded-lg bg-secondary px-1.5 py-0.5 text-[11px] font-semibold text-secondary-foreground numeric">
            {items.length} lines · {packets} packets
          </span>
        </div>
        {items.length > 0 ? (
          <Button variant="ghost" size="sm" onClick={onClear} className="h-7 px-2 text-xs">
            <X className="size-3.5" /> Clear
          </Button>
        ) : null}
      </div>

      {customerHint ? <div className="border-b border-border p-4">{customerHint}</div> : null}

      <ScrollArea className="flex-1">
        <div className="space-y-2 p-3">
          {items.length === 0 ? (
            <div className="grid place-items-center gap-2 py-16 text-center">
              <ShoppingCart className="size-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                Tap a product to start the sale.
              </p>
            </div>
          ) : (
            items.map((line) => (
              <div
                key={line.productId}
                className="rounded-xl border border-border bg-background/60 p-3 animate-in fade-in slide-in-from-right-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{line.name}</p>
                    <p className="text-[11px] text-muted-foreground numeric">
                      {formatMoney(line.price)} each
                    </p>
                  </div>
                  <button
                    onClick={() => onRemove(line.productId)}
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Remove ${line.name}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>

                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-0.5">
                    <button
                      className="grid size-7 place-items-center rounded-lg hover:bg-secondary"
                      onClick={() => onQty(line.productId, line.qty - 1)}
                      aria-label="Decrease quantity"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <input
                      className="w-10 bg-transparent text-center text-sm font-semibold outline-none numeric"
                      value={line.qty}
                      onChange={(e) => onQty(line.productId, Number(e.target.value) || 0)}
                    />
                    <button
                      className="grid size-7 place-items-center rounded-lg hover:bg-secondary"
                      onClick={() => onQty(line.productId, line.qty + 1)}
                      aria-label="Increase quantity"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Tag className="size-3.5 text-muted-foreground" />
                    <Input
                      value={line.discount || ""}
                      placeholder="Disc."
                      onChange={(e) => onDiscount(line.productId, Number(e.target.value) || 0)}
                      className="h-8 w-20 text-right text-xs numeric"
                    />
                  </div>

                  <span className="font-display text-sm font-bold numeric">
                    {formatMoney(lineTotal(line))}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <div className="space-y-3 border-t border-border p-4">
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <dt>Subtotal</dt>
            <dd className="numeric">{formatMoney(subtotal)}</dd>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <dt>Discounts</dt>
            <dd className="numeric">-{formatMoney(discount)}</dd>
          </div>
          <div className="flex items-end justify-between border-t border-dashed border-border pt-2">
            <dt className="font-display text-sm font-semibold">Total due</dt>
            <dd className="font-display text-2xl font-bold text-primary numeric">
              {formatMoney(total)}
            </dd>
          </div>
        </dl>

        <Button
          size="lg"
          className="h-14 w-full text-base font-semibold"
          disabled={items.length === 0}
          onClick={onCheckout}
        >
          Charge {formatMoney(total)}
        </Button>
      </div>
    </div>
  );
}
