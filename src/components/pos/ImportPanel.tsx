import { useState } from "react";
import { FileUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePos, type CartLine, type PaymentMethod } from "@/lib/pos-store";

type Kind = "products" | "sales";
type Row = Record<string, unknown>;
type Parsed = { ok: Row[]; errors: string[] };

const METHODS: PaymentMethod[] = ["Cash", "Mobile Money", "Card", "Credit", "Split"];
const METHOD_ALIASES: Record<string, PaymentMethod> = { partial: "Credit", momo: "Mobile Money", mobile: "Mobile Money", unpaid: "Credit" };

const TEMPLATE_HEADERS = ["Date", "Customer", "Packets Bought", "Sale Value", "Profit", "Payment Method", "Amount Paid", "Outstanding Balance", "Status", "Seller", "Notes", "Product"];

async function downloadTemplate() {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    TEMPLATE_HEADERS,
    ["2026-10-02", "Walk-in", 2, 3000, 1000, "Cash", 3000, 0, "Paid", "Aquila", "", ""],
    ["2026-10-02", "Denely", 1, 1500, 500, "Credit", 0, 1500, "Unpaid", "Jeremy", "", ""],
    ["2026-10-02", "Emily", 3, 4500, 1500, "Partial", 2000, 2500, "Partial", "Jeremy", "", ""],
  ]), "Sales Entry");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Name", "Price", "Cost", "Stock", "Category", "SKU", "Packets"],
    ["Daddies Normal Pack", 1500, 1000, 100, "Packets", "", 1],
  ]), "Items");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["How to use"],
    ["Sales Entry: one row per sale. Required: Date, Customer, Packets Bought, Payment Method (Cash, Credit, Partial, Mobile Money, Card)."],
    ["Amount Paid: leave empty for full payment (Cash) or 0 (Credit). Partial = enter what was paid; the rest becomes the customer's debt."],
    ["Product is optional; when empty, Daddies Normal Pack is used. Sale Value, Profit, Outstanding Balance and Status are worked out by the system."],
    ["Items sheet: import it with 'Items & stock' to add or update products and stock."],
  ]), "Instructions");
  XLSX.writeFile(wb, "Aquilas_Daddies_Import_Template.xlsx");
}

function key(row: Row, ...names: string[]) {
  for (const k of Object.keys(row)) {
    const n = k.toLowerCase().replace(/[^a-z]/g, "");
    if (names.includes(n)) return row[k];
  }
  return undefined;
}
const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
const str = (v: unknown) => String(v ?? "").trim();

function toDate(v: unknown): string | null {
  if (typeof v === "number") {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return d.toISOString().slice(0, 10);
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = str(v);
  if (!s) return new Date().toISOString().slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function ImportPanel() {
  const { products, users, addProduct, updateProduct, checkout } = usePos();
  const [kind, setKind] = useState<Kind>("products");
  const [file, setFile] = useState<string>("");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [drag, setDrag] = useState(false);

  const validate = (rows: Row[]): Parsed => {
    const ok: Row[] = [];
    const errors: string[] = [];
    rows.forEach((r, i): void => {
      const line = `Row ${i + 2}`;
      if (kind === "products") {
        const name = str(key(r, "name", "product", "item"));
        const price = num(key(r, "price", "sellingprice"));
        const stock = num(key(r, "stock", "qty", "quantity") ?? 0);
        if (!name) { errors.push(`${line}: missing product name`); return; }
        if (!(price > 0)) { errors.push(`${line}: price must be a positive number`); return; }
        if (Number.isNaN(stock) || stock < 0) { errors.push(`${line}: stock is not valid`); return; }
        ok.push({
          name,
          price,
          stock,
          cost: num(key(r, "cost", "costprice")) || 0,
          category: str(key(r, "category")) || "Packets",
          sku: str(key(r, "sku", "code")) || name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 16),
          packets: num(key(r, "packets", "packs")) || 1,
        });
      } else {
        if (!str(key(r, "customer", "client")) && !(num(key(r, "qty", "quantity", "packets", "packetsbought")) > 0)) return;
        const pname = str(key(r, "product", "item", "sku"));
        const fallback = products.find((p) => /normal/i.test(p.name)) ?? products.find((p) => p.packets === 1) ?? products[0];
        const product = pname
          ? products.find((p) => p.name.toLowerCase() === pname.toLowerCase() || p.sku.toLowerCase() === pname.toLowerCase())
          : fallback;
        const qty = num(key(r, "qty", "quantity", "packets", "packetsbought"));
        const customer = str(key(r, "customer", "client"));
        const date = toDate(key(r, "date"));
        const seller = str(key(r, "seller", "rep", "salesrep")) || users.find((u) => u.role === "owner")?.name || "";
        const methodRaw = str(key(r, "method", "payment", "paymentmethod")) || "Cash";
        const method = METHODS.find((m) => m.toLowerCase() === methodRaw.toLowerCase()) ?? METHOD_ALIASES[methodRaw.toLowerCase()];
        if (!product) { errors.push(`${line}: product "${pname}" not found in inventory`); return; }
        if (!(qty > 0)) { errors.push(`${line}: quantity must be positive`); return; }
        if (!customer) { errors.push(`${line}: missing customer`); return; }
        if (!date) { errors.push(`${line}: date is not valid`); return; }
        if (!method) { errors.push(`${line}: unknown payment method "${methodRaw}"`); return; }
        const saleValue = num(key(r, "salevalue", "total", "value"));
        const unitPrice = saleValue > 0 ? saleValue / qty : product.price;
        const total = unitPrice * qty;
        const paidRaw = key(r, "amountpaid", "paid");
        const paid = paidRaw === undefined || str(paidRaw) === "" ? (method === "Credit" ? 0 : total) : num(paidRaw);
        if (Number.isNaN(paid) || paid < 0) { errors.push(`${line}: amount paid is not valid`); return; }
        ok.push({ product, qty, customer, date, seller, method, paid, unitPrice });
      }
    });
    return { ok, errors };
  };

  const read = async (f: File) => {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer(), { cellDates: true });
      const preferred = kind === "sales" ? ["sales entry", "sales"] : ["items", "products", "inventory"];
      const sheetName = wb.SheetNames.find((n) => preferred.includes(n.toLowerCase())) ?? wb.SheetNames[0]!;
      const sheet = wb.Sheets[sheetName];
      if (!sheet) throw new Error("empty");
      const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: "" }).filter((r) => Object.values(r).some((v) => str(v) !== ""));
      if (rows.length === 0) throw new Error("empty");
      setFile(f.name);
      setParsed(validate(rows));
    } catch {
      toast.error("Could not read that file. Use .xlsx or .csv with a header row.");
    }
  };

  const run = () => {
    if (!parsed) return;
    let n = 0;
    for (const r of parsed.ok) {
      if (kind === "products") {
        const existing = products.find(
          (p) => p.sku.toLowerCase() === String(r['sku']).toLowerCase() || p.name.toLowerCase() === String(r['name']).toLowerCase(),
        );
        const rec = r as unknown as { name: string; price: number; cost: number; stock: number; category: string; sku: string; packets: number };
        if (existing) updateProduct(existing.id, { price: rec.price, cost: rec.cost || existing.cost, stock: rec.stock });
        else addProduct(rec);
      } else {
        const rec = r as unknown as { product: (typeof products)[number]; unitPrice: number; qty: number; customer: string; date: string; seller: string; method: PaymentMethod; paid: number };
        const line: CartLine = {
          productId: rec.product.id,
          name: rec.product.name,
          price: rec.unitPrice,
          qty: rec.qty,
          discount: 0,
          packets: rec.product.packets,
        };
        checkout({
          items: [line],
          customer: rec.customer,
          seller: rec.seller,
          sellerId: users.find((u) => u.name === rec.seller)?.id,
          date: rec.date,
          method: rec.method,
          amountPaid: rec.paid,
          note: "Imported",
        });
      }
      n += 1;
    }
    toast.success(`Imported ${n} ${kind === "products" ? "items" : "sales"}`);
    setParsed(null);
    setFile("");
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-tile xl:col-span-2">
      <h2 className="font-display text-lg font-semibold">Import from Excel or CSV</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Items: name, price, cost, stock, category, sku. Sales: use the "Sales Entry" sheet with Date, Customer, Packets Bought, Payment Method (Cash, Credit, Partial), Amount Paid, Seller. Product is optional.
      </p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" onClick={() => void downloadTemplate()}>Download template</Button>
        {(["products", "sales"] as Kind[]).map((k) => (
          <Button key={k} size="sm" variant={k === kind ? "default" : "secondary"} onClick={() => { setKind(k); setParsed(null); }}>
            {k === "products" ? "Items & stock" : "Historical sales"}
          </Button>
        ))}
      </div>
      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void read(f); }}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-sm ${drag ? "border-primary bg-primary/5" : "border-border"}`}
      >
        <FileUp className="size-6 text-muted-foreground" />
        <span>{file || "Drop a file here or click to choose"}</span>
        <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); e.target.value = ""; }} />
      </label>
      {parsed ? (
        <div className="mt-3 space-y-2 text-sm">
          <p><strong>{parsed.ok.length}</strong> rows ready · <strong className={parsed.errors.length ? "text-destructive" : ""}>{parsed.errors.length}</strong> rows skipped</p>
          {parsed.errors.length ? (
            <ul className="max-h-40 overflow-auto rounded-lg bg-destructive/5 p-2 text-xs text-destructive">
              {parsed.errors.slice(0, 50).map((e) => <li key={e}>{e}</li>)}
            </ul>
          ) : null}
          <Button disabled={parsed.ok.length === 0} onClick={run}>Import {parsed.ok.length} rows</Button>
        </div>
      ) : null}
    </section>
  );
}
