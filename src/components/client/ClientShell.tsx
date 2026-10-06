"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { motion } from "motion/react";
import {
  LayoutDashboard,
  CalendarDays,
  Wallet,
  HandCoins,
  Receipt,
  BarChart3,
  Bell,
  Sun,
  BedDouble,
  Building2,
  LogIn,
  Plus,
  Home,
  Search,
} from "lucide-react";
import type { ReactNode } from "react";
import { HostelloMark } from "@/components/shared/HostelloMark";
import { InstallAppButton } from "@/components/shared/InstallAppButton";
import { GlobalSearch } from "@/components/shared/GlobalSearch";
import { NotificationBell } from "@/components/shared/NotificationBell";
import { UserMenu } from "@/components/shared/UserMenu";
import { MoreSheet, PILL, TabBar, isActive, type MoreItem, type TabItem } from "@/components/shared/PhoneNav";
import { SubmitButton } from "@/components/shared/Busy";
import type { NotificationItem } from "@/lib/notifications";
import type { SearchResult } from "@/lib/search";

const NAV = [
  { href: "/client", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/client/today", label: "Today", icon: Sun, exact: false },
  { href: "/client/checkins", label: "Check-ins", icon: LogIn, exact: false },
  { href: "/client/calendar", label: "Calendar", icon: CalendarDays, exact: false },
  { href: "/client/properties", label: "Properties", icon: Building2, exact: false },
  { href: "/client/availability", label: "Find dates", icon: BedDouble, exact: false },
  { href: "/client/bookings", label: "Bookings", icon: Wallet, exact: false },
  { href: "/client/settlements", label: "Settlements", icon: HandCoins, exact: false },
  { href: "/client/expenses", label: "Expenses", icon: Receipt, exact: false },
  { href: "/client/stats", label: "Stats", icon: BarChart3, exact: false },
  { href: "/client/notifications", label: "Notifications", icon: Bell, exact: false },
];

/** The phone's bottom bar. Everything else in NAV lives behind "More". */
const TABS: TabItem[] = [
  { href: "/client", label: "Home", icon: Home, exact: true },
  { href: "/client/calendar", label: "Calendar", icon: CalendarDays, exact: false },
  { href: "/client/bookings", label: "Bookings", icon: BedDouble, exact: false },
  { href: "/client/settlements", label: "Money", icon: Wallet, exact: false },
];

const MORE: MoreItem[] = [
  { href: "/client/today", label: "Today", icon: Sun, tint: "linear-gradient(135deg, #ea580c, #db2777)" },
  { href: "/client/checkins", label: "Check-ins", icon: LogIn, tint: "linear-gradient(135deg, #059669, #0d9488)" },
  { href: "/client/properties", label: "Properties", icon: Building2, tint: "linear-gradient(135deg, #1d4ed8, #6366f1)" },
  { href: "/client/availability", label: "Find dates", icon: Search, tint: "linear-gradient(135deg, #0891b2, #2563eb)" },
  { href: "/client/expenses", label: "Expenses", icon: Receipt, tint: "linear-gradient(135deg, #c2410c, #e11d48)" },
  { href: "/client/stats", label: "Stats", icon: BarChart3, tint: "linear-gradient(135deg, #7c3aed, #c026d3)" },
  { href: "/client/notifications", label: "Alerts", icon: Bell, tint: "linear-gradient(135deg, #a16207, #d97706)" },
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
        const active = isActive(pathname, item.href, item.exact);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`group relative flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-sm font-semibold transition-colors duration-200 ${
              active ? "text-white" : "text-ink-secondary hover:text-ink-primary hover:bg-white/5"
            }`}
          >
            {active && (
              <motion.span
                layoutId="side-pill"
                className="absolute inset-0 rounded-2xl"
                style={PILL}
                transition={{ type: "spring", stiffness: 520, damping: 38 }}
              />
            )}
            <Icon
              size={18}
              strokeWidth={2.2}
              className={`relative shrink-0 transition-colors ${
                active ? "text-white" : "text-ink-muted group-hover:text-hostello-purple-light"
              }`}
            />
            <span className="relative flex-1 truncate">{item.label}</span>
            {item.href === "/client/notifications" && unreadCount > 0 && (
              <span className="relative num text-[10px] font-semibold text-surface-0 rounded-full min-w-[18px] h-[18px] px-1.5 flex items-center justify-center gradient-gold">
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
          both the desktop sidebar and the phone's More sheet. */}
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
          <SubmitButton
            className="text-[11px] text-ink-muted hover:text-ink-primary transition-colors shrink-0 px-1"
            blocking
            busy="Signing you out…"
            note="Closing your session."
          >
            Sign out
          </SubmitButton>
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
  const openMore = useCallback(() => setMenuOpen(true), []);
  const closeMore = useCallback(() => setMenuOpen(false), []);

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
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-surface-0/95 border-b border-white/5 flex items-center justify-between px-4 py-3 safe-topbar">
        <Logo clientName={clientName} />
        <NotificationBell
          items={notifications}
          unreadCount={unreadCount}
          allHref="/client/notifications"
          markAllAction={markAllReadAction}
        />
      </div>

      <TabBar tabs={TABS} more={MORE} pathname={pathname} dot={unreadCount > 0} onMore={openMore} />
      <MoreSheet
        open={menuOpen}
        onClose={closeMore}
        items={MORE.map((m) => (m.href === "/client/notifications" ? { ...m, badge: unreadCount } : m))}
        footer={<SidebarFooter userName={userName} logoutAction={logoutAction} />}
      />

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

        <div className="page-stage max-w-5xl w-full mx-auto px-4 md:px-8 safe-main flex-1">{children}</div>
      </div>
    </div>
  );
}
