import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Merge, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/data/catalog";
import { ROLE_LABEL, findDuplicateGroups, usePos, type Role } from "@/lib/pos-store";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin & Users · Aquila's Daddies POS" },
      {
        name: "description",
        content:
          "Manage POS users and passcodes, merge duplicate customer profiles and purge transaction history.",
      },
      { property: "og:title", content: "Admin & Users · Aquila's Daddies POS" },
      {
        property: "og:description",
        content: "Role management, passcode control, customer deduplication and data purge tools.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const {
    users,
    customers,
    orders,
    settlements,
    currentUser,
    upsertUser,
    deleteUser,
    setPasscode,
    mergeCustomers,
    deleteCustomer,
    purgeTransactions,
  } = usePos();

  const isSuper = currentUser?.role === "superadmin";
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("rep");
  const [passcode, setPasscode2] = useState("");
  const [confirmPurge, setConfirmPurge] = useState("");

  const duplicates = useMemo(() => findDuplicateGroups(customers), [customers]);

  return (
    <AppShell
      title="Admin & Users"
      subtitle={`${users.length} users · ${customers.length} customers · ${orders.length} transactions`}
      allow={["superadmin", "owner"]}
    >
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-4 shadow-tile">
          <h2 className="font-display text-sm font-semibold">System users</h2>
          <p className="text-[11px] text-muted-foreground">
            {isSuper
              ? "Superadmin can view and reset every passcode."
              : "Only the superadmin can view or change passcodes."}
          </p>
          <ul className="mt-3 space-y-2">
            {users.map((u) => (
              <li
                key={u.id}
                className="flex flex-wrap items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{u.name}</span>
                  <span className="text-[11px] text-muted-foreground">{ROLE_LABEL[u.role]}</span>
                </span>
                {isSuper ? (
                  <Input
                    aria-label={`Passcode for ${u.name}`}
                    className="h-9 w-24 numeric"
                    value={u.passcode}
                    onChange={(e) => setPasscode(u.id, e.target.value)}
                  />
                ) : (
                  <span className="numeric text-xs text-muted-foreground">••••</span>
                )}
                {isSuper && u.id !== currentUser?.id ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Delete ${u.name}`}
                    onClick={() => {
                      deleteUser(u.id);
                      toast.success(`${u.name} removed`);
                    }}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>

          {isSuper ? (
            <div className="mt-4 space-y-2 rounded-xl border border-dashed border-border p-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="u-name">Name</Label>
                  <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="u-role">Role</Label>
                  <select
                    id="u-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value as Role)}
                    className="h-9 w-full rounded-xl border border-border bg-background px-2 text-sm"
                  >
                    <option value="rep">Sales Rep</option>
                    <option value="owner">Business Owner</option>
                    <option value="superadmin">Superadmin</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="u-pass">Passcode</Label>
                  <Input
                    id="u-pass"
                    className="numeric"
                    value={passcode}
                    onChange={(e) => setPasscode2(e.target.value)}
                  />
                </div>
              </div>
              <Button
                className="w-full"
                disabled={!name.trim() || !passcode.trim()}
                onClick={() => {
                  upsertUser({ name: name.trim(), role, passcode: passcode.trim() });
                  toast.success(`${name.trim()} saved`);
                  setName("");
                  setPasscode2("");
                }}
              >
                <UserPlus className="size-4" /> Save user
              </Button>
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-tile">
          <h2 className="font-display text-sm font-semibold">Possible duplicate customers</h2>
          <p className="text-[11px] text-muted-foreground">
            Merging moves balances, payments and order history onto the kept profile.
          </p>
          <ul className="mt-3 space-y-2">
            {duplicates.map((group) => (
              <li key={group[0]!.id} className="rounded-xl bg-secondary px-3 py-2 text-sm">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {group.length} similar names
                </p>
                <ul className="mt-1 space-y-1">
                  {group.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate">{c.name}</span>
                      <span className="flex items-center gap-2">
                        <span className="numeric text-xs text-muted-foreground">
                          {formatMoney(c.balance)}
                        </span>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            mergeCustomers(
                              c.id,
                              group.filter((g) => g.id !== c.id).map((g) => g.id),
                            );
                            toast.success(`Merged into ${c.name}`);
                          }}
                        >
                          <Merge className="size-3.5" /> Keep this
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
            {duplicates.length === 0 ? (
              <li className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                No similar customer names detected.
              </li>
            ) : null}
          </ul>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-tile xl:col-span-2">
          <h2 className="font-display text-sm font-semibold">Delete customer profiles</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {customers.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-secondary px-3 py-2 text-sm"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{c.name}</span>
                  <span className="numeric text-[11px] text-muted-foreground">
                    {formatMoney(c.balance)} owing
                  </span>
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Delete ${c.name}`}
                  onClick={() => {
                    deleteCustomer(c.id);
                    toast.success(`${c.name} deleted`);
                  }}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-destructive/40 bg-card p-4 shadow-tile xl:col-span-2">
          <h2 className="font-display text-sm font-semibold text-destructive">Danger zone</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Purging deletes all {orders.length} transactions and {settlements.length} settlements and
            resets customer balances. Superadmin only.
          </p>
          {isSuper ? (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="purge">Type PURGE to confirm</Label>
                <Input
                  id="purge"
                  value={confirmPurge}
                  onChange={(e) => setConfirmPurge(e.target.value)}
                />
              </div>
              <Button
                variant="destructive"
                disabled={confirmPurge !== "PURGE"}
                onClick={() => {
                  purgeTransactions();
                  setConfirmPurge("");
                  toast.success("All transaction records purged");
                }}
              >
                <Trash2 className="size-4" /> Purge transactions
              </Button>
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              Ask the superadmin to run a purge.
            </p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
