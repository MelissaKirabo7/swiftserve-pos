import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatMoney } from "@/data/catalog";
import { lineTotal, type Order } from "@/lib/pos-store";

export function ReceiptModal({
  order,
  open,
  onOpenChange,
}: {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center font-display">Digital Receipt</DialogTitle>
        </DialogHeader>

        <div id="receipt-print" className="rounded-xl border border-dashed border-border p-4 text-sm">
          <div className="text-center">
            <p className="font-display text-base font-bold">Aquila&apos;s Daddies</p>
            <p className="text-[11px] text-muted-foreground">Popcorn · Kampala, UG</p>
            <p className="mt-1 text-[11px] text-muted-foreground numeric">
              {order.code} · {order.date}
            </p>
          </div>

          <dl className="mt-3 space-y-0.5 border-y border-dashed border-border py-2 text-[11px] text-muted-foreground">
            <div className="flex justify-between">
              <dt>Customer</dt>
              <dd className="text-foreground">{order.customer}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Served by</dt>
              <dd className="text-foreground">{order.seller}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Payment</dt>
              <dd className="text-foreground">{order.method}</dd>
            </div>
          </dl>

          <ul className="mt-2 space-y-1.5">
            {order.items.map((line) => (
              <li key={line.productId} className="flex justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate">{line.name}</span>
                  <span className="text-[11px] text-muted-foreground numeric">
                    {line.qty} × {formatMoney(line.price)}
                    {line.discount ? ` − ${formatMoney(line.discount)}` : ""}
                  </span>
                </span>
                <span className="numeric">{formatMoney(lineTotal(line))}</span>
              </li>
            ))}
          </ul>

          <dl className="mt-3 space-y-1 border-t border-dashed border-border pt-2">
            <div className="flex justify-between text-muted-foreground">
              <dt>Subtotal</dt>
              <dd className="numeric">{formatMoney(order.subtotal)}</dd>
            </div>
            {order.discount > 0 ? (
              <div className="flex justify-between text-muted-foreground">
                <dt>Discount</dt>
                <dd className="numeric">-{formatMoney(order.discount)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between font-display font-bold">
              <dt>Total</dt>
              <dd className="numeric">{formatMoney(order.total)}</dd>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <dt>Paid</dt>
              <dd className="numeric">{formatMoney(order.amountPaid)}</dd>
            </div>
            {order.balance > 0 ? (
              <div className="flex justify-between font-semibold text-destructive">
                <dt>Balance on credit</dt>
                <dd className="numeric">{formatMoney(order.balance)}</dd>
              </div>
            ) : null}
          </dl>

          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            Thank you! Keep the crunch going.
          </p>
        </div>

        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="size-4" /> Print receipt
        </Button>
      </DialogContent>
    </Dialog>
  );
}
