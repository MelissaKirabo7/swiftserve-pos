import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { HandCoins, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SETTINGS, formatMoney } from "@/data/catalog";
import { usePos, type Customer, type PaymentMethod } from "@/lib/pos-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/customers")({
  head: () => ({
    meta: [
      { title: "Customers & Debt · Aquila's Daddies POS" },
      {
        name: "description",
        content:
          "Monitor outstanding customer debt, record partial payments against credit sales and keep a full settlement log.",
      },
      { property: "og:title", content: "Customers & Debt · Aquila's Daddies POS" },
      {
        property: "og:description",
        content: "Credit limits, debt balances, partial payments and settlement history.",
      },
    ],
  }),
  component: CustomersPage,
});

function CustomersPage() {
  const { customers, settlements, settleDebt, upsertCustomer } = usePos();
  const [query, setQuery] = useState("");
  const [debtOnly, setDebtOnly] = useState(false);
  const [target, setTarget] = useState<Customer | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("Cash");
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newLimit, setNewLimit] = useState(String(SETTINGS.defaultCreditLimit));

  const rows = useMemo(
    () =>
      customers
        .filter(
          (c) =>
            c.name.toLowerCase().includes(query.toLowerCase()) && (!debtOnly || c.balance > 0),
        )
        .sort((a, b) => b.balance - a.balance),
    [customers, query, debtOnly],
  );

  const totalDebt = customers.reduce((sum, c) => sum + c.balance, 0);

  return (
    <AppShell
      title="Customers & Debt"
      subtitle={`${customers.length} customers · ${formatMoney(totalDebt)} outstanding`}
      actions={
        <Button size="sm" onClick={() => setNewOpen(true)}>
          <UserPlus className="size-4" /> New customer
        </Button>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search customers…"
                className="h-11 pl-9"
              />
            </div>
            <Button
              size="sm"
              variant={debtOnly ? "default" : "secondary"}
              className="rounded-xl"
              onClick={() => setDebtOnly((v) => !v)}
            >
              Owing only
            </Button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-tile">
            <ul className="divide-y divide-border">
              {rows.map((c) => {
                const over = c.balance > c.creditLimit;
                return (
                  <li
                    key={c.id}
                    className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_auto] lg:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="text-[11px] text-muted-foreground numeric">
                        {c.totalPackets} packets bought{c.phone ? ` · ${c.phone}` : ""}
                      </p>
                    </div>
                    <div className="numeric text-sm">
                      <p
                        className={cn(
                          "font-semibold",
                          c.balance > 0 ? "text-destructive" : "text-success",
                        )}
                      >
                        {formatMoney(c.balance)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">owing</p>
                    </div>
                    <div className="numeric text-sm">
                      <p>{formatMoney(c.totalPaid)}</p>
                      <p className="text-[11px] text-muted-foreground">paid to date</p>
                    </div>
                    <div className="space-y-1">
                      <Input
                        aria-label={`Credit limit for ${c.name}`}
                        className="h-9 numeric"
                        value={c.creditLimit}
                        onChange={(e) =>
                          upsertCustomer({
                            name: c.name,
                            phone: c.phone,
                            creditLimit: Number(e.target.value) || 0,
                          })
                        }
                      />
                      <p
                        className={cn(
                          "text-[11px]",
                          over ? "font-semibold text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {over ? "Over limit" : "Credit limit"}
                      </p>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant={c.balance > 0 ? "default" : "secondary"}
                        disabled={c.balance <= 0}
                        onClick={() => {
                          setTarget(c);
                          setAmount(String(c.balance));
                          setMethod("Cash");
                        }}
                      >
                        <HandCoins className="size-3.5" /> Record payment
                      </Button>
                    </div>
                  </li>
                );
              })}
              {rows.length === 0 ? (
                <li className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No customers match this search.
                </li>
              ) : null}
            </ul>
          </div>
        </div>

        <aside className="rounded-2xl border border-border bg-card p-4 shadow-tile">
          <h2 className="font-display text-sm font-semibold">Settlement log</h2>
          <p className="text-[11px] text-muted-foreground">Debt payments recorded in this shop</p>
          <ul className="mt-3 space-y-2">
            {settlements.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-secondary px-3 py-2 text-sm"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{s.customer}</span>
                  <span className="text-[11px] text-muted-foreground numeric">
                    {s.date} · {s.method}
                  </span>
                </span>
                <span className="numeric font-semibold text-success">
                  {formatMoney(s.amount)}
                </span>
              </li>
            ))}
            {settlements.length === 0 ? (
              <li className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                No settlements yet. Recorded payments appear here.
              </li>
            ) : null}
          </ul>
        </aside>
      </div>

      <Dialog open={Boolean(target)} onOpenChange={() => setTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Record debt payment</DialogTitle>
            <DialogDescription>
              {target?.name} owes{" "}
              <span className="numeric font-semibold text-foreground">
                {formatMoney(target?.balance ?? 0)}
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="settle-amount">Amount received</Label>
              <Input
                id="settle-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-12 text-lg font-semibold numeric"
              />
            </div>
            <div className="flex gap-1.5">
              {(["Cash", "Mobile Money", "Card"] as PaymentMethod[]).map((m) => (
                <Button
                  key={m}
                  size="sm"
                  variant={m === method ? "default" : "secondary"}
                  className="flex-1 rounded-xl"
                  onClick={() => setMethod(m)}
                >
                  {m}
                </Button>
              ))}
            </div>
            <Button
              size="lg"
              className="h-12 w-full"
              disabled={!target || (Number(amount) || 0) <= 0}
              onClick={() => {
                if (!target) return;
                const value = Math.min(Number(amount) || 0, target.balance);
                settleDebt(target.name, value, method);
                toast.success(`${formatMoney(value)} recorded for ${target.name}`);
                setTarget(null);
              }}
            >
              Save payment
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">New customer</DialogTitle>
            <DialogDescription>Set a credit limit to control unpaid sales.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-name">Name</Label>
              <Input id="new-name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-phone">Phone (optional)</Label>
              <Input
                id="new-phone"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="numeric"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-limit">Credit limit</Label>
              <Input
                id="new-limit"
                value={newLimit}
                onChange={(e) => setNewLimit(e.target.value)}
                className="numeric"
              />
            </div>
            <Button
              className="w-full"
              disabled={!newName.trim()}
              onClick={() => {
                upsertCustomer({
                  name: newName.trim(),
                  phone: newPhone.trim() || undefined,
                  creditLimit: Number(newLimit) || 0,
                });
                toast.success(`${newName.trim()} added`);
                setNewName("");
                setNewPhone("");
                setNewOpen(false);
              }}
            >
              Add customer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
