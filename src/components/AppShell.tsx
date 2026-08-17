import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  BarChart3,
  Boxes,
  Menu,
  Popcorn,
  ReceiptText,
  ScanBarcode,
  Users,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePos } from "@/lib/pos-store";
import { SELLERS } from "@/data/catalog";

const NAV = [
  { to: "/", label: "Register", icon: ScanBarcode },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/orders", label: "Orders", icon: ReceiptText },
  { to: "/customers", label: "Customers & Debt", icon: Users },
  { to: "/reports", label: "Reports", icon: BarChart3 },
] as const;

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
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

function SellerSwitch() {
  const { seller, setSeller } = usePos();
  return (
    <div className="rounded-xl bg-sidebar-accent p-3">
      <p className="text-[11px] uppercase tracking-wider text-sidebar-foreground/60">
        Signed in as
      </p>
      <p className="mt-0.5 font-display text-sm font-semibold text-sidebar-accent-foreground">
        {seller} {seller === "Aquila" ? "· Owner" : "· Sales Rep"}
      </p>
      <div className="mt-2 flex gap-1.5">
        {SELLERS.map((s) => (
          <button
            key={s}
            onClick={() => setSeller(s)}
            className={cn(
              "flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
              s === seller
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "bg-sidebar text-sidebar-foreground/70 hover:text-sidebar-foreground",
            )}
          >
            {s}
          </button>
        ))}
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
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  padded?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between bg-sidebar p-4 lg:flex">
        <div className="space-y-6">
          <Brand />
          <NavList />
        </div>
        <SellerSwitch />
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
                <NavList onNavigate={() => setOpen(false)} />
                <SellerSwitch />
              </div>
            </SheetContent>
          </Sheet>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">{title}</h1>
            {subtitle ? (
              <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          {actions}
        </header>

        <main className={cn("min-w-0 flex-1", padded && "p-4 lg:p-6")}>{children}</main>
      </div>
    </div>
  );
}
