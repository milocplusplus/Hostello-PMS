"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
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
  LayoutGrid,
  Search,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { HostelloMark } from "@/components/shared/HostelloMark";
import { InstallAppButton } from "@/components/shared/InstallAppButton";
import { GlobalSearch } from "@/components/shared/GlobalSearch";
import { NotificationBell } from "@/components/shared/NotificationBell";
import { UserMenu } from "@/components/shared/UserMenu";
import { SubmitButton } from "@/components/shared/Busy";
import type { NotificationItem } from "@/lib/notifications";
import type { SearchResult } from "@/lib/search";

const NAV = [
  { href: "/client", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/client/today", label: "Today", icon: Sun, exact: false },
  { href: "/client/checkins", label: "Check-ins", icon: LogIn, exact: false },
  { href: "/client/calendar", label: "Calendar", icon: CalendarDays, exact: false },
  { href: "/client/properties", label: "Properties", icon: Building2, exact: false },
  { href: "/client/availability", label: "Availability", icon: BedDouble, exact: false },
  { href: "/client/bookings", label: "Bookings", icon: Wallet, exact: false },
  { href: "/client/settlements", label: "Settlements", icon: HandCoins, exact: false },
  { href: "/client/expenses", label: "Expenses", icon: Receipt, exact: false },
  { href: "/client/stats", label: "Stats", icon: BarChart3, exact: false },
  { href: "/client/notifications", label: "Notifications", icon: Bell, exact: false },
];

/** The phone's bottom bar. Everything else in NAV lives behind "More". */
const TABS = [
  { href: "/client", label: "Home", icon: Home, exact: true },
  { href: "/client/calendar", label: "Calendar", icon: CalendarDays, exact: false },
  { href: "/client/bookings", label: "Bookings", icon: BedDouble, exact: false },
  { href: "/client/settlements", label: "Money", icon: Wallet, exact: false },
];

const MORE: { href: string; label: string; icon: LucideIcon; tint: string }[] = [
  { href: "/client/today", label: "Today", icon: Sun, tint: "linear-gradient(135deg, #ea580c, #db2777)" },
  { href: "/client/checkins", label: "Check-ins", icon: LogIn, tint: "linear-gradient(135deg, #059669, #0d9488)" },
  { href: "/client/properties", label: "Properties", icon: Building2, tint: "linear-gradient(135deg, #1d4ed8, #6366f1)" },
  { href: "/client/availability", label: "Find dates", icon: Search, tint: "linear-gradient(135deg, #0891b2, #2563eb)" },
  { href: "/client/expenses", label: "Expenses", icon: Receipt, tint: "linear-gradient(135deg, #c2410c, #e11d48)" },
  { href: "/client/stats", label: "Stats", icon: BarChart3, tint: "linear-gradient(135deg, #7c3aed, #c026d3)" },
  { href: "/client/notifications", label: "Alerts", icon: Bell, tint: "linear-gradient(135deg, #a16207, #d97706)" },
];

const isActive = (pathname: string, href: string, exact: boolean) =>
  exact ? pathname === href : pathname.startsWith(href);

const PILL = {
  background: "linear-gradient(135deg, var(--color-hostello-purple-glow), var(--color-hostello-magenta))",
  boxShadow: "0 6px 20px -4px rgba(168, 85, 247, 0.9)",
};

function TabBar({
  pathname,
  unreadCount,
  onMore,
}: {
  pathname: string;
  unreadCount: number;
  onMore: () => void;
}) {
  const moreActive = MORE.some((m) => pathname.startsWith(m.href));
  const item = "relative flex flex-col items-center gap-1 text-[11px] font-bold transition-colors";
  const pill = (active: boolean) =>
    active ? (
      <motion.span
        layoutId="tab-pill"
        className="absolute inset-0 rounded-xl"
        style={PILL}
        transition={{ type: "spring", stiffness: 520, damping: 34 }}
      />
    ) : null;

  return (
    <nav
      data-tabbar
      aria-label="Main"
      className="md:hidden fixed z-30 left-3 right-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] h-[4.5rem] rounded-[26px] bg-surface-1/90 backdrop-blur-xl border border-white/10 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.85)] grid grid-cols-5 items-center px-1"
    >
      {TABS.map((t) => {
        const active = isActive(pathname, t.href, t.exact);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`${item} ${active ? "text-white" : "text-ink-muted"}`}
          >
            <span className="relative w-12 h-8 flex items-center justify-center">
              {pill(active)}
              <t.icon size={20} strokeWidth={2.2} className="relative" />
            </span>
            {t.label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onMore}
        aria-haspopup="dialog"
        className={`${item} ${moreActive ? "text-white" : "text-ink-muted"}`}
      >
        <span className="relative w-12 h-8 flex items-center justify-center">
          {pill(moreActive)}
          <LayoutGrid size={20} strokeWidth={2.2} className="relative" />
          {unreadCount > 0 && (
            <span className="absolute top-0.5 right-2.5 w-2 h-2 rounded-full bg-hostello-gold-bright shadow-[0_0_0_2px_var(--color-surface-1),0_0_8px_var(--color-hostello-gold-bright)]" />
          )}
        </span>
        More
      </button>
    </nav>
  );
}

function MoreSheet({
  open,
  onClose,
  unreadCount,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  unreadCount: number;
  footer: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="md:hidden fixed inset-0 z-40 flex flex-col justify-end" role="dialog" aria-modal aria-label="More">
          <motion.button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            className="relative bg-surface-1 border-t border-white/10 rounded-t-[30px] pt-2.5 pb-[env(safe-area-inset-bottom)] flex flex-col gap-4 shadow-[var(--shadow-pop)]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 340 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80 || info.velocity.y > 500) onClose();
            }}
          >
            <span className="w-10 h-1.5 rounded-full bg-white/20 self-center" />
            <div className="grid grid-cols-4 gap-y-5 gap-x-2 px-5 pt-2">
              {MORE.map((m, i) => (
                <motion.div
                  key={m.href}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 + i * 0.03, type: "spring", stiffness: 420, damping: 28 }}
                >
                  <Link
                    href={m.href}
                    onClick={onClose}
                    className="flex flex-col items-center gap-2 text-xs font-bold text-ink-primary active:scale-95 transition-transform"
                  >
                    <span
                      className="relative w-14 h-14 rounded-[20px] flex items-center justify-center text-white shadow-[0_10px_24px_-10px_rgba(0,0,0,0.9)]"
                      style={{ background: m.tint }}
                    >
                      <m.icon size={24} strokeWidth={2} />
                      {m.href === "/client/notifications" && unreadCount > 0 && (
                        <span className="num absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full text-[10px] font-extrabold text-surface-0 gradient-gold flex items-center justify-center">
                          {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                      )}
                    </span>
                    {m.label}
                  </Link>
                </motion.div>
              ))}
            </div>
            {footer}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

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
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-surface-0/85 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-4 py-3 safe-topbar">
        <Logo clientName={clientName} />
        <NotificationBell
          items={notifications}
          unreadCount={unreadCount}
          allHref="/client/notifications"
          markAllAction={markAllReadAction}
        />
      </div>

      <TabBar pathname={pathname} unreadCount={unreadCount} onMore={openMore} />
      <MoreSheet
        open={menuOpen}
        onClose={closeMore}
        unreadCount={unreadCount}
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

        <div className="max-w-5xl w-full mx-auto px-4 md:px-8 safe-main flex-1">{children}</div>
      </div>
    </div>
  );
}
