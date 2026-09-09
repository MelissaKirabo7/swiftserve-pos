import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";
import { toast } from "sonner";
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
          "Investor-ready sales analytics for any date range: revenue, margins, tips, unit sales, top sellers and a Z-report end-of-day summary.",
      },
      { property: "og:title", content: "Reports · Aquila's Daddies POS" },
      {
        property: "og:description",
        content:
          "Flexible date-range analytics with revenue, margins, tips, top sellers and CSV export.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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

type Preset = "today" | "7d" | "mtd" | "custom";

const PRESET_LABEL: Record<Preset, string> = {
  today: "Today",
  "7d": "Last 7 days",
  mtd: "Month to date",
  custom: "Custom range",
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

function presetRange(preset: Preset, from: string, to: string) {
  const now = new Date();
  const today = iso(now);
  if (preset === "today") return { start: today, end: today };
  if (preset === "7d") return { start: iso(new Date(Date.now() - 6 * 864e5)), end: today };
  if (preset === "mtd")
    return { start: `${today.slice(0, 8)}01`, end: today };
  return { start: from, end: to };
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function ReportsPage() {
  const { orders, customers, settlements, currentUser, allocations, products, saveSnapshot } =
    usePos();
  const [preset, setPreset] = useState<Preset>("today");
  const [from, setFrom] = useState(() => iso(new Date(Date.now() - 6 * 864e5)));
  const [to, setTo] = useState(() => iso(new Date()));
  const repOnly = currentUser?.role === "rep";

  const { start, end } = presetRange(preset, from, to);
  const rangeLabel = start === end ? start : `${start} → ${end}`;

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
  const rangeOrders = useMemo(
    () => live.filter((o) => o.date >= start && o.date <= end),
    [live, start, end],
  );
  const creditOrders = useMemo(() => rangeOrders.filter((o) => o.balance > 0), [rangeOrders]);
  const tipOrders = useMemo(() => rangeOrders.filter((o) => (o.tip ?? 0) > 0), [rangeOrders]);

  const sum = (list: typeof live, pick: (o: (typeof live)[number]) => number) =>
    list.reduce((total, o) => total + pick(o), 0);

  const revenue = sum(rangeOrders, (o) => o.total);
  const collected = sum(rangeOrders, (o) => o.amountPaid);
  const credit = sum(rangeOrders, (o) => o.balance);
  const profit = sum(rangeOrders, (o) => o.profit);
  const packets = sum(rangeOrders, (o) => o.packets);
  const tips = sum(rangeOrders, (o) => o.tip ?? 0);
  const margin = revenue ? (profit / revenue) * 100 : 0;

  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; value: number }>();
    rangeOrders.forEach((o) =>
      o.items.forEach((l) => {
        const row = map.get(l.productId) ?? { name: l.name, qty: 0, value: 0 };
        row.qty += l.qty;
        row.value += l.price * l.qty - l.discount;
        map.set(l.productId, row);
      }),
    );
    return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, 6);
  }, [rangeOrders]);

  const topCustomers = useMemo(
    () => [...customers].sort((a, b) => b.totalPaid - a.totalPaid).slice(0, 5),
    [customers],
  );

  const sellerRows = useMemo(() => {
    const map = new Map<string, { orders: number; total: number; profit: number; tips: number }>();
    rangeOrders.forEach((o) => {
      const row = map.get(o.seller) ?? { orders: 0, total: 0, profit: 0, tips: 0 };
      row.orders += 1;
      row.total += o.total;
      row.profit += o.profit;
      row.tips += o.tip ?? 0;
      map.set(o.seller, row);
    });
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [rangeOrders]);

  const methodRows = useMemo(() => {
    const map = new Map<string, number>();
    rangeOrders.forEach((o) => map.set(o.method, (map.get(o.method) ?? 0) + o.amountPaid));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [rangeOrders]);

  const rangeSettlements = settlements.filter((s) => s.date >= start && s.date <= end);
  const settled = rangeSettlements.reduce((t, s) => t + s.amount, 0);
  const outstanding = customers.reduce((t, c) => t + c.balance, 0);

  const repStock = useMemo(() => {
    const map = new Map<string, { assigned: number; sold: number }>();
    allocations.forEach((a) => {
      const row = map.get(a.rep) ?? { assigned: 0, sold: 0 };
      row.assigned += a.assigned;
      row.sold += a.sold;
      map.set(a.rep, row);
    });
    return [...map.entries()].sort((a, b) => b[1].assigned - a[1].assigned);
  }, [allocations]);

  const exportCsv = () => {
    const lines: string[] = [];
    lines.push(`Aquila's Daddies — Sales report`);
    lines.push(`Period,${start},${end}`);
    lines.push(`Prepared,${new Date().toISOString()}`);
    lines.push("");
    lines.push("Metric,Value");
    [
      ["Gross revenue", revenue],
      ["Cash & wallet collected", collected],
      ["Credit issued", credit],
      ["Debt settled", settled],
      ["Gross profit", profit],
      ["Margin %", Math.round(margin * 10) / 10],
      ["Tips collected", tips],
      ["Units (packets) sold", packets],
      ["Transactions", rangeOrders.length],
      [
        "Average basket",
        Math.round(rangeOrders.length ? revenue / rangeOrders.length : 0),
      ],
    ].forEach(([k, v]) => lines.push(`${k},${v}`));
    lines.push("");
    lines.push("Order,Date,Customer,Sales rep,Method,Total,Paid,Balance,Tip,Packets,Profit");
    rangeOrders.forEach((o) =>
      lines.push(
        [
          o.code,
          o.date,
          `"${o.customer}"`,
          `"${o.seller}"`,
          o.method,
          o.total,
          o.amountPaid,
          o.balance,
          o.tip ?? 0,
          o.packets,
          o.profit,
        ].join(","),
      ),
    );
    lines.push("");
    lines.push("Product,Units,Value");
    topProducts.forEach((p) => lines.push(`"${p.name}",${p.qty},${p.value}`));
    download(`aquilas-daddies-report-${start}_${end}.csv`, lines.join("\n"), "text/csv");
    toast.success("CSV exported");
  };

  const exportInvestorCsv = () => {
    const lines = [
      `Aquila's Daddies — Investor Overview Report`,
      `Period,${start},${end}`,
      `Prepared,${new Date().toISOString().slice(0, 10)}`,
      "",
      "Metric,Amount (UGX)",
      `Total revenue,${revenue}`,
      `Total transactions,${rangeOrders.length}`,
      `Gross profit,${profit}`,
      `Credit issued (accounts receivable),${credit}`,
      `Cash collected (payments received),${collected + settled}`,
    ];
    download(
      `aquilas-daddies-investor-overview-${start}_${end}.csv`,
      lines.join("\n"),
      "text/csv",
    );
    toast.success("Investor overview downloaded");
  };

  return (
    <AppShell
      title="Reports"
      subtitle={`${PRESET_LABEL[preset]} · ${rangeLabel} · ${rangeOrders.length} sales`}
      actions={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={exportCsv}>
            <Download className="size-4" /> CSV
          </Button>
          <Button size="sm" variant="secondary" onClick={() => window.print()}>
            <Printer className="size-4" /> PDF / Print
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-tile sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {(["today", "7d", "mtd", "custom"] as Preset[]).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={p === preset ? "default" : "secondary"}
                className="rounded-xl"
                onClick={() => setPreset(p)}
              >
                {PRESET_LABEL[p]}
              </Button>
            ))}
          </div>
          {preset === "custom" ? (
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <Label htmlFor="range-from" className="text-[11px] text-muted-foreground">
                  Start
                </Label>
                <Input
                  id="range-from"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-9"
                />
              </div>
              <div>
                <Label htmlFor="range-to" className="text-[11px] text-muted-foreground">
                  End
                </Label>
                <Input
                  id="range-to"
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
          ) : null}
          {repOnly ? null : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                saveSnapshot({
                  label: PRESET_LABEL[preset],
                  start,
                  end,
                  revenue,
                  collected,
                  credit,
                  profit,
                  tips,
                  packets,
                  orders: rangeOrders.length,
                });
                toast.success("Period archived for the superadmin");
              }}
            >
              Archive this period
            </Button>
          )}
        </section>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Revenue" value={formatMoney(revenue)} hint={rangeLabel} />
          <Stat
            label="Transactions"
            value={String(rangeOrders.length)}
            hint={`${packets} packets sold`}
          />
          <Stat
            label="Gross profit"
            value={formatMoney(profit)}
            hint={`${margin.toFixed(1)}% margin`}
          />
          <Stat label="Tips collected" value={formatMoney(tips)} hint={`${tipOrders.length} tips`} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Collected" value={formatMoney(collected)} hint="Cash, wallet & card" />
          <Stat label="Credit issued" value={formatMoney(credit)} hint="Within this period" />
          <Stat label="Debt settled" value={formatMoney(settled)} hint="Payments on old debt" />
          {repOnly ? null : (
            <Stat
              label="Total outstanding"
              value={formatMoney(outstanding)}
              hint="All customers, all time"
            />
          )}
        </div>

        {repOnly ? null : (
          <section className="rounded-2xl border border-border bg-card p-4 shadow-tile">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-sm font-semibold">
                  Investor Overview · {rangeLabel}
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  High-level financials only — no staff, tip or cost detail.
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={exportInvestorCsv}>
                <Download className="size-4" /> Download
              </Button>
            </div>
            <dl className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              {[
                ["Total revenue", formatMoney(revenue)],
                ["Transactions", String(rangeOrders.length)],
                ["Gross profit", formatMoney(profit)],
                ["Credit issued", formatMoney(credit)],
                ["Cash collected", formatMoney(collected + settled)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-secondary px-3 py-2">
                  <dt className="text-[11px] text-muted-foreground">{label}</dt>
                  <dd className="font-display text-base font-bold numeric">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <div className={cn("grid gap-4", repOnly ? "xl:grid-cols-1" : "xl:grid-cols-3")}>
          <section className="rounded-2xl border border-border bg-card p-4 shadow-tile">
            <h2 className="font-display text-sm font-semibold">
              Best-selling products · {rangeLabel}
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
                <li className="text-xs text-muted-foreground">
                  No sales recorded in this period.
                </li>
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
              <h2 className="font-display text-sm font-semibold">Sales rep leaderboard</h2>
              <ul className="mt-3 space-y-2">
                {sellerRows.map(([name, row]) => (
                  <li key={name} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">
                      {name}
                      <span className="ml-1 text-[11px] text-muted-foreground numeric">
                        {row.orders} sales · {formatMoney(row.profit)} profit · tips{" "}
                        {formatMoney(row.tips)}
                      </span>
                    </span>
                    <span className="numeric shrink-0 text-muted-foreground">
                      {formatMoney(row.total)}
                    </span>
                  </li>
                ))}
                {sellerRows.length === 0 ? (
                  <li className="text-xs text-muted-foreground">Nothing sold in this period.</li>
                ) : null}
              </ul>
            </section>
          )}
        </div>

        {repOnly ? null : (
          <section className="rounded-2xl border border-border bg-card p-4 shadow-tile">
            <h2 className="font-display text-sm font-semibold">
              Stock delegated to reps · live tracking
            </h2>
            <ul className="mt-3 space-y-2">
              {repStock.map(([rep, row]) => (
                <li
                  key={rep}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary px-3 py-2 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{rep}</span>
                    <span className="text-[11px] text-muted-foreground numeric">
                      assigned {row.assigned} · sold {row.sold}
                    </span>
                  </span>
                  <span className="numeric font-display font-bold">
                    {row.assigned - row.sold} left
                  </span>
                </li>
              ))}
              {repStock.length === 0 ? (
                <li className="text-xs text-muted-foreground">
                  No stock delegated yet — assign units from the Admin screen.
                </li>
              ) : null}
            </ul>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {products.length} products in the catalogue.
            </p>
          </section>
        )}

        <section
          id="receipt-print"
          className="rounded-2xl border border-dashed border-border bg-card p-4"
        >
          <h2 className="font-display text-sm font-semibold">ZED summary · {rangeLabel}</h2>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Gross sales", formatMoney(revenue)],
              ["Cash & wallet collected", formatMoney(collected)],
              ["Credit issued", formatMoney(credit)],
              ["Debt settled", formatMoney(settled)],
              ["Tips collected", formatMoney(tips)],
              ["Transactions", String(rangeOrders.length)],
              ["Packets moved", String(packets)],
              [
                "Average basket",
                formatMoney(rangeOrders.length ? revenue / rangeOrders.length : 0),
              ],
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
              Tips log · transaction, rep &amp; time
            </h3>
            <ul className="mt-1.5 space-y-1 text-sm">
              {tipOrders.map((o) => (
                <li
                  key={o.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-secondary px-2.5 py-1.5"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {o.code} · {o.customer}
                    </span>
                    <span className="text-[11px] text-muted-foreground numeric">
                      rep {o.seller}
                      {o.sellerId ? ` (${o.sellerId})` : ""} ·{" "}
                      {new Date(o.createdAt).toLocaleString("en-GB")}
                    </span>
                  </span>
                  <span className="numeric font-semibold text-success">
                    {formatMoney(o.tip ?? 0)}
                  </span>
                </li>
              ))}
              {tipOrders.length === 0 ? (
                <li className="text-xs text-muted-foreground">No tips in this period.</li>
              ) : null}
            </ul>
          </div>

          <div className="mt-3">
            <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Credit issued · customer &amp; sales rep
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
                      {o.code} · rep {o.seller} · paid {formatMoney(o.amountPaid)}
                    </span>
                  </span>
                  <span className="numeric font-semibold text-destructive">
                    {formatMoney(o.balance)}
                  </span>
                </li>
              ))}
              {creditOrders.length === 0 ? (
                <li className="text-xs text-muted-foreground">No credit issued in this period.</li>
              ) : null}
            </ul>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
