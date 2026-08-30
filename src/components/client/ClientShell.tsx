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
  { href: "/client/bookings", label: "Bookings", icon: Wallet, exact: false },
  { href: "/client/payouts", label: "Owed to Hostello", icon: HandCoins, exact: false },
  { href: "/client/stats", label: "Stats", icon: BarChart3, exact: false },
  { href: "/client/notifications", label: "Notifications", icon: Bell, exact: false },
];

function Logo({ clientName }: { clientName: string }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <HostelloMark size={30} className="shrink-0" />
      <div className="flex flex-col leading-none min-w-0">
        <span className="text-sm font-semibold tracking-wide">HOSTELLO</span>
        <span className="text-[10px] text-ink-muted tracking-wide mt-0.5 truncate">
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
            className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
              active
                ? "bg-surface-3 text-ink-primary"
                : "text-ink-secondary hover:text-ink-primary hover:bg-surface-2"
            }`}
          >
            <Icon size={16} strokeWidth={2} />
            <span className="flex-1">{item.label}</span>
            {item.href === "/client/notifications" && unreadCount > 0 && (
              <span
                className="text-[10px] font-medium text-surface-0 rounded-full min-w-[18px] h-[18px] px-1.5 flex items-center justify-center"
                style={{ backgroundColor: "var(--color-hostello-gold)" }}
              >
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
    <div className="min-h-screen flex bg-surface-0 text-ink-primary">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 border-r border-border-hairline bg-surface-1 flex-col">
        <div className="px-5 py-6">
          <Logo clientName={clientName} />
        </div>

        <nav className="flex-1 px-3 flex flex-col gap-0.5 mt-2">
          <NavLinks pathname={pathname} unreadCount={unreadCount} />
        </nav>

        <SidebarFooter userName={userName} logoutAction={logoutAction} />
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-surface-1 border-b border-border-hairline flex items-center justify-between px-4 py-3 safe-topbar">
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
            className="absolute inset-0 bg-black/60"
            onClick={() => setMenuOpen(false)}
            aria-hidden
          />
          <div className="relative w-64 bg-surface-1 border-r border-border-hairline flex flex-col safe-panel">
            <div className="px-5 py-6 flex items-center justify-between">
              <Logo clientName={clientName} />
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="p-1 text-ink-secondary shrink-0"
              >
                <X size={18} />
              </button>
            </div>
            <nav className="flex-1 px-3 flex flex-col gap-0.5">
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
        <div className="hidden md:flex items-center gap-4 px-8 py-4 border-b border-border-hairline bg-surface-0/80 backdrop-blur sticky top-0 z-20">
          <GlobalSearch searchAction={searchAction} />
          <div className="flex-1" />
          <Link
            href="/client/bookings/new"
            className="rounded-lg py-2 px-4 text-sm font-medium text-white flex items-center gap-1.5 gradient-brand transition-transform hover:scale-[1.02]"
          >
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
