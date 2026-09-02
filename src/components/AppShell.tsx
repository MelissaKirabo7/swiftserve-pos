import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  BarChart3,
  Boxes,
  LogOut,
  Menu,
  Popcorn,
  ReceiptText,
  ScanBarcode,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ROLE_LABEL, usePos, type Role } from "@/lib/pos-store";

const NAV = [
  { to: "/", label: "Register", icon: ScanBarcode, roles: ["owner", "rep"] },
  { to: "/inventory", label: "Inventory", icon: Boxes, roles: ["superadmin", "owner", "rep"] },
  { to: "/orders", label: "Orders", icon: ReceiptText, roles: ["superadmin", "owner", "rep"] },
  {
    to: "/customers",
    label: "Customers & Debt",
    icon: Users,
    roles: ["superadmin", "owner", "rep"],
  },
  { to: "/reports", label: "Reports", icon: BarChart3, roles: ["superadmin", "owner", "rep"] },
  { to: "/admin", label: "Admin", icon: ShieldCheck, roles: ["superadmin", "owner"] },
] as const;

function NavList({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-1">
      {NAV.filter((item) => (item.roles as readonly Role[]).includes(role)).map((item) => {
        const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <item.icon className="size-4.5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-1">
      <span className="grid size-9 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
        <Popcorn className="size-5" />
      </span>
      <span className="leading-tight">
        <span className="block font-display text-sm font-semibold text-sidebar-foreground">
          Aquila&apos;s Daddies
        </span>
        <span className="block text-[11px] text-sidebar-foreground/60">POS &amp; Credit Engine</span>
      </span>
    </div>
  );
}

function UserCard() {
  const { currentUser, signOut } = usePos();
  if (!currentUser) return null;
  return (
    <div className="rounded-xl bg-sidebar-accent p-3">
      <p className="text-[11px] uppercase tracking-wider text-sidebar-foreground/60">
        Signed in as
      </p>
      <p className="mt-0.5 font-display text-sm font-semibold text-sidebar-accent-foreground">
        {currentUser.name} · {ROLE_LABEL[currentUser.role]}
      </p>
      <Button size="sm" variant="secondary" className="mt-2 w-full" onClick={signOut}>
        <LogOut className="size-3.5" /> Sign out
      </Button>
    </div>
  );
}

function SignInScreen() {
  const { users, signIn } = usePos();
  const [name, setName] = useState(users[0]?.name ?? "");
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");

  return (
    <div className="grid min-h-screen place-items-center bg-sidebar p-6">
      <div className="w-full max-w-sm space-y-5 rounded-2xl bg-card p-6 shadow-tile">
        <Brand />
        <div className="space-y-1.5">
          <Label htmlFor="login-user">User</Label>
          <select
            id="login-user"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
          >
            {users.map((u) => (
              <option key={u.id} value={u.name}>
                {u.name} · {ROLE_LABEL[u.role]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="login-pass">Passcode</Label>
          <Input
            id="login-pass"
            type="password"
            inputMode="numeric"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !signIn(name, passcode)) setError("Wrong passcode");
            }}
            className="h-12 numeric text-lg"
          />
        </div>
        {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
        <Button
          className="h-12 w-full"
          onClick={() => {
            if (!signIn(name, passcode)) setError("Wrong passcode");
          }}
        >
          Sign in
        </Button>
        <p className="text-[11px] text-muted-foreground">
          Demo passcodes — Superadmin 0000 · Aquila 1111 · Jeremy 2222
        </p>
      </div>
    </div>
  );
}

export function AppShell({
  title,
  subtitle,
  actions,
  children,
  padded = true,
  allow,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  padded?: boolean;
  allow?: Role[];
}) {
  const [open, setOpen] = useState(false);
  const { currentUser, ready } = usePos();

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-sidebar p-6">
        <div className="flex flex-col items-center gap-3 text-sidebar-foreground/80">
          <span className="size-8 animate-spin rounded-full border-2 border-sidebar-foreground/25 border-t-sidebar-primary" />
          <p className="text-sm">Loading register…</p>
        </div>
      </div>
    );
  }
  if (!currentUser) return <SignInScreen />;


  const permitted = !allow || allow.includes(currentUser.role);

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between bg-sidebar p-4 lg:flex">
        <div className="space-y-6">
          <Brand />
          <NavList role={currentUser.role} />
        </div>
        <UserCard />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur lg:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="lg:hidden">
                <Menu className="size-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-sidebar p-4">
              <div className="space-y-6 pt-2">
                <Brand />
                <NavList role={currentUser.role} onNavigate={() => setOpen(false)} />
                <UserCard />
              </div>
            </SheetContent>
          </Sheet>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">{title}</h1>
            {subtitle ? (
              <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          {permitted ? actions : null}
        </header>

        <main className={cn("min-w-0 flex-1", padded && "p-4 lg:p-6")}>
          {permitted ? (
            children
          ) : (
            <div className="mx-auto max-w-md rounded-2xl border border-dashed border-border bg-card p-8 text-center">
              <ShieldCheck className="mx-auto size-6 text-muted-foreground" />
              <h2 className="mt-2 font-display text-base font-semibold">Not available</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {ROLE_LABEL[currentUser.role]} accounts don&apos;t have access to this screen.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
