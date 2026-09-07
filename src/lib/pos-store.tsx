import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  splitCash?: number | undefined;
  splitOther?: number | undefined;
  amountPaid: number;
  balance: number;
  tip: number;
  status: OrderStatus;
  customer: string;
  seller: string;
  sellerId?: string | undefined;
  note?: string | undefined;
};

export type Customer = {
  id: string;
  name: string;
  phone?: string | undefined;
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

export type StockAllocation = {
  id: string;
  rep: string;
  productId: string;
  assigned: number;
  sold: number;
  assignedAt: string;
  assignedBy: string;
};

export type ReportSnapshot = {
  id: string;
  label: string;
  start: string;
  end: string;
  createdAt: string;
  revenue: number;
  collected: number;
  credit: number;
  profit: number;
  tips: number;
  packets: number;
  orders: number;
};

export type Role = "superadmin" | "owner" | "rep";

export type User = {
  id: string;
  name: string;
  role: Role;
  passcode: string;
};

export const ROLE_LABEL: Record<Role, string> = {
  superadmin: "Superadmin",
  owner: "Business Owner",
  rep: "Sales Rep",
};

export const SEED_USERS: User[] = [
  { id: "u-super", name: "Superadmin", role: "superadmin", passcode: "0000" },
  { id: "u-aquila", name: "Aquila", role: "owner", passcode: "1111" },
  { id: "u-jeremy", name: "Jeremy", role: "rep", passcode: "2222" },
];

type State = {
  products: Product[];
  orders: Order[];
  customers: Customer[];
  settlements: Settlement[];
  users: User[];
  allocations: StockAllocation[];
  archives: ReportSnapshot[];
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
  const packetProduct = products[0]!;
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
      tip: 0,
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
    users: SEED_USERS.map((u) => ({ ...u })),
    allocations: [],
    archives: [],
  };

}

export type CheckoutInput = {
  items: CartLine[];
  customer: string;
  seller: string;
  date: string;
  method: PaymentMethod;
  amountPaid: number;
  tip?: number | undefined;
  splitCash?: number | undefined;
  splitOther?: number | undefined;
  note?: string | undefined;
};

type StoreValue = State & {
  ready: boolean;
  seller: string;
  setSeller: (name: string) => void;
  currentUser: User | null;
  signIn: (name: string, passcode: string) => boolean;
  signOut: () => void;
  setPasscode: (userId: string, passcode: string) => void;
  upsertUser: (u: { id?: string; name: string; role: Role; passcode: string }) => void;
  deleteUser: (userId: string) => void;
  checkout: (input: CheckoutInput) => Order;
  updateProduct: (id: string, patch: Partial<Product>) => void;
  addProduct: (p: Omit<Product, "id">) => void;
  deleteProduct: (id: string) => void;
  restock: (id: string, amount: number) => void;
  voidOrder: (id: string) => void;
  refundOrder: (id: string) => void;
  settleDebt: (customerName: string, amount: number, method: PaymentMethod) => void;
  upsertCustomer: (c: Omit<Customer, "id" | "balance" | "totalPaid" | "totalPackets">) => void;
  deleteCustomer: (id: string) => void;
  mergeCustomers: (targetId: string, sourceIds: string[]) => void;
  purgeTransactions: () => void;
  delegateStock: (rep: string, productId: string, qty: number) => void;
  returnStock: (allocationId: string, qty: number) => void;
  repAvailable: (rep: string, productId: string) => number;
  saveSnapshot: (snap: Omit<ReportSnapshot, "id" | "createdAt">) => void;
  resetData: () => void;
};

/** Rough name similarity (0-1) used to flag likely duplicate customer profiles. */
export function nameSimilarity(a: string, b: string) {
  const x = a.toLowerCase().replace(/[^a-z0-9]/g, "");
  const y = b.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!x || !y) return 0;
  if (x === y) return 1;
  const grams = (s: string) => {
    const out = new Set<string>();
    for (let i = 0; i < s.length - 1; i += 1) out.add(s.slice(i, i + 2));
    return out;
  };
  const gx = grams(x);
  const gy = grams(y);
  if (!gx.size || !gy.size) return 0;
  let shared = 0;
  gx.forEach((g) => {
    if (gy.has(g)) shared += 1;
  });
  return (2 * shared) / (gx.size + gy.size);
}

export function findDuplicateGroups(customers: Customer[], threshold = 0.7) {
  const groups: Customer[][] = [];
  const used = new Set<string>();
  customers.forEach((c, i) => {
    if (used.has(c.id)) return;
    const group = [c];
    customers.slice(i + 1).forEach((other) => {
      if (used.has(other.id)) return;
      if (nameSimilarity(c.name, other.name) >= threshold) {
        group.push(other);
        used.add(other.id);
      }
    });
    if (group.length > 1) {
      used.add(c.id);
      groups.push(group);
    }
  });
  return groups;
}


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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  currentUserIdRef.current = currentUserId;
  const [ready, setReady] = useState(false);


  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as State & { seller?: string; currentUserId?: string };
        if (parsed.products && parsed.orders) {
          setState({
            products: parsed.products,
            orders: parsed.orders,
            customers: parsed.customers ?? [],
            settlements: parsed.settlements ?? [],
            users: parsed.users?.length ? parsed.users : SEED_USERS.map((u) => ({ ...u })),
            allocations: parsed.allocations ?? [],
            archives: parsed.archives ?? [],
          });
        }
        if (parsed.seller) setSeller(parsed.seller);
        if (parsed.currentUserId) setCurrentUserId(parsed.currentUserId);
      }

    } catch {
      /* ignore corrupted storage */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...state, seller, currentUserId }),
      );

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
    const tip = Math.max(0, Math.round(input.tip ?? 0));
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
      tip,
      status,
      customer: input.customer,
      seller: input.seller,
      note: input.note,
    };

    setState((prev) => {
      const repAllocs = prev.allocations.filter(
        (a) => slug(a.rep) === slug(input.seller) && a.assigned - a.sold > 0,
      );
      const fromAllocation = new Map<string, number>();
      const allocations = prev.allocations.map((a) => {
        if (slug(a.rep) !== slug(input.seller)) return a;
        const line = input.items.find((l) => l.productId === a.productId);
        if (!line) return a;
        const already = fromAllocation.get(a.productId) ?? 0;
        const take = Math.min(a.assigned - a.sold, line.qty - already);
        if (take <= 0) return a;
        fromAllocation.set(a.productId, already + take);
        return { ...a, sold: a.sold + take };
      });
      void repAllocs;

      const products = prev.products.map((p) => {
        const line = input.items.find((l) => l.productId === p.id);
        if (!line) return p;
        const covered = fromAllocation.get(p.id) ?? 0;
        const remainder = Math.max(0, line.qty - covered);
        return { ...p, stock: Math.max(0, p.stock - remainder) };
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

      return { ...prev, products, allocations, customers, orders: [order, ...prev.orders] };
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

  const deleteCustomer = useCallback((id: string) => {
    setState((prev) => ({ ...prev, customers: prev.customers.filter((c) => c.id !== id) }));
  }, []);

  const mergeCustomers = useCallback((targetId: string, sourceIds: string[]) => {
    setState((prev) => {
      const target = prev.customers.find((c) => c.id === targetId);
      if (!target) return prev;
      const sources = prev.customers.filter(
        (c) => sourceIds.includes(c.id) && c.id !== targetId,
      );
      if (sources.length === 0) return prev;
      const sourceNames = new Set(sources.map((c) => slug(c.name)));

      const merged: Customer = {
        ...target,
        creditLimit: Math.max(target.creditLimit, ...sources.map((c) => c.creditLimit)),
        balance: target.balance + sources.reduce((t, c) => t + c.balance, 0),
        totalPaid: target.totalPaid + sources.reduce((t, c) => t + c.totalPaid, 0),
        totalPackets: target.totalPackets + sources.reduce((t, c) => t + c.totalPackets, 0),
      };

      return {
        ...prev,
        customers: prev.customers
          .filter((c) => !sourceNames.has(slug(c.name)) || c.id === targetId)
          .map((c) => (c.id === targetId ? merged : c)),
        orders: prev.orders.map((o) =>
          sourceNames.has(slug(o.customer)) ? { ...o, customer: target.name } : o,
        ),
        settlements: prev.settlements.map((s) =>
          sourceNames.has(slug(s.customer)) ? { ...s, customer: target.name } : s,
        ),
      };
    });
  }, []);

  const addProduct = useCallback<StoreValue["addProduct"]>((input) => {
    setState((prev) => ({
      ...prev,
      products: [...prev.products, { ...input, id: uid("p") }],
    }));
  }, []);

  const deleteProduct = useCallback((id: string) => {
    setState((prev) => ({ ...prev, products: prev.products.filter((p) => p.id !== id) }));
  }, []);

  const purgeTransactions = useCallback(() => {
    setState((prev) => ({
      ...prev,
      orders: [],
      settlements: [],
      customers: prev.customers.map((c) => ({
        ...c,
        balance: 0,
        totalPaid: 0,
        totalPackets: 0,
      })),
    }));
  }, []);

  const delegateStock = useCallback<StoreValue["delegateStock"]>((rep, productId, qty) => {
    setState((prev) => {
      const product = prev.products.find((p) => p.id === productId);
      const amount = Math.min(Math.max(0, Math.round(qty)), product?.stock ?? 0);
      if (!product || amount <= 0) return prev;
      const allocation: StockAllocation = {
        id: uid("a"),
        rep,
        productId,
        assigned: amount,
        sold: 0,
        assignedAt: new Date().toISOString(),
        assignedBy: prev.users.find((u) => u.id === currentUserIdRef.current)?.name ?? "Owner",
      };
      return {
        ...prev,
        products: prev.products.map((p) =>
          p.id === productId ? { ...p, stock: p.stock - amount } : p,
        ),
        allocations: [allocation, ...prev.allocations],
      };
    });
  }, []);

  const returnStock = useCallback<StoreValue["returnStock"]>((allocationId, qty) => {
    setState((prev) => {
      const alloc = prev.allocations.find((a) => a.id === allocationId);
      if (!alloc) return prev;
      const amount = Math.min(Math.max(0, Math.round(qty)), alloc.assigned - alloc.sold);
      if (amount <= 0) return prev;
      return {
        ...prev,
        products: prev.products.map((p) =>
          p.id === alloc.productId ? { ...p, stock: p.stock + amount } : p,
        ),
        allocations: prev.allocations
          .map((a) => (a.id === allocationId ? { ...a, assigned: a.assigned - amount } : a))
          .filter((a) => a.assigned > 0),
      };
    });
  }, []);

  const saveSnapshot = useCallback<StoreValue["saveSnapshot"]>((snap) => {
    setState((prev) => {
      const existing = prev.archives.find(
        (a) => a.start === snap.start && a.end === snap.end && a.label === snap.label,
      );
      const record: ReportSnapshot = {
        ...snap,
        id: existing?.id ?? uid("snap"),
        createdAt: new Date().toISOString(),
      };
      return {
        ...prev,
        archives: [record, ...prev.archives.filter((a) => a.id !== record.id)].slice(0, 400),
      };
    });
  }, []);

  const signIn = useCallback(
    (name: string, passcode: string) => {
      const user = state.users.find(
        (u) => u.name.toLowerCase() === name.trim().toLowerCase() && u.passcode === passcode,
      );
      if (!user) return false;
      setCurrentUserId(user.id);
      if (user.role !== "superadmin") setSeller(user.name);
      return true;
    },
    [state.users],
  );

  const signOut = useCallback(() => setCurrentUserId(null), []);

  const setPasscode = useCallback((userId: string, passcode: string) => {
    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) => (u.id === userId ? { ...u, passcode } : u)),
    }));
  }, []);

  const upsertUser = useCallback<StoreValue["upsertUser"]>((input) => {
    setState((prev) => {
      const existing = input.id
        ? prev.users.find((u) => u.id === input.id)
        : prev.users.find((u) => u.name.toLowerCase() === input.name.toLowerCase());
      if (existing) {
        return {
          ...prev,
          users: prev.users.map((u) =>
            u.id === existing.id
              ? { ...u, name: input.name, role: input.role, passcode: input.passcode }
              : u,
          ),
        };
      }
      return {
        ...prev,
        users: [
          ...prev.users,
          { id: uid("u"), name: input.name, role: input.role, passcode: input.passcode },
        ],
      };
    });
  }, []);

  const deleteUser = useCallback((userId: string) => {
    setState((prev) => ({ ...prev, users: prev.users.filter((u) => u.id !== userId) }));
  }, []);

  const repAvailable = useCallback<StoreValue["repAvailable"]>(
    (rep, productId) =>
      state.allocations
        .filter((a) => slug(a.rep) === slug(rep) && a.productId === productId)
        .reduce((total, a) => total + (a.assigned - a.sold), 0),
    [state.allocations],
  );

  const resetData = useCallback(() => setState(buildSeed()), []);

  const currentUser = useMemo(
    () => state.users.find((u) => u.id === currentUserId) ?? null,
    [state.users, currentUserId],
  );

  const value = useMemo<StoreValue>(
    () => ({
      ...state,
      ready,
      seller,
      setSeller,
      currentUser,
      signIn,
      signOut,
      setPasscode,
      upsertUser,
      deleteUser,
      checkout,
      updateProduct,
      addProduct,
      deleteProduct,
      restock,
      voidOrder,
      refundOrder,
      settleDebt,
      upsertCustomer,
      deleteCustomer,
      mergeCustomers,
      purgeTransactions,
      delegateStock,
      returnStock,
      repAvailable,
      saveSnapshot,
      resetData,
    }),
    [
      state,
      ready,
      seller,
      currentUser,
      signIn,
      signOut,
      setPasscode,
      upsertUser,
      deleteUser,
      checkout,
      updateProduct,
      addProduct,
      deleteProduct,
      restock,
      voidOrder,
      refundOrder,
      settleDebt,
      upsertCustomer,
      deleteCustomer,
      mergeCustomers,
      purgeTransactions,
      delegateStock,
      returnStock,
      repAvailable,
      saveSnapshot,
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
