import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { ProductGrid } from "@/components/pos/ProductGrid";
import { CartPanel } from "@/components/pos/CartPanel";
import { PaymentModal, type PaymentResult } from "@/components/pos/PaymentModal";
import { ReceiptModal } from "@/components/pos/ReceiptModal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatMoney, type Product } from "@/data/catalog";
import { usePos, type CartLine, type Order } from "@/lib/pos-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Register · Aquila's Daddies POS" },
      {
        name: "description",
        content:
          "Fast touch register for Aquila's Daddies: product grid, live cart, split payments and credit sales.",
      },
      { property: "og:title", content: "Register · Aquila's Daddies POS" },
      {
        property: "og:description",
        content: "Ring up popcorn sales, take split payments and track credit in seconds.",
      },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const { products, customers, checkout, seller, orders } = usePos();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [items, setItems] = useState<CartLine[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [receipt, setReceipt] = useState<Order | null>(null);

  const categories = useMemo(
    () => ["All", ...new Set(products.map((p) => p.category))],
    [products],
  );

  const filtered = useMemo(
    () =>
      products.filter(
        (p) =>
          (category === "All" || p.category === category) &&
          (p.name.toLowerCase().includes(query.toLowerCase()) ||
            p.sku.toLowerCase().includes(query.toLowerCase())),
      ),
    [products, category, query],
  );

  const today = new Date().toISOString().slice(0, 10);
  const todayTotal = orders
    .filter((o) => o.date === today && o.status !== "Voided" && o.status !== "Refunded")
    .reduce((sum, o) => sum + o.total, 0);

  const addProduct = (p: Product) => {
    setItems((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === p.id ? { ...l, qty: Math.min(l.qty + 1, p.stock) } : l,
        );
      }
      return [
        ...prev,
        { productId: p.id, name: p.name, price: p.price, qty: 1, discount: 0, packets: p.packets },
      ];
    });
    toast.success(`${p.name} added`, { duration: 1200 });
  };

  const setQty = (productId: string, qty: number) => {
    const stock = products.find((p) => p.id === productId)?.stock ?? 0;
    if (qty <= 0) {
      setItems((prev) => prev.filter((l) => l.productId !== productId));
      return;
    }
    if (qty > stock) {
      toast.error(`Only ${stock} left in stock`);
      return;
    }
    setItems((prev) => prev.map((l) => (l.productId === productId ? { ...l, qty } : l)));
  };

  const confirmPayment = (result: PaymentResult) => {
    const order = checkout({ items, seller, ...result });
    setItems([]);
    setPayOpen(false);
    setReceipt(order);
    toast.success(
      order.balance > 0
        ? `Sale saved · ${formatMoney(order.balance)} on credit`
        : `Sale complete · ${formatMoney(order.total)}`,
    );
  };

  return (
    <AppShell
      title="Register"
      subtitle={`${seller} · today's sales ${formatMoney(todayTotal)}`}
      padded={false}
      actions={
        <div className="hidden rounded-xl bg-primary px-3 py-1.5 text-right text-primary-foreground sm:block">
          <p className="text-[10px] uppercase tracking-wide opacity-70">Today</p>
          <p className="font-display text-sm font-bold numeric">{formatMoney(todayTotal)}</p>
        </div>
      }
    >
      <div className="grid gap-4 p-4 lg:h-[calc(100vh-65px)] lg:grid-cols-[1fr_380px] lg:p-6">
        <div className="flex min-h-0 flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products or scan SKU…"
                className="h-11 pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <Button
                  key={c}
                  size="sm"
                  variant={c === category ? "default" : "secondary"}
                  onClick={() => setCategory(c)}
                  className={cn("rounded-xl", c === category && "shadow-tile")}
                >
                  {c}
                </Button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pb-2">
            <ProductGrid products={filtered} onAdd={addProduct} />
          </div>
        </div>

        <div className="lg:min-h-0">
          <CartPanel
            items={items}
            onQty={setQty}
            onDiscount={(productId, discount) =>
              setItems((prev) =>
                prev.map((l) => (l.productId === productId ? { ...l, discount } : l)),
              )
            }
            onRemove={(productId) =>
              setItems((prev) => prev.filter((l) => l.productId !== productId))
            }
            onClear={() => setItems([])}
            onCheckout={() => setPayOpen(true)}
          />
        </div>
      </div>

      <PaymentModal
        open={payOpen}
        onOpenChange={setPayOpen}
        items={items}
        customers={customers}
        onConfirm={confirmPayment}
      />
      <ReceiptModal order={receipt} open={Boolean(receipt)} onOpenChange={() => setReceipt(null)} />
    </AppShell>
  );
}
