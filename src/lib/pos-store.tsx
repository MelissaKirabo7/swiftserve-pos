import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { SEED_PRODUCTS, SETTINGS, type Product } from "@/data/catalog";
import { SEED_SALES } from "@/data/seed-sales";

export type PaymentMethod = "Cash" | "Mobile Money" | "Card" | "Credit" | "Split";
export type OrderStatus = "Paid" | "Partial" | "Unpaid" | "Refunded" | "Voided";

export type CartLine = {
  productId: string;
  name: string;
  price: number;
  qty: number;
  discount: number;
  packets: number;
};

export type Order = {
  id: string;
  code: string;
  date: string; // YYYY-MM-DD
  createdAt: string;
  items: CartLine[];
  subtotal: number;
  discount: number;
  total: number;
  profit: number;
  packets: number;
  method: PaymentMethod;
  splitCash?: number;
  splitOther?: number;
  amountPaid: number;
  balance: number;
  status: OrderStatus;
  customer: string;
  seller: string;
  note?: string;
};

export type Customer = {
  id: string;
  name: string;
  phone?: string;
  creditLimit: number;
  balance: number;
  totalPaid: number;
  totalPackets: number;
};

export type Settlement = {
  id: string;
  date: string;
  customer: string;
  amount: number;
  method: PaymentMethod;
  note?: string;
};

type State = {
  products: Product[];
  orders: Order[];
  customers: Customer[];
  settlements: Settlement[];
};

const STORAGE_KEY = "aquila-pos-v1";

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function buildSeed(): State {
  const products = SEED_PRODUCTS.map((p) => ({ ...p }));
  const packetProduct = products[0];
  const customers = new Map<string, Customer>();
  const orders: Order[] = [];

  SEED_SALES.forEach((sale, index) => {
    const name = sale.customer;
    const key = slug(name);
    if (!customers.has(key)) {
      customers.set(key, {
        id: `c-${key}`,
        name,
        creditLimit: SETTINGS.defaultCreditLimit,
        balance: 0,
        totalPaid: 0,
        totalPackets: 0,
      });
    }
    const customer = customers.get(key)!;
    customer.balance += sale.balance;
    customer.totalPaid += sale.paid;
    customer.totalPackets += sale.qty;

    const method: PaymentMethod =
      sale.method === "Credit"
        ? "Credit"
        : sale.method === "Partial"
          ? "Split"
          : sale.method === "Cash"
            ? "Cash"
            : "Mobile Money";

    orders.push({
      id: `o-seed-${index}`,
      code: `AD-${String(1000 + index)}`,
      date: sale.date,
      createdAt: `${sale.date}T12:00:00.000Z`,
      items: [
        {
          productId: packetProduct.id,
          name: packetProduct.name,
          price: SETTINGS.sellingPrice,
          qty: sale.qty,
          discount: 0,
          packets: 1,
        },
      ],
      subtotal: sale.value,
      discount: 0,
      total: sale.value,
      profit: sale.profit,
      packets: sale.qty,
      method,
      amountPaid: sale.paid,
      balance: sale.balance,
      status:
        sale.status === "Paid" ? "Paid" : sale.status === "Partial" ? "Partial" : "Unpaid",
      customer: name,
      seller: sale.seller,
    });
  });

  return {
    products,
    orders: orders.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    customers: [...customers.values()].sort((a, b) => a.name.localeCompare(b.name)),
    settlements: [],
  };
}

export type CheckoutInput = {
  items: CartLine[];
  customer: string;
  seller: string;
  date: string;
  method: PaymentMethod;
  amountPaid: number;
  splitCash?: number;
  splitOther?: number;
  note?: string;
};

type StoreValue = State & {
  ready: boolean;
  seller: string;
  setSeller: (name: string) => void;
  checkout: (input: CheckoutInput) => Order;
  updateProduct: (id: string, patch: Partial<Product>) => void;
  restock: (id: string, amount: number) => void;
  voidOrder: (id: string) => void;
  refundOrder: (id: string) => void;
  settleDebt: (customerName: string, amount: number, method: PaymentMethod) => void;
  upsertCustomer: (c: Omit<Customer, "id" | "balance" | "totalPaid" | "totalPackets">) => void;
  resetData: () => void;
};

const PosContext = createContext<StoreValue | null>(null);

export function lineTotal(line: CartLine) {
  return Math.max(0, line.price * line.qty - line.discount);
}

export function cartTotals(items: CartLine[]) {
  const subtotal = items.reduce((sum, l) => sum + l.price * l.qty, 0);
  const discount = items.reduce((sum, l) => sum + Math.min(l.discount, l.price * l.qty), 0);
  const packets = items.reduce((sum, l) => sum + l.qty * l.packets, 0);
  return { subtotal, discount, total: subtotal - discount, packets };
}

export function PosProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(() => buildSeed());
  const [seller, setSeller] = useState<string>("Aquila");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as State & { seller?: string };
        if (parsed.products && parsed.orders) {
          setState({
            products: parsed.products,
            orders: parsed.orders,
            customers: parsed.customers ?? [],
            settlements: parsed.settlements ?? [],
          });
        }
        if (parsed.seller) setSeller(parsed.seller);
      }
    } catch {
      /* ignore corrupted storage */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, seller }));
    } catch {
      /* storage full or unavailable */
    }
  }, [state, seller, ready]);

  const checkout = useCallback((input: CheckoutInput) => {
    const { subtotal, discount, total, packets } = cartTotals(input.items);
    const profit = input.items.reduce((sum, l) => {
      const product = SEED_PRODUCTS.find((p) => p.id === l.productId);
      const unitProfit = product ? product.price - product.cost : SETTINGS.profitPerPacket;
      return sum + unitProfit * l.qty - l.discount;
    }, 0);
    const amountPaid = Math.min(input.amountPaid, total);
    const balance = Math.max(0, total - amountPaid);
    const status: OrderStatus = balance === 0 ? "Paid" : amountPaid > 0 ? "Partial" : "Unpaid";

    const order: Order = {
      id: uid("o"),
      code: `AD-${Date.now().toString().slice(-6)}`,
      date: input.date,
      createdAt: new Date().toISOString(),
      items: input.items,
      subtotal,
      discount,
      total,
      profit,
      packets,
      method: input.method,
      splitCash: input.splitCash,
      splitOther: input.splitOther,
      amountPaid,
      balance,
      status,
      customer: input.customer,
      seller: input.seller,
      note: input.note,
    };

    setState((prev) => {
      const products = prev.products.map((p) => {
        const line = input.items.find((l) => l.productId === p.id);
        return line ? { ...p, stock: Math.max(0, p.stock - line.qty) } : p;
      });

      const key = slug(input.customer);
      let customers = prev.customers;
      const existing = customers.find((c) => slug(c.name) === key);
      if (existing) {
        customers = customers.map((c) =>
          c.id === existing.id
            ? {
                ...c,
                balance: c.balance + balance,
                totalPaid: c.totalPaid + amountPaid,
                totalPackets: c.totalPackets + packets,
              }
            : c,
        );
      } else {
        customers = [
          ...customers,
          {
            id: `c-${key}`,
            name: input.customer,
            creditLimit: SETTINGS.defaultCreditLimit,
            balance,
            totalPaid: amountPaid,
            totalPackets: packets,
          },
        ].sort((a, b) => a.name.localeCompare(b.name));
      }

      return { ...prev, products, customers, orders: [order, ...prev.orders] };
    });

    return order;
  }, []);

  const updateProduct = useCallback((id: string, patch: Partial<Product>) => {
    setState((prev) => ({
      ...prev,
      products: prev.products.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  }, []);

  const restock = useCallback((id: string, amount: number) => {
    setState((prev) => ({
      ...prev,
      products: prev.products.map((p) =>
        p.id === id ? { ...p, stock: Math.max(0, p.stock + amount) } : p,
      ),
    }));
  }, []);

  const reverseOrder = useCallback((id: string, status: OrderStatus) => {
    setState((prev) => {
      const order = prev.orders.find((o) => o.id === id);
      if (!order || order.status === "Voided" || order.status === "Refunded") return prev;
      const products = prev.products.map((p) => {
        const line = order.items.find((l) => l.productId === p.id);
        return line ? { ...p, stock: p.stock + line.qty } : p;
      });
      const customers = prev.customers.map((c) =>
        slug(c.name) === slug(order.customer)
          ? {
              ...c,
              balance: Math.max(0, c.balance - order.balance),
              totalPaid: Math.max(0, c.totalPaid - order.amountPaid),
              totalPackets: Math.max(0, c.totalPackets - order.packets),
            }
          : c,
      );
      return {
        ...prev,
        products,
        customers,
        orders: prev.orders.map((o) => (o.id === id ? { ...o, status, balance: 0 } : o)),
      };
    });
  }, []);

  const voidOrder = useCallback((id: string) => reverseOrder(id, "Voided"), [reverseOrder]);
  const refundOrder = useCallback((id: string) => reverseOrder(id, "Refunded"), [reverseOrder]);

  const settleDebt = useCallback(
    (customerName: string, amount: number, method: PaymentMethod) => {
      setState((prev) => {
        let remaining = amount;
        const orders = prev.orders.map((o) => {
          if (slug(o.customer) !== slug(customerName) || o.balance <= 0 || remaining <= 0) return o;
          const applied = Math.min(o.balance, remaining);
          remaining -= applied;
          const balance = o.balance - applied;
          return {
            ...o,
            balance,
            amountPaid: o.amountPaid + applied,
            status: (balance === 0 ? "Paid" : "Partial") as OrderStatus,
          };
        });
        const customers = prev.customers.map((c) =>
          slug(c.name) === slug(customerName)
            ? {
                ...c,
                balance: Math.max(0, c.balance - amount),
                totalPaid: c.totalPaid + amount,
              }
            : c,
        );
        const settlement: Settlement = {
          id: uid("s"),
          date: new Date().toISOString().slice(0, 10),
          customer: customerName,
          amount,
          method,
        };
        return { ...prev, orders, customers, settlements: [settlement, ...prev.settlements] };
      });
    },
    [],
  );

  const upsertCustomer = useCallback<StoreValue["upsertCustomer"]>((input) => {
    setState((prev) => {
      const key = slug(input.name);
      const existing = prev.customers.find((c) => slug(c.name) === key);
      if (existing) {
        return {
          ...prev,
          customers: prev.customers.map((c) => (c.id === existing.id ? { ...c, ...input } : c)),
        };
      }
      return {
        ...prev,
        customers: [
          ...prev.customers,
          { id: `c-${key}`, balance: 0, totalPaid: 0, totalPackets: 0, ...input },
        ].sort((a, b) => a.name.localeCompare(b.name)),
      };
    });
  }, []);

  const resetData = useCallback(() => setState(buildSeed()), []);

  const value = useMemo<StoreValue>(
    () => ({
      ...state,
      ready,
      seller,
      setSeller,
      checkout,
      updateProduct,
      restock,
      voidOrder,
      refundOrder,
      settleDebt,
      upsertCustomer,
      resetData,
    }),
    [
      state,
      ready,
      seller,
      checkout,
      updateProduct,
      restock,
      voidOrder,
      refundOrder,
      settleDebt,
      upsertCustomer,
      resetData,
    ],
  );

  return <PosContext.Provider value={value}>{children}</PosContext.Provider>;
}

export function usePos() {
  const ctx = useContext(PosContext);
  if (!ctx) throw new Error("usePos must be used inside PosProvider");
  return ctx;
}
