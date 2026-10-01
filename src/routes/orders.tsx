import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Receipt, RotateCcw, Search, Ban, Pencil, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { ReceiptModal } from "@/components/pos/ReceiptModal";
import { EditOrderDialog } from "@/components/pos/EditOrderDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/data/catalog";
import { usePos, type Order, type OrderStatus } from "@/lib/pos-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "Orders · Aquila's Daddies POS" },
      {
        name: "description",
        content:
          "Search every sale, reprint digital receipts and void or refund transactions with automatic stock and debt reversal.",
      },
      { property: "og:title", content: "Orders · Aquila's Daddies POS" },
      {
        property: "og:description",
        content: "Complete transaction history with receipts, refunds and void controls.",
      },
    ],
  }),
  component: OrdersPage,
});

const STATUSES: (OrderStatus | "All")[] = [
  "All",
  "Paid",
  "Partial",
  "Unpaid",
  "Refunded",
  "Voided",
];

const statusClass: Record<OrderStatus, string> = {
  Paid: "bg-success/15 text-success",
  Partial: "bg-warning/15 text-warning-foreground",
  Unpaid: "bg-destructive/10 text-destructive",
  Refunded: "bg-secondary text-secondary-foreground",
  Voided: "bg-muted text-muted-foreground",
};

function OrdersPage() {
  const { orders, deletedOrders, voidOrder, refundOrder, canEditOrder, deleteOrderEntry, restoreOrderEntry, currentUser } = usePos();
  const [editing, setEditing] = useState<Order | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const isManager = currentUser?.role === "owner" || currentUser?.role === "superadmin";
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<OrderStatus | "All">("All");
  const [receipt, setReceipt] = useState<Order | null>(null);
  const [limit, setLimit] = useState(30);

  const rows = useMemo(
    () =>
      orders.filter((o) => {
        const q = query.trim().toLowerCase();
        const matches =
          !q ||
          o.code.toLowerCase().includes(q) ||
          o.customer.toLowerCase().includes(q) ||
          o.seller.toLowerCase().includes(q) ||
          o.date.includes(q);
        return matches && (status === "All" || o.status === status);
      }),
    [orders, query, status],
  );

  const collected = rows.reduce((sum, o) => sum + o.amountPaid, 0);

  return (
    <AppShell
      title="Orders"
      subtitle={`${rows.length} transactions · ${formatMoney(collected)} collected`}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search order code, customer, seller or date…"
              className="h-11 pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={s === status ? "default" : "secondary"}
                className="rounded-xl"
                onClick={() => setStatus(s)}
              >
                {s}
              </Button>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-tile">
          <ul className="divide-y divide-border">
            {rows.slice(0, limit).map((o) => (
              <li
                key={o.id}
                className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_auto] lg:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {o.customer}{" "}
                    <span className="text-[11px] font-normal text-muted-foreground numeric">
                      {o.code}
                    </span>
                  </p>
                  <p className="text-[11px] text-muted-foreground numeric">
                    {o.date} · {o.seller} · {o.packets} pkt · {o.method}
                  </p>
                </div>
                <div className="numeric text-sm">
                  <p className="font-semibold">{formatMoney(o.total)}</p>
                  <p className="text-[11px] text-muted-foreground">total</p>
                </div>
                <div className="numeric text-sm">
                  <p>{formatMoney(o.amountPaid)}</p>
                  <p className="text-[11px] text-muted-foreground">paid</p>
                </div>
                <div className="numeric text-sm">
                  <p className={cn(o.balance > 0 && "font-semibold text-destructive")}>
                    {formatMoney(o.balance)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">balance</p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <span
                    className={cn(
                      "rounded-lg px-2 py-1 text-[11px] font-semibold",
                      statusClass[o.status],
                    )}
                  >
                    {o.status}
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => setReceipt(o)}>
                    <Receipt className="size-3.5" /> Receipt
                  </Button>
                  {canEditOrder(o) ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setEditing(o)}>
                        <Pencil className="size-3.5" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive"
                        onClick={() => {
                          if (!window.confirm(`Delete mistaken entry ${o.code}? Stock and balances will be rolled back. Use Void instead for official cancellations.`)) return;
                          deleteOrderEntry(o.id);
                          toast.success(`${o.code} deleted · stock and totals rolled back`);
                        }}
                      >
                        <Trash2 className="size-3.5" /> Delete
                      </Button>
                    </>
                  ) : null}
                  {isManager && o.status !== "Voided" && o.status !== "Refunded" ? (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          refundOrder(o.id);
                          toast.success(`${o.code} refunded · stock returned`);
                        }}
                      >
                        <RotateCcw className="size-3.5" /> Refund
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          voidOrder(o.id);
                          toast.success(`${o.code} voided`);
                        }}
                      >
                        <Ban className="size-3.5" /> Void
                      </Button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
            {rows.length === 0 ? (
              <li className="px-4 py-10 text-center text-sm text-muted-foreground">
                No orders match this search.
              </li>
            ) : null}
          </ul>
        </div>

        {rows.length > limit ? (
          <div className="text-center">
            <Button variant="secondary" onClick={() => setLimit((l) => l + 30)}>
              Load more ({rows.length - limit} left)
            </Button>
          </div>
        ) : null}
      </div>

      {isManager && deletedOrders.length > 0 ? (
        <div className="mt-6">
          <Button variant="ghost" size="sm" onClick={() => setShowDeleted((v) => !v)}>
            {showDeleted ? "Hide" : "Show"} deleted entries ({deletedOrders.length})
          </Button>
          {showDeleted ? (
            <ul className="mt-2 divide-y divide-border rounded-2xl border border-border bg-card">
              {deletedOrders.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                  <span className="text-muted-foreground line-through">
                    {o.code} · {o.customer} · {formatMoney(o.total)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    deleted by {o.deletedBy ?? "—"} {o.deletedAt?.slice(0, 10)}
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => { restoreOrderEntry(o.id); toast.success(`${o.code} restored`); }}>
                    <Undo2 className="size-3.5" /> Restore
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <EditOrderDialog order={editing} onClose={() => setEditing(null)} />
      <ReceiptModal order={receipt} open={Boolean(receipt)} onOpenChange={() => setReceipt(null)} />
    </AppShell>
  );
}
