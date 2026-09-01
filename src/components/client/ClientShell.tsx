"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  Wallet,
  HandCoins,
  BarChart3,
  Bell,
  Sun,
  BedDouble,
  LogIn,
  Menu,
  X,
  Plus,
} from "lucide-react";
import type { ReactNode } from "react";
import { HostelloMark } from "@/components/shared/HostelloMark";
import { InstallAppButton } from "@/components/shared/InstallAppButton";
import { GlobalSearch } from "@/components/shared/GlobalSearch";
import { NotificationBell } from "@/components/shared/NotificationBell";
import { UserMenu } from "@/components/shared/UserMenu";
import type { NotificationItem } from "@/lib/notifications";
import type { SearchResult } from "@/lib/search";

const NAV = [
  { href: "/client", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/client/today", label: "Today", icon: Sun, exact: false },
  { href: "/client/checkins", label: "Check-ins", icon: LogIn, exact: false },
  { href: "/client/calendar", label: "Calendar", icon: CalendarDays, exact: false },
  { href: "/client/availability", label: "Availability", icon: BedDouble, exact: false },
  { href: "/client/bookings", label: "Bookings", icon: Wallet, exact: false },
  { href: "/client/payouts", label: "Owed to Hostello", icon: HandCoins, exact: false },
  { href: "/client/stats", label: "Stats", icon: BarChart3, exact: false },
  { href: "/client/notifications", label: "Notifications", icon: Bell, exact: false },
];

function Logo({ clientName }: { clientName: string }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <span className="relative flex items-center justify-center w-9 h-9 rounded-xl shrink-0 border border-border-hairline gradient-brand-subtle">
        <HostelloMark size={22} />
      </span>
      <div className="flex flex-col leading-none min-w-0">
        <span className="display text-sm font-semibold tracking-[0.14em]">HOSTELLO</span>
        <span className="text-[10px] text-hostello-purple-light tracking-[0.18em] mt-1 truncate">
          {clientName.toUpperCase()}
        </span>
      </div>
    </div>
  );
}

function NavLinks({
  pathname,
  unreadCount,
  onNavigate,
}: {
  pathname: string;
  unreadCount: number;
  onNavigate?: () => void;
}) {
  return (
    <>
      {NAV.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`group relative flex items-center gap-3 pl-3.5 pr-3 py-2.5 rounded-xl text-sm transition-all duration-200 ${
              active
                ? "text-ink-primary bg-gradient-to-r from-hostello-purple-glow/22 via-hostello-purple-mid/10 to-transparent border border-hostello-purple-glow/20"
                : "text-ink-secondary border border-transparent hover:text-ink-primary hover:bg-surface-2/70 hover:border-border-hairline"
            }`}
          >
            <span
              className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full transition-all duration-200 ${
                active ? "h-5 bg-hostello-gold" : "h-0 bg-transparent"
              }`}
            />
            <Icon
              size={17}
              strokeWidth={2}
              className={`shrink-0 transition-colors ${
                active ? "text-hostello-gold" : "text-ink-muted group-hover:text-hostello-purple-light"
              }`}
            />
            <span className={`flex-1 truncate ${active ? "font-medium" : ""}`}>{item.label}</span>
            {item.href === "/client/notifications" && unreadCount > 0 && (
              <span className="num text-[10px] font-semibold text-surface-0 rounded-full min-w-[18px] h-[18px] px-1.5 flex items-center justify-center gradient-gold">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>
        );
      })}
    </>
  );
}

function SidebarFooter({
  userName,
  logoutAction,
}: {
  userName: string;
  logoutAction: () => Promise<void>;
}) {
  return (
    <>
      {/* Above the account row, so it is the last thing before "Sign out" in
          both the desktop sidebar and the phone drawer. */}
      <InstallAppButton />
      <div className="m-3 mt-2 p-2.5 rounded-xl bg-surface-2/50 border border-border-hairline flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold text-white shrink-0 gradient-brand">
            {userName.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 leading-tight">
            <p className="text-xs text-ink-primary truncate">{userName}</p>
            <p className="text-[10px] text-ink-muted">Owner</p>
          </div>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="text-[11px] text-ink-muted hover:text-ink-primary transition-colors shrink-0 px-1"
          >
            Sign out
          </button>
        </form>
      </div>
    </>
  );
}

export function ClientShell({
  userName,
  clientName,
  unreadCount = 0,
  notifications,
  logoutAction,
  searchAction,
  markAllReadAction,
  children,
}: {
  userName: string;
  clientName: string;
  unreadCount?: number;
  notifications: NotificationItem[];
  logoutAction: () => Promise<void>;
  searchAction: (query: string) => Promise<SearchResult[]>;
  markAllReadAction: () => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen flex text-ink-primary">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 border-r border-border-hairline glass flex-col sticky top-0 h-screen">
        <div className="px-5 py-6">
          <Logo clientName={clientName} />
        </div>

        <nav className="flex-1 px-3 flex flex-col gap-1 mt-2 overflow-y-auto pb-4">
          <NavLinks pathname={pathname} unreadCount={unreadCount} />
        </nav>

        <SidebarFooter userName={userName} logoutAction={logoutAction} />
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 glass border-b border-border-hairline flex items-center justify-between px-4 py-3 safe-topbar">
        <Logo clientName={clientName} />
        <div className="flex items-center gap-1 shrink-0">
          <NotificationBell
            items={notifications}
            unreadCount={unreadCount}
            allHref="/client/notifications"
            markAllAction={markAllReadAction}
          />
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="p-2 -mr-2 text-ink-secondary"
          >
            <Menu size={20} />
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade"
            onClick={() => setMenuOpen(false)}
            aria-hidden
          />
          <div className="relative w-[17rem] bg-surface-1 border-r border-border-hairline flex flex-col safe-panel shadow-[var(--shadow-pop)] animate-drawer">
            <div className="px-5 py-6 flex items-center justify-between">
              <Logo clientName={clientName} />
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="p-1.5 rounded-lg text-ink-secondary hover:text-ink-primary hover:bg-surface-2 transition-colors shrink-0"
              >
                <X size={18} />
              </button>
            </div>
            <nav className="flex-1 px-3 flex flex-col gap-1 overflow-y-auto">
              <NavLinks
                pathname={pathname}
                unreadCount={unreadCount}
                onNavigate={() => setMenuOpen(false)}
              />
            </nav>
            <SidebarFooter userName={userName} logoutAction={logoutAction} />
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 overflow-x-hidden flex flex-col">
        {/* Desktop top bar */}
        <div className="hidden md:flex items-center gap-4 px-8 py-3.5 border-b border-border-hairline glass-deep sticky top-0 z-20">
          <GlobalSearch searchAction={searchAction} />
          <div className="flex-1" />
          <Link href="/client/bookings/new" className="btn btn-primary">
            <Plus size={15} strokeWidth={2.5} />
            Add booking
          </Link>
          <NotificationBell
            items={notifications}
            unreadCount={unreadCount}
            allHref="/client/notifications"
            markAllAction={markAllReadAction}
          />
          <UserMenu userName={userName} roleLabel="Owner" logoutAction={logoutAction} />
        </div>

        <div className="max-w-5xl w-full mx-auto px-4 md:px-8 safe-main flex-1">{children}</div>
      </div>
    </div>
  );
}
