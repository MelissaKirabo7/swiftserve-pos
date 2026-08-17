import { useEffect, useMemo, useState } from "react";
import { Banknote, CreditCard, Smartphone, SplitSquareHorizontal, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/data/catalog";
import { cn } from "@/lib/utils";
import type { CartLine, Customer, PaymentMethod } from "@/lib/pos-store";
import { cartTotals } from "@/lib/pos-store";

const METHODS: { id: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { id: "Cash", label: "Cash", icon: Banknote },
  { id: "Mobile Money", label: "Digital Wallet", icon: Smartphone },
  { id: "Card", label: "Card", icon: CreditCard },
  { id: "Credit", label: "Credit / Unpaid", icon: Wallet },
  { id: "Split", label: "Split Payment", icon: SplitSquareHorizontal },
];

export type PaymentResult = {
  method: PaymentMethod;
  amountPaid: number;
  splitCash?: number;
  splitOther?: number;
  customer: string;
  date: string;
  note?: string;
};

export function PaymentModal({
  open,
  onOpenChange,
  items,
  customers,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CartLine[];
  customers: Customer[];
  onConfirm: (result: PaymentResult) => void;
}) {
  const { total } = cartTotals(items);
  const [method, setMethod] = useState<PaymentMethod>("Cash");
  const [customer, setCustomer] = useState("Walk-in");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [tendered, setTendered] = useState("");
  const [splitCash, setSplitCash] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setMethod("Cash");
      setTendered(String(total));
      setSplitCash("");
      setNote("");
    }
  }, [open, total]);

  const profile = useMemo(
    () => customers.find((c) => c.name.toLowerCase() === customer.trim().toLowerCase()),
    [customers, customer],
  );

  const cashPart = Number(splitCash) || 0;
  const amountPaid =
    method === "Credit"
      ? 0
      : method === "Split"
        ? Math.min(cashPart, total)
        : Math.min(Number(tendered) || 0, total);
  const balance = Math.max(0, total - amountPaid);
  const change = method === "Cash" ? Math.max(0, (Number(tendered) || 0) - total) : 0;

  const projectedDebt = (profile?.balance ?? 0) + balance;
  const limit = profile?.creditLimit ?? 0;
  const blocked = Boolean(profile) && balance > 0 && projectedDebt > limit;

  const suggestions = [total, 5000, 10000, 20000, 50000];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">Take payment</DialogTitle>
          <DialogDescription>
            {items.length} line{items.length === 1 ? "" : "s"} ·{" "}
            <span className="font-semibold text-foreground numeric">{formatMoney(total)}</span> due
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pay-customer">Customer</Label>
              <Input
                id="pay-customer"
                list="customer-options"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                placeholder="Search or add customer"
              />
              <datalist id="customer-options">
                {customers.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-date">Sale date (back-date allowed)</Label>
              <Input
                id="pay-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          {profile && profile.balance > 0 ? (
            <div className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
              <span className="font-semibold">{profile.name}</span> already owes{" "}
              <span className="numeric font-semibold">{formatMoney(profile.balance)}</span> · credit
              limit <span className="numeric">{formatMoney(profile.creditLimit)}</span>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {METHODS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMethod(m.id)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
                  method === m.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:border-primary/40",
                )}
              >
                <m.icon className="size-4" />
                {m.label}
              </button>
            ))}
          </div>

          {method === "Split" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="split-cash">Cash / wallet part</Label>
                <Input
                  id="split-cash"
                  value={splitCash}
                  onChange={(e) => setSplitCash(e.target.value)}
                  className="numeric"
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Remainder on credit</Label>
                <div className="flex h-9 items-center rounded-md border border-input px-3 text-sm numeric">
                  {formatMoney(balance)}
                </div>
              </div>
            </div>
          ) : method === "Credit" ? (
            <div className="rounded-xl bg-secondary px-3 py-2.5 text-sm text-secondary-foreground">
              Full amount recorded as outstanding debt for {customer || "the customer"}.
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="tendered">Amount received</Label>
              <Input
                id="tendered"
                value={tendered}
                onChange={(e) => setTendered(e.target.value)}
                className="h-12 text-lg font-semibold numeric"
              />
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((amount, i) => (
                  <Button
                    key={`${amount}-${i}`}
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setTendered(String(amount))}
                    className="numeric"
                  >
                    {i === 0 ? "Exact" : formatMoney(amount)}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="pay-note">Note (optional)</Label>
            <Input
              id="pay-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. delivered to school gate"
            />
          </div>

          <dl className="grid grid-cols-3 gap-2 rounded-xl bg-secondary p-3 text-center text-xs">
            <div>
              <dt className="text-muted-foreground">Paid now</dt>
              <dd className="font-display text-base font-bold numeric">
                {formatMoney(amountPaid)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Balance</dt>
              <dd className="font-display text-base font-bold text-destructive numeric">
                {formatMoney(balance)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Change</dt>
              <dd className="font-display text-base font-bold numeric">{formatMoney(change)}</dd>
            </div>
          </dl>

          {blocked ? (
            <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
              Credit blocked: this sale would push {profile?.name} to{" "}
              <span className="numeric">{formatMoney(projectedDebt)}</span>, above their{" "}
              <span className="numeric">{formatMoney(limit)}</span> limit.
            </p>
          ) : null}

          <Button
            size="lg"
            className="h-14 w-full text-base font-semibold"
            disabled={blocked || !customer.trim()}
            onClick={() =>
              onConfirm({
                method,
                amountPaid,
                splitCash: method === "Split" ? cashPart : undefined,
                splitOther: method === "Split" ? balance : undefined,
                customer: customer.trim(),
                date,
                note: note.trim() || undefined,
              })
            }
          >
            Complete sale · {formatMoney(total)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
