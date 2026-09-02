import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/data/catalog";
import { usePos } from "@/lib/pos-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports · Aquila's Daddies POS" },
      {
        name: "description",
        content:
          "Daily sales totals, transaction counts, top-selling products, best customers and a Z-report style end-of-day summary.",
      },
      { property: "og:title", content: "Reports · Aquila's Daddies POS" },
      {
        property: "og:description",
        content: "Sales dashboard with daily totals, top sellers and end-of-day ZED summary.",
      },
    ],
  }),
  component: ReportsPage,
});

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-tile">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold numeric">{value}</p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ReportsPage() {
  const { orders, customers, settlements, currentUser } = usePos();
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const repOnly = currentUser?.role === "rep";

  const live = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.status !== "Voided" &&
          o.status !== "Refunded" &&
          (!repOnly || o.seller === currentUser?.name),
      ),
    [orders, repOnly, currentUser],
  );
  const dayOrders = useMemo(() => live.filter((o) => o.date === day), [live, day]);
  const creditOrders = useMemo(
    () => dayOrders.filter((o) => o.balance > 0),
    [dayOrders],
  );


  const sum = (list: typeof live, pick: (o: (typeof live)[number]) => number) =>
    list.reduce((total, o) => total + pick(o), 0);

  const daySales = sum(dayOrders, (o) => o.total);
  const dayCash = sum(dayOrders, (o) => o.amountPaid);
  const dayCredit = sum(dayOrders, (o) => o.balance);
  const dayProfit = sum(dayOrders, (o) => o.profit);
  const dayPackets = sum(dayOrders, (o) => o.packets);

  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; value: number }>();
    dayOrders.forEach((o) =>
      o.items.forEach((l) => {
        const row = map.get(l.productId) ?? { name: l.name, qty: 0, value: 0 };
        row.qty += l.qty;
        row.value += l.price * l.qty - l.discount;
        map.set(l.productId, row);
      }),
    );
    return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [dayOrders]);

  const topCustomers = useMemo(
    () => [...customers].sort((a, b) => b.totalPaid - a.totalPaid).slice(0, 5),
    [customers],
  );

  const sellerRows = useMemo(() => {
    const map = new Map<string, { orders: number; total: number; profit: number }>();
    dayOrders.forEach((o) => {
      const row = map.get(o.seller) ?? { orders: 0, total: 0, profit: 0 };
      row.orders += 1;
      row.total += o.total;
      row.profit += o.profit;
      map.set(o.seller, row);
    });
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [dayOrders]);

  const methodRows = useMemo(() => {
    const map = new Map<string, number>();
    dayOrders.forEach((o) => map.set(o.method, (map.get(o.method) ?? 0) + o.amountPaid));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [dayOrders]);

  const daySettlements = settlements.filter((s) => s.date === day);
  const settledToday = daySettlements.reduce((t, s) => t + s.amount, 0);
  const outstanding = customers.reduce((t, c) => t + c.balance, 0);

  return (
    <AppShell
      title="Reports"
      subtitle={`${repOnly ? "Your" : "All-time"} revenue ${formatMoney(sum(live, (o) => o.total))} · ${live.length} sales`}
      actions={
        <div className="flex items-end gap-2">
          <div className="hidden sm:block">
            <Label htmlFor="report-day" className="text-[11px] text-muted-foreground">
              Business day
            </Label>
            <Input
              id="report-day"
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="h-9"
            />
          </div>
          <Button size="sm" variant="secondary" onClick={() => window.print()}>
            Print ZED
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="sm:hidden">
          <Label htmlFor="report-day-m">Business day</Label>
          <Input
            id="report-day-m"
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Sales" value={formatMoney(daySales)} hint={`${day}`} />
          <Stat
            label="Transactions"
            value={String(dayOrders.length)}
            hint={`${dayPackets} packets sold`}
          />
          <Stat label="Gross profit" value={formatMoney(dayProfit)} hint="Price minus cost" />
          <Stat
            label="On credit today"
            value={formatMoney(dayCredit)}
            hint={`${formatMoney(outstanding)} total outstanding`}
          />
        </div>

        <div className={cn("grid gap-4", repOnly ? "xl:grid-cols-1" : "xl:grid-cols-3")}>
          <section className="rounded-2xl border border-border bg-card p-4 shadow-tile">
            <h2 className="font-display text-sm font-semibold">
              Best-selling products · {day}
            </h2>
            <ol className="mt-3 space-y-2">
              {topProducts.map((p, i) => (
                <li key={p.name} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="mr-1.5 numeric text-muted-foreground">{i + 1}.</span>
                    {p.name}
                  </span>
                  <span className="numeric shrink-0 text-muted-foreground">
                    {p.qty} · {formatMoney(p.value)}
                  </span>
                </li>
              ))}
              {topProducts.length === 0 ? (
                <li className="text-xs text-muted-foreground">No sales recorded for this day.</li>
              ) : null}
            </ol>
          </section>

          {repOnly ? null : (
            <section className="rounded-2xl border border-border bg-card p-4 shadow-tile">
              <h2 className="font-display text-sm font-semibold">Top customers (all time)</h2>
              <ul className="mt-3 space-y-2">
                {topCustomers.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{c.name}</span>
                    <span className="numeric shrink-0 text-muted-foreground">
                      {formatMoney(c.totalPaid)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {repOnly ? null : (
            <section className="rounded-2xl border border-border bg-card p-4 shadow-tile">
              <h2 className="font-display text-sm font-semibold">
                Sales rep leaderboard · {day}
              </h2>
              <ul className="mt-3 space-y-2">
                {sellerRows.map(([name, row]) => (
                  <li key={name} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">
                      {name}
                      <span className="ml-1 text-[11px] text-muted-foreground numeric">
                        {row.orders} sales · {formatMoney(row.profit)} profit
                      </span>
                    </span>
                    <span className="numeric shrink-0 text-muted-foreground">
                      {formatMoney(row.total)}
                    </span>
                  </li>
                ))}
                {sellerRows.length === 0 ? (
                  <li className="text-xs text-muted-foreground">Nothing sold on this day.</li>
                ) : null}
              </ul>
            </section>
          )}
        </div>


        <section
          id="receipt-print"
          className="rounded-2xl border border-dashed border-border bg-card p-4"
        >
          <h2 className="font-display text-sm font-semibold">ZED summary · {day}</h2>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Gross sales", formatMoney(daySales)],
              ["Cash & wallet collected", formatMoney(dayCash)],
              ["Credit issued", formatMoney(dayCredit)],
              ["Debt settled", formatMoney(settledToday)],
              ["Transactions", String(dayOrders.length)],
              ["Packets moved", String(dayPackets)],
              [
                "Average basket",
                formatMoney(dayOrders.length ? daySales / dayOrders.length : 0),
              ],
              ["Gross profit", formatMoney(dayProfit)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-secondary px-3 py-2">
                <dt className="text-[11px] text-muted-foreground">{label}</dt>
                <dd className="font-display text-base font-bold numeric">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3">
            <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Payment breakdown
            </h3>
            <ul className="mt-1.5 space-y-1 text-sm">
              {methodRows.map(([m, value]) => (
                <li key={m} className="flex justify-between">
                  <span>{m}</span>
                  <span className="numeric">{formatMoney(value)}</span>
                </li>
              ))}
              {methodRows.length === 0 ? (
                <li className="text-xs text-muted-foreground">No payments taken.</li>
              ) : null}
            </ul>
          </div>
          <div className="mt-3">
            <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Credit issued today · customer &amp; sales rep
            </h3>
            <ul className="mt-1.5 space-y-1 text-sm">
              {creditOrders.map((o) => (
                <li
                  key={o.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-secondary px-2.5 py-1.5"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{o.customer}</span>
                    <span className="text-[11px] text-muted-foreground numeric">
                      {o.id} · rep {o.seller} · paid {formatMoney(o.amountPaid)}
                    </span>
                  </span>
                  <span className="numeric font-semibold text-destructive">
                    {formatMoney(o.balance)}
                  </span>
                </li>
              ))}
              {creditOrders.length === 0 ? (
                <li className="text-xs text-muted-foreground">No credit issued on this day.</li>
              ) : null}
            </ul>
          </div>

        </section>
      </div>
    </AppShell>
  );
}
