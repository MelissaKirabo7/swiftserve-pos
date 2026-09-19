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
import { supabase } from "@/integrations/supabase/client";
import { SEED_PRODUCTS, SETTINGS, type Product } from "@/data/catalog";
import { SEED_SALES } from "@/data/seed-sales";
import {
  listStaff,
  provisionStaff,
  removeStaff,
  resolveLogin,
  saveStaff,
} from "@/lib/staff.functions";

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
  /** Soft delete for mistaken entries. Distinct from the Voided audit status. */
  deleted?: boolean | undefined;
  deletedAt?: string | undefined;
  deletedBy?: string | undefined;
  editedAt?: string | undefined;
  editedBy?: string | undefined;
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

export type Settings = {
  /** When on, sales reps may correct or delete their own sales. */
  allowRepEdits: boolean;
};

type State = {
  products: Product[];
  orders: Order[];
  customers: Customer[];
  settlements: Settlement[];
  allocations: StockAllocation[];
  archives: ReportSnapshot[];
  settings: Settings;
};

const LEGACY_KEY = "aquila-pos-v1";
const STATE_ID = "main";

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
      status: sale.status === "Paid" ? "Paid" : sale.status === "Partial" ? "Partial" : "Unpaid",
      customer: name,
      seller: sale.seller,
    });
  });

  return {
    products,
    orders: orders.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    customers: [...customers.values()].sort((a, b) => a.name.localeCompare(b.name)),
    settlements: [],
    allocations: [],
    archives: [],
    settings: { allowRepEdits: false },
  };
}

function normalize(raw: unknown): State | null {
  const parsed = raw as Partial<State> | null;
  if (!parsed || !Array.isArray(parsed.products) || !Array.isArray(parsed.orders)) return null;
  return {
    products: parsed.products,
    orders: parsed.orders,
    customers: parsed.customers ?? [],
    settlements: parsed.settlements ?? [],
    allocations: parsed.allocations ?? [],
    archives: parsed.archives ?? [],
    settings: { allowRepEdits: parsed.settings?.allowRepEdits ?? false },
  };
}

export type CheckoutInput = {
  items: CartLine[];
  customer: string;
  seller: string;
  sellerId?: string | undefined;
  date: string;
  method: PaymentMethod;
  amountPaid: number;
  tip?: number | undefined;
  splitCash?: number | undefined;
  splitOther?: number | undefined;
  note?: string | undefined;
};

export type OrderEdit = {
  items?: CartLine[];
  customer?: string;
  date?: string;
  method?: PaymentMethod;
  amountPaid?: number;
  tip?: number;
  note?: string;
};

type StoreValue = Omit<State, "orders"> & {
  ready: boolean;
  syncing: boolean;
  online: boolean;
  orders: Order[];
  deletedOrders: Order[];
  users: User[];
  seller: string;
  setSeller: (name: string) => void;
  currentUser: User | null;
  signIn: (name: string, passcode: string) => Promise<boolean>;
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
  /** Correct a mistaken sale in place. Recalculates stock, totals and balances. */
  updateOrder: (id: string, edit: OrderEdit) => void;
  /** Soft-delete a mistaken entry and roll back everything it changed. */
  deleteOrderEntry: (id: string) => void;
  restoreOrderEntry: (id: string) => void;
  canEditOrder: (order: Order) => boolean;
  setAllowRepEdits: (allow: boolean) => void;
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

function orderProfit(items: CartLine[]) {
  return items.reduce((sum, l) => {
    const product = SEED_PRODUCTS.find((p) => p.id === l.productId);
    const unitProfit = product ? product.price - product.cost : SETTINGS.profitPerPacket;
    return sum + unitProfit * l.qty - l.discount;
  }, 0);
}

/** Puts stock, allocations and customer figures back as if the order never happened. */
function rollBack(prev: State, order: Order): State {
  const products = prev.products.map((p) => {
    const line = order.items.find((l) => l.productId === p.id);
    return line ? { ...p, stock: p.stock + line.qty } : p;
  });
  const taken = new Map<string, number>();
  const allocations = prev.allocations.map((a) => {
    if (slug(a.rep) !== slug(order.seller) || a.sold <= 0) return a;
    const line = order.items.find((l) => l.productId === a.productId);
    if (!line) return a;
    const already = taken.get(a.productId) ?? 0;
    const give = Math.min(a.sold, line.qty - already);
    if (give <= 0) return a;
    taken.set(a.productId, already + give);
    return { ...a, sold: a.sold - give };
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
  return { ...prev, products, allocations, customers };
}

/** Applies stock, allocation and customer effects of an order. */
function applyEffects(prev: State, order: Order): State {
  const fromAllocation = new Map<string, number>();
  const allocations = prev.allocations.map((a) => {
    if (slug(a.rep) !== slug(order.seller)) return a;
    const line = order.items.find((l) => l.productId === a.productId);
    if (!line) return a;
    const already = fromAllocation.get(a.productId) ?? 0;
    const take = Math.min(a.assigned - a.sold, line.qty - already);
    if (take <= 0) return a;
    fromAllocation.set(a.productId, already + take);
    return { ...a, sold: a.sold + take };
  });

  const products = prev.products.map((p) => {
    const line = order.items.find((l) => l.productId === p.id);
    if (!line) return p;
    const covered = fromAllocation.get(p.id) ?? 0;
    return { ...p, stock: Math.max(0, p.stock - Math.max(0, line.qty - covered)) };
  });

  const key = slug(order.customer);
  let customers = prev.customers;
  const existing = customers.find((c) => slug(c.name) === key);
  if (existing) {
    customers = customers.map((c) =>
      c.id === existing.id
        ? {
            ...c,
            balance: c.balance + order.balance,
            totalPaid: c.totalPaid + order.amountPaid,
            totalPackets: c.totalPackets + order.packets,
          }
        : c,
    );
  } else {
    customers = [
      ...customers,
      {
        id: `c-${key}`,
        name: order.customer,
        creditLimit: SETTINGS.defaultCreditLimit,
        balance: order.balance,
        totalPaid: order.amountPaid,
        totalPackets: order.packets,
      },
    ].sort((a, b) => a.name.localeCompare(b.name));
  }

  return { ...prev, products, allocations, customers };
}

export function PosProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(() => buildSeed());
  const [users, setUsers] = useState<User[]>([]);
  const [seller, setSeller] = useState<string>("Aquila");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  currentUserIdRef.current = currentUserId;
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(true);

  const stateRef = useRef(state);
  stateRef.current = state;
  const versionRef = useRef<number>(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const loadedRef = useRef(false);

  const adopt = useCallback((raw: unknown, version: number) => {
    const next = normalize(raw);
    if (!next) return;
    versionRef.current = version;
    stateRef.current = next;
    setState(next);
  }, []);

  /** Optimistic local write + version-checked push; replays on cross-device conflict. */
  const apply = useCallback(
    (mutator: (prev: State) => State) => {
      const optimistic = mutator(stateRef.current);
      stateRef.current = optimistic;
      setState(optimistic);
      if (!loadedRef.current) return;

      setSyncing(true);
      queueRef.current = queueRef.current
        .then(async () => {
          for (let attempt = 0; attempt < 4; attempt += 1) {
            const base = stateRef.current;
            const next = attempt === 0 ? base : mutator(base);
            const { data, error } = await supabase
              .from("pos_state")
              .update({
                data: next as never,
                updated_by: currentUserIdRef.current,
              })
              .eq("id", STATE_ID)
              .eq("version", versionRef.current)
              .select("data, version");

            if (!error && data && data.length > 0) {
              versionRef.current = data[0]!.version;
              stateRef.current = next;
              setState(next);
              setOnline(true);
              return;
            }
            if (error) {
              setOnline(false);
              return;
            }
            // Another device wrote first: take their state, then replay this change.
            const fresh = await supabase
              .from("pos_state")
              .select("data, version")
              .eq("id", STATE_ID)
              .maybeSingle();
            if (!fresh.data) return;
            versionRef.current = fresh.data.version;
            stateRef.current = normalize(fresh.data.data) ?? stateRef.current;
          }
        })
        .catch(() => setOnline(false))
        .finally(() => setSyncing(false));
    },
    [],
  );

  const loadUsers = useCallback(async () => {
    const { data } = await supabase.from("app_users").select("id, name, role, auth_user_id");
    if (data) {
      setUsers(
        data.map((u) => ({
          id: u.id,
          name: u.name,
          role: u.role as Role,
          passcode: "",
        })),
      );
      return data;
    }
    return [];
  }, []);

  const resolveCurrent = useCallback(async () => {
    const { data: session } = await supabase.auth.getSession();
    const authId = session.session?.user.id;
    if (!authId) {
      setCurrentUserId(null);
      return;
    }
    const { data } = await supabase
      .from("app_users")
      .select("id, name, role, auth_user_id")
      .eq("auth_user_id", authId)
      .maybeSingle();
    if (data) {
      setCurrentUserId(data.id);
      if (data.role !== "superadmin") setSeller(data.name);
    }
  }, []);

  // Initial load: staff list, session, shared shop state (bootstrapped once).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await provisionStaff();
      } catch {
        /* already provisioned or offline */
      }
      try {
        const staff = await listStaff();
        if (!cancelled) {
          setUsers(staff.map((s) => ({ ...s, passcode: "" })));
        }
      } catch {
        /* offline */
      }

      await resolveCurrent();

      try {
        const { data } = await supabase
          .from("pos_state")
          .select("data, version")
          .eq("id", STATE_ID)
          .maybeSingle();
        if (cancelled) return;
        const remote = normalize(data?.data);
        if (remote) {
          adopt(remote, data?.version ?? 0);
        } else {
          // First run: take whatever this device already had as the starting point.
          let local: State | null = null;
          try {
            const raw = window.localStorage.getItem(LEGACY_KEY);
            if (raw) local = normalize(JSON.parse(raw));
          } catch {
            /* ignore corrupted storage */
          }
          const seeded = local ?? buildSeed();
          versionRef.current = data?.version ?? 0;
          stateRef.current = seeded;
          setState(seeded);
          loadedRef.current = true;
          await supabase
            .from("pos_state")
            .update({ data: seeded as never })
            .eq("id", STATE_ID)
            .eq("version", versionRef.current);
          const after = await supabase
            .from("pos_state")
            .select("version")
            .eq("id", STATE_ID)
            .maybeSingle();
          if (after.data) versionRef.current = after.data.version;
        }
        loadedRef.current = true;
      } catch {
        setOnline(false);
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [adopt, resolveCurrent]);

  // Live updates from every other device / session.
  useEffect(() => {
    const channel = supabase
      .channel("pos-state")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pos_state" },
        (payload) => {
          const row = payload.new as { data?: unknown; version?: number } | null;
          if (!row || typeof row.version !== "number") return;
          if (row.version === versionRef.current) return;
          adopt(row.data, row.version);
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "app_users" }, () => {
        void loadUsers();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [adopt, loadUsers]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setCurrentUserId(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const checkout = useCallback(
    (input: CheckoutInput) => {
      const { subtotal, discount, total, packets } = cartTotals(input.items);
      const tip = Math.max(0, Math.round(input.tip ?? 0));
      const amountPaid = Math.min(input.amountPaid, total);
      const balance = Math.max(0, total - amountPaid);
      const status: OrderStatus = balance === 0 ? "Paid" : amountPaid > 0 ? "Partial" : "Unpaid";

      const order: Order = {
        id: uid("o"),
        code: `AD-${Date.now().toString().slice(-6)}`,
        date: input.date,
        createdAt:
          input.date === new Date().toISOString().slice(0, 10)
            ? new Date().toISOString()
            : new Date(`${input.date}T12:00:00.000Z`).toISOString(),
        items: input.items,
        subtotal,
        discount,
        total,
        profit: orderProfit(input.items),
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
        sellerId: input.sellerId,
        note: input.note,
      };

      apply((prev) => {
        const next = applyEffects(prev, order);
        return { ...next, orders: [order, ...next.orders] };
      });

      return order;
    },
    [apply],
  );

  const updateProduct = useCallback(
    (id: string, patch: Partial<Product>) => {
      apply((prev) => ({
        ...prev,
        products: prev.products.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      }));
    },
    [apply],
  );

  const restock = useCallback(
    (id: string, amount: number) => {
      apply((prev) => ({
        ...prev,
        products: prev.products.map((p) =>
          p.id === id ? { ...p, stock: Math.max(0, p.stock + amount) } : p,
        ),
      }));
    },
    [apply],
  );

  const reverseOrder = useCallback(
    (id: string, status: OrderStatus) => {
      apply((prev) => {
        const order = prev.orders.find((o) => o.id === id);
        if (!order || order.status === "Voided" || order.status === "Refunded") return prev;
        const next = rollBack(prev, order);
        return {
          ...next,
          orders: next.orders.map((o) => (o.id === id ? { ...o, status, balance: 0 } : o)),
        };
      });
    },
    [apply],
  );

  const voidOrder = useCallback((id: string) => reverseOrder(id, "Voided"), [reverseOrder]);
  const refundOrder = useCallback((id: string) => reverseOrder(id, "Refunded"), [reverseOrder]);

  /** Correction path: rewrites the entry itself instead of leaving a void record. */
  const updateOrder = useCallback(
    (id: string, edit: OrderEdit) => {
      const actor = currentUserIdRef.current;
      apply((prev) => {
        const order = prev.orders.find((o) => o.id === id);
        if (!order) return prev;

        const live = order.status !== "Voided" && order.status !== "Refunded";
        const base = live ? rollBack(prev, order) : prev;

        const items = edit.items ?? order.items;
        const { subtotal, discount, total, packets } = cartTotals(items);
        const method = edit.method ?? order.method;
        const amountPaid = Math.min(
          Math.max(0, Math.round(edit.amountPaid ?? order.amountPaid)),
          total,
        );
        const balance = Math.max(0, total - amountPaid);
        const date = edit.date ?? order.date;

        const updated: Order = {
          ...order,
          items,
          subtotal,
          discount,
          total,
          packets,
          profit: orderProfit(items),
          method,
          amountPaid,
          balance,
          tip: Math.max(0, Math.round(edit.tip ?? order.tip)),
          customer: (edit.customer ?? order.customer).trim() || order.customer,
          date,
          createdAt:
            date === order.date
              ? order.createdAt
              : new Date(`${date}T12:00:00.000Z`).toISOString(),
          note: edit.note ?? order.note,
          status: live
            ? balance === 0
              ? "Paid"
              : amountPaid > 0
                ? "Partial"
                : "Unpaid"
            : order.status,
          editedAt: new Date().toISOString(),
          editedBy: actor ?? undefined,
        };

        const next = live ? applyEffects(base, updated) : base;
        return { ...next, orders: next.orders.map((o) => (o.id === id ? updated : o)) };
      });
    },
    [apply],
  );

  /** Soft delete for mistakes: hidden everywhere, fully rolled back, recoverable. */
  const deleteOrderEntry = useCallback(
    (id: string) => {
      const actor = currentUserIdRef.current;
      apply((prev) => {
        const order = prev.orders.find((o) => o.id === id);
        if (!order || order.deleted) return prev;
        const live = order.status !== "Voided" && order.status !== "Refunded";
        const next = live ? rollBack(prev, order) : prev;
        return {
          ...next,
          orders: next.orders.map((o) =>
            o.id === id
              ? {
                  ...o,
                  deleted: true,
                  deletedAt: new Date().toISOString(),
                  deletedBy: actor ?? undefined,
                }
              : o,
          ),
        };
      });
    },
    [apply],
  );

  const restoreOrderEntry = useCallback(
    (id: string) => {
      apply((prev) => {
        const order = prev.orders.find((o) => o.id === id);
        if (!order || !order.deleted) return prev;
        const restored: Order = {
          ...order,
          deleted: false,
          deletedAt: undefined,
          deletedBy: undefined,
        };
        const live = restored.status !== "Voided" && restored.status !== "Refunded";
        const next = live ? applyEffects(prev, restored) : prev;
        return { ...next, orders: next.orders.map((o) => (o.id === id ? restored : o)) };
      });
    },
    [apply],
  );

  const setAllowRepEdits = useCallback(
    (allowRepEdits: boolean) => {
      apply((prev) => ({ ...prev, settings: { ...prev.settings, allowRepEdits } }));
    },
    [apply],
  );

  const settleDebt = useCallback(
    (customerName: string, amount: number, method: PaymentMethod) => {
      apply((prev) => {
        let remaining = amount;
        const orders = prev.orders.map((o) => {
          if (
            o.deleted ||
            slug(o.customer) !== slug(customerName) ||
            o.balance <= 0 ||
            remaining <= 0
          )
            return o;
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
    [apply],
  );

  const upsertCustomer = useCallback<StoreValue["upsertCustomer"]>(
    (input) => {
      apply((prev) => {
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
    },
    [apply],
  );

  const deleteCustomer = useCallback(
    (id: string) => {
      apply((prev) => ({ ...prev, customers: prev.customers.filter((c) => c.id !== id) }));
    },
    [apply],
  );

  const mergeCustomers = useCallback(
    (targetId: string, sourceIds: string[]) => {
      apply((prev) => {
        const target = prev.customers.find((c) => c.id === targetId);
        if (!target) return prev;
        const sources = prev.customers.filter((c) => sourceIds.includes(c.id) && c.id !== targetId);
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
    },
    [apply],
  );

  const addProduct = useCallback<StoreValue["addProduct"]>(
    (input) => {
      apply((prev) => ({ ...prev, products: [...prev.products, { ...input, id: uid("p") }] }));
    },
    [apply],
  );

  const deleteProduct = useCallback(
    (id: string) => {
      apply((prev) => ({ ...prev, products: prev.products.filter((p) => p.id !== id) }));
    },
    [apply],
  );

  const purgeTransactions = useCallback(() => {
    apply((prev) => ({
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
  }, [apply]);

  const delegateStock = useCallback<StoreValue["delegateStock"]>(
    (rep, productId, qty) => {
      const assignedBy = users.find((u) => u.id === currentUserIdRef.current)?.name ?? "Owner";
      apply((prev) => {
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
          assignedBy,
        };
        return {
          ...prev,
          products: prev.products.map((p) =>
            p.id === productId ? { ...p, stock: p.stock - amount } : p,
          ),
          allocations: [allocation, ...prev.allocations],
        };
      });
    },
    [apply, users],
  );

  const returnStock = useCallback<StoreValue["returnStock"]>(
    (allocationId, qty) => {
      apply((prev) => {
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
    },
    [apply],
  );

  const saveSnapshot = useCallback<StoreValue["saveSnapshot"]>(
    (snap) => {
      apply((prev) => {
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
    },
    [apply],
  );

  const signIn = useCallback(
    async (name: string, passcode: string) => {
      try {
        const login = await resolveLogin({ data: { name, passcode } });
        if (!login.ok) return false;
        const { error } = await supabase.auth.signInWithPassword({
          email: login.email,
          password: login.password,
        });
        if (error) return false;
        await loadUsers();
        await resolveCurrent();
        return true;
      } catch {
        return false;
      }
    },
    [loadUsers, resolveCurrent],
  );

  const signOut = useCallback(() => {
    setCurrentUserId(null);
    void supabase.auth.signOut();
  }, []);

  const setPasscode = useCallback(
    (userId: string, passcode: string) => {
      const user = users.find((u) => u.id === userId);
      if (!user) return;
      void saveStaff({ data: { id: userId, name: user.name, role: user.role, passcode } });
    },
    [users],
  );

  const upsertUser = useCallback<StoreValue["upsertUser"]>((input) => {
    void saveStaff({
      data: {
        ...(input.id ? { id: input.id } : {}),
        name: input.name,
        role: input.role,
        passcode: input.passcode,
      },
    }).then(() => supabase.from("app_users").select("id").then(() => undefined));
  }, []);

  const deleteUser = useCallback((userId: string) => {
    void removeStaff({ data: { id: userId } });
  }, []);

  // Automated daily snapshots: summaries survive even if raw transactions are purged.
  useEffect(() => {
    if (!ready) return;
    apply((prev) => {
      const cutoff = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
      const live = prev.orders.filter(
        (o) => !o.deleted && o.status !== "Voided" && o.status !== "Refunded",
      );
      const days = [...new Set(live.filter((o) => o.date >= cutoff).map((o) => o.date))];
      const missing = days.filter(
        (d) => !prev.archives.some((a) => a.label === "Daily" && a.start === d && a.end === d),
      );
      if (missing.length === 0) return prev;
      const snaps: ReportSnapshot[] = missing.map((d) => {
        const list = live.filter((o) => o.date === d);
        return {
          id: uid("snap"),
          label: "Daily",
          start: d,
          end: d,
          createdAt: new Date().toISOString(),
          revenue: list.reduce((t, o) => t + o.total, 0),
          collected: list.reduce((t, o) => t + o.amountPaid, 0),
          credit: list.reduce((t, o) => t + o.balance, 0),
          profit: list.reduce((t, o) => t + o.profit, 0),
          tips: list.reduce((t, o) => t + (o.tip ?? 0), 0),
          packets: list.reduce((t, o) => t + o.packets, 0),
          orders: list.length,
        };
      });
      return { ...prev, archives: [...snaps, ...prev.archives].slice(0, 400) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const repAvailable = useCallback<StoreValue["repAvailable"]>(
    (rep, productId) =>
      state.allocations
        .filter((a) => slug(a.rep) === slug(rep) && a.productId === productId)
        .reduce((total, a) => total + (a.assigned - a.sold), 0),
    [state.allocations],
  );

  const resetData = useCallback(() => apply(() => buildSeed()), [apply]);

  const currentUser = useMemo(
    () => users.find((u) => u.id === currentUserId) ?? null,
    [users, currentUserId],
  );

  const canEditOrder = useCallback(
    (order: Order) => {
      if (!currentUser) return false;
      if (currentUser.role === "owner" || currentUser.role === "superadmin") return true;
      return state.settings.allowRepEdits && slug(order.seller) === slug(currentUser.name);
    },
    [currentUser, state.settings.allowRepEdits],
  );

  const liveOrders = useMemo(() => state.orders.filter((o) => !o.deleted), [state.orders]);
  const deletedOrders = useMemo(() => state.orders.filter((o) => o.deleted), [state.orders]);

  const value = useMemo<StoreValue>(
    () => ({
      ...state,
      orders: liveOrders,
      deletedOrders,
      users,
      ready,
      syncing,
      online,
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
      updateOrder,
      deleteOrderEntry,
      restoreOrderEntry,
      canEditOrder,
      setAllowRepEdits,
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
      liveOrders,
      deletedOrders,
      users,
      ready,
      syncing,
      online,
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
      updateOrder,
      deleteOrderEntry,
      restoreOrderEntry,
      canEditOrder,
      setAllowRepEdits,
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
