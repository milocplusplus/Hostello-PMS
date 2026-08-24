"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  Building2,
  CalendarDays,
  Wallet,
  Menu,
  X,
  Plus,
  ChevronDown,
  LogOut,
} from "lucide-react";
import type { ReactNode } from "react";
import { GlobalSearch } from "@/components/shared/GlobalSearch";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; exact: boolean };
type NavGroup = { label: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true }],
  },
  {
    label: "Operations",
    items: [
      { href: "/admin/calendar", label: "Calendar", icon: CalendarDays, exact: false },
      { href: "/admin/bookings", label: "Bookings & Payouts", icon: Wallet, exact: false },
    ],
  },
  {
    label: "Management",
    items: [{ href: "/admin/clients", label: "Clients & Properties", icon: Users, exact: false }],
  },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 gradient-brand"
      >
        <Building2 size={16} className="text-white" strokeWidth={2} />
      </div>
      <div className="flex flex-col leading-none">
        <span className="text-sm font-semibold tracking-wide">HOSTELLO</span>
        <span className="text-[10px] text-hostello-gold tracking-widest mt-0.5">PMS</span>
      </div>
    </div>
  );
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          <p className="px-3 pt-4 pb-1.5 text-[10px] font-medium tracking-widest text-ink-muted uppercase">
            {group.label}
          </p>
          {group.items.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                  active
                    ? "bg-surface-3 text-ink-primary"
                    : "text-ink-secondary hover:text-ink-primary hover:bg-surface-2"
                }`}
              >
                <Icon size={16} strokeWidth={2} className={active ? "text-hostello-gold" : ""} />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );
}

function UserMenu({
  userName,
  logoutAction,
}: {
  userName: string;
  logoutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 pl-1 pr-2 py-1 rounded-full hover:bg-surface-2 transition-colors"
      >
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium text-white shrink-0 gradient-brand"
        >
          {userName.slice(0, 1).toUpperCase()}
        </div>
        <div className="hidden sm:flex flex-col items-start leading-none">
          <span className="text-sm text-ink-primary">{userName}</span>
          <span className="text-[10px] text-ink-muted mt-0.5">Admin</span>
        </div>
        <ChevronDown size={14} className="text-ink-muted hidden sm:block" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-44 card p-1.5 z-50 animate-in">
            <form action={logoutAction}>
              <button
                type="submit"
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-ink-secondary hover:text-ink-primary hover:bg-surface-2 transition-colors"
              >
                <LogOut size={14} />
                Sign out
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

export function AdminShell({
  userName,
  logoutAction,
  children,
}: {
  userName: string;
  logoutAction: () => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-surface-0 text-ink-primary">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 border-r border-border-hairline bg-surface-1 flex-col">
        <div className="px-5 py-6">
          <Logo />
        </div>

        <nav className="flex-1 px-3 flex flex-col gap-0.5 overflow-y-auto pb-4">
          <NavLinks pathname={pathname} />
        </nav>

        <div className="px-3 py-4 border-t border-border-hairline flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium text-white shrink-0 gradient-brand"
            >
              {userName.slice(0, 1).toUpperCase()}
            </div>
            <span className="text-xs text-ink-secondary truncate">{userName}</span>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-xs text-ink-muted hover:text-ink-primary transition-colors shrink-0"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-surface-1 border-b border-border-hairline flex items-center justify-between px-4 py-3">
        <Logo />
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          className="p-2 -mr-2 text-ink-secondary"
        >
          <Menu size={20} />
        </button>
      </div>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMenuOpen(false)} aria-hidden />
          <div className="relative w-64 bg-surface-1 border-r border-border-hairline flex flex-col">
            <div className="px-5 py-6 flex items-center justify-between">
              <Logo />
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="p-1 text-ink-secondary"
              >
                <X size={18} />
              </button>
            </div>
            <nav className="flex-1 px-3 flex flex-col gap-0.5 overflow-y-auto">
              <NavLinks pathname={pathname} onNavigate={() => setMenuOpen(false)} />
            </nav>
            <div className="px-3 py-4 border-t border-border-hairline flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium text-white shrink-0 gradient-brand">
                  {userName.slice(0, 1).toUpperCase()}
                </div>
                <span className="text-xs text-ink-secondary truncate">{userName}</span>
              </div>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="text-xs text-ink-muted hover:text-ink-primary transition-colors shrink-0"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 overflow-x-hidden flex flex-col">
        {/* Desktop top bar */}
        <div className="hidden md:flex items-center gap-4 px-8 py-4 border-b border-border-hairline bg-surface-0/80 backdrop-blur sticky top-0 z-20">
          <GlobalSearch />
          <div className="flex-1" />
          <Link
            href="/admin/bookings/new"
            className="rounded-lg py-2 px-4 text-sm font-medium text-white flex items-center gap-1.5 gradient-brand transition-transform hover:scale-[1.02]"
          >
            <Plus size={15} strokeWidth={2.5} />
            Add booking
          </Link>
          <UserMenu userName={userName} logoutAction={logoutAction} />
        </div>

        <div className="max-w-6xl w-full mx-auto px-4 md:px-8 py-6 md:py-10 pt-20 md:pt-10 flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}
