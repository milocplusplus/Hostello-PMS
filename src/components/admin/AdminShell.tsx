"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Wallet,
  Bell,
  Sun,
  Menu,
  X,
  Plus,
} from "lucide-react";
import type { ReactNode } from "react";
import { GlobalSearch } from "@/components/shared/GlobalSearch";
import { HostelloMark } from "@/components/shared/HostelloMark";
import { InstallAppButton } from "@/components/shared/InstallAppButton";
import { NotificationBell } from "@/components/shared/NotificationBell";
import { UserMenu } from "@/components/shared/UserMenu";
import type { NotificationItem } from "@/lib/notifications";
import type { SearchResult } from "@/lib/search";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; exact: boolean };
type NavGroup = { label: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/admin/today", label: "Today", icon: Sun, exact: false },
      { href: "/admin/notifications", label: "Activity", icon: Bell, exact: false },
    ],
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
      <HostelloMark size={30} className="shrink-0" />
      <div className="flex flex-col leading-none">
        <span className="text-sm font-semibold tracking-wide">HOSTELLO</span>
        <span className="text-[10px] text-hostello-purple-glow tracking-widest mt-0.5">PMS</span>
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
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          <p className="px-3 pt-4 pb-1.5 text-[10px] font-medium tracking-widest text-ink-muted uppercase">
            {group.label}
          </p>
          {group.items.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.icon;
            const badge = item.href === "/admin/notifications" ? unreadCount : 0;
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
                <span className="flex-1">{item.label}</span>
                {badge > 0 && (
                  <span
                    className="text-[10px] font-medium text-surface-0 rounded-full min-w-[18px] h-[18px] px-1.5 flex items-center justify-center"
                    style={{ backgroundColor: "var(--color-hostello-gold)" }}
                  >
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
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

export function AdminShell({
  userName,
  logoutAction,
  searchAction,
  notifications,
  unreadCount,
  markAllReadAction,
  children,
}: {
  userName: string;
  logoutAction: () => Promise<void>;
  searchAction: (query: string) => Promise<SearchResult[]>;
  notifications: NotificationItem[];
  unreadCount: number;
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
          <Logo />
        </div>

        <nav className="flex-1 px-3 flex flex-col gap-0.5 overflow-y-auto pb-4">
          <NavLinks pathname={pathname} unreadCount={unreadCount} />
        </nav>

        <SidebarFooter userName={userName} logoutAction={logoutAction} />
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-surface-1 border-b border-border-hairline flex items-center justify-between px-4 py-3 safe-topbar">
        <Logo />
        <div className="flex items-center gap-1">
          <NotificationBell
            items={notifications}
            unreadCount={unreadCount}
            allHref="/admin/notifications"
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
          <div className="absolute inset-0 bg-black/60" onClick={() => setMenuOpen(false)} aria-hidden />
          <div className="relative w-64 bg-surface-1 border-r border-border-hairline flex flex-col safe-panel">
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
            href="/admin/bookings/new"
            className="rounded-lg py-2 px-4 text-sm font-medium text-white flex items-center gap-1.5 gradient-brand transition-transform hover:scale-[1.02]"
          >
            <Plus size={15} strokeWidth={2.5} />
            Add booking
          </Link>
          <NotificationBell
            items={notifications}
            unreadCount={unreadCount}
            allHref="/admin/notifications"
            markAllAction={markAllReadAction}
          />
          <UserMenu userName={userName} roleLabel="Admin" logoutAction={logoutAction} />
        </div>

        <div className="max-w-6xl w-full mx-auto px-4 md:px-8 safe-main flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}
