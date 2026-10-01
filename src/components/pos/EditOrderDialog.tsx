import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/data/catalog";
import { cartTotals, usePos, type CartLine, type Order, type PaymentMethod } from "@/lib/pos-store";

const METHODS: PaymentMethod[] = ["Cash", "Mobile Money", "Card", "Credit"];

export function EditOrderDialog({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const { updateOrder, currentUser } = usePos();
  const [items, setItems] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState("");
  const [date, setDate] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("Cash");
  const [paid, setPaid] = useState("0");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!order) return;
    setItems(order.items.map((i) => ({ ...i })));
    setCustomer(order.customer);
    setDate(order.date);
    setMethod(order.method);
    setPaid(String(order.amountPaid));
    setNote(order.note ?? "");
  }, [order]);

  const canDate = currentUser?.role !== "rep";
  const live = items.filter((i) => i.qty > 0);
  const totals = cartTotals(live);

  const save = () => {
    if (!order) return;
    if (live.length === 0) { toast.error("A sale needs at least one item — delete it instead."); return; }
    if (!customer.trim()) { toast.error("Customer is required"); return; }
    const amount = Number(paid);
    if (!Number.isFinite(amount) || amount < 0) { toast.error("Amount paid is not valid"); return; }
    updateOrder(order.id, {
      items: live,
      customer: customer.trim(),
      date: canDate ? date : order.date,
      method,
      amountPaid: amount,
      note,
    });
    toast.success(`${order.code} corrected · stock and balances updated`);
    onClose();
  };

  return (
    <Dialog open={Boolean(order)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Correct sale {order?.code}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {items.map((it, idx) => (
            <div key={it.productId} className="flex items-center gap-2">
              <span className="flex-1 truncate text-sm">{it.name}</span>
              <Input
                type="number"
                min={0}
                className="w-20"
                value={it.qty}
                onChange={(e) =>
                  setItems((prev) => prev.map((p, i) => (i === idx ? { ...p, qty: Math.max(0, Number(e.target.value) || 0) } : p)))
                }
              />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Customer</Label>
              <Input value={customer} onChange={(e) => setCustomer(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={date} disabled={!canDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Method</Label>
              <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm">
                {METHODS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Amount paid</Label>
              <Input type="number" min={0} value={paid} onChange={(e) => setPaid(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Reason / note</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. wrong quantity entered" />
          </div>
          <p className="text-sm">New total: <strong>{formatMoney(totals.total)}</strong></p>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save correction</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
