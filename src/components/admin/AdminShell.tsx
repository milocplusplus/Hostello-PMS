"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Wallet,
  HandCoins,
  BarChart3,
  Bell,
  Sun,
  Inbox,
  LogIn,
  Menu,
  X,
  Plus,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import type { StaffRole } from "@/lib/auth";
import { GlobalSearch } from "@/components/shared/GlobalSearch";
import { HostelloMark } from "@/components/shared/HostelloMark";
import { InstallAppButton } from "@/components/shared/InstallAppButton";
import { NotificationBell } from "@/components/shared/NotificationBell";
import { UserMenu } from "@/components/shared/UserMenu";
import type { NotificationItem } from "@/lib/notifications";
import type { SearchResult } from "@/lib/search";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact: boolean;
  /** Reachable, but not yet fed by real channel mail — say so rather than imply it works. */
  soon?: boolean;
};
type NavGroup = { label: string; items: NavItem[] };

/**
 * One portal, two names. The owner gets everything; ops gets the same stays
 * without a single money page in reach — a nav that hides a route it can still
 * open would only be decoration, so the owner-only routes guard themselves too
 * (`requireOwner`).
 */
function navGroups(role: StaffRole): NavGroup[] {
  const owner = role === "admin";

  return [
    {
      label: "Overview",
      items: [
        { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
        { href: "/admin/today", label: "Today", icon: Sun, exact: false },
        { href: "/admin/checkins", label: "Check-ins", icon: LogIn, exact: false },
        // Notifications are fanned out to owners only, so an ops "Activity"
        // page would always be empty.
        ...(owner
          ? [{ href: "/admin/notifications", label: "Activity", icon: Bell, exact: false }]
          : []),
      ],
    },
    {
      label: "Operations",
      items: [
        { href: "/admin/calendar", label: "Calendar", icon: CalendarDays, exact: false },
        { href: "/admin/channel-inbox", label: "Channel inbox", icon: Inbox, exact: false, soon: true },
        {
          href: "/admin/bookings",
          label: owner ? "Bookings & Payouts" : "Bookings",
          icon: Wallet,
          exact: false,
        },
        ...(owner
          ? [
              { href: "/admin/payouts", label: "Owed to Hostello", icon: HandCoins, exact: false },
              { href: "/admin/stats", label: "Stats", icon: BarChart3, exact: false },
            ]
          : []),
      ],
    },
    ...(owner
      ? [
          {
            label: "Management",
            items: [
              { href: "/admin/clients", label: "Clients & Properties", icon: Users, exact: false },
              { href: "/admin/staff", label: "Staff", icon: ShieldCheck, exact: false },
            ],
          },
        ]
      : []),
  ];
}

function Logo() {
  return (
    <div className="flex items-center gap-3">
      {/* The mark sits on its own lit tile, so the wordmark has something to
          anchor to instead of floating on the sidebar. */}
      <span className="relative flex items-center justify-center w-9 h-9 rounded-xl shrink-0 border border-border-hairline gradient-brand-subtle">
        <HostelloMark size={22} />
      </span>
      <div className="flex flex-col leading-none">
        <span className="display text-sm font-semibold tracking-[0.14em]">HOSTELLO</span>
        <span className="text-[10px] text-hostello-purple-light tracking-[0.3em] mt-1">PMS</span>
      </div>
    </div>
  );
}

function NavLinks({
  role,
  pathname,
  unreadCount,
  onNavigate,
}: {
  role: StaffRole;
  pathname: string;
  unreadCount: number;
  onNavigate?: () => void;
}) {
  return (
    <>
      {navGroups(role).map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p className="eyebrow px-3 pt-5 pb-2">{group.label}</p>
          {group.items.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.icon;
            const badge = item.href === "/admin/notifications" ? unreadCount : 0;
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
                {/* Gold rail on the active item — the one place the eye lands
                    when scanning which page it is on. */}
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
                {badge > 0 && (
                  <span className="num text-[10px] font-semibold text-surface-0 rounded-full min-w-[18px] h-[18px] px-1.5 flex items-center justify-center gradient-gold">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
                {item.soon && (
                  <span className="text-[9px] uppercase tracking-[0.12em] text-ink-muted border border-border-hairline rounded-full px-1.5 py-0.5 shrink-0">
                    Soon
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
  roleLabel,
  userName,
  logoutAction,
}: {
  roleLabel: string;
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
            <p className="text-[10px] text-ink-muted">{roleLabel}</p>
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

export function AdminShell({
  role,
  userName,
  logoutAction,
  searchAction,
  notifications,
  unreadCount,
  markAllReadAction,
  children,
}: {
  role: StaffRole;
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
  // The rename lives here: /admin serves both staff roles and says which one
  // is looking at it.
  const roleLabel = role === "ops" ? "Operations" : "Owners View";
  const showBell = role === "admin";

  return (
    <div className="min-h-screen flex text-ink-primary">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 border-r border-border-hairline glass flex-col sticky top-0 h-screen">
        <div className="px-5 py-6">
          <Logo />
        </div>

        <nav className="flex-1 px-3 flex flex-col gap-1 overflow-y-auto pb-4">
          <NavLinks role={role} pathname={pathname} unreadCount={unreadCount} />
        </nav>

        <SidebarFooter roleLabel={roleLabel} userName={userName} logoutAction={logoutAction} />
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 glass border-b border-border-hairline flex items-center justify-between px-4 py-3 safe-topbar">
        <Logo />
        <div className="flex items-center gap-1">
          {showBell && (
            <NotificationBell
              items={notifications}
              unreadCount={unreadCount}
              allHref="/admin/notifications"
              markAllAction={markAllReadAction}
            />
          )}
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
              <Logo />
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="p-1.5 rounded-lg text-ink-secondary hover:text-ink-primary hover:bg-surface-2 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <nav className="flex-1 px-3 flex flex-col gap-1 overflow-y-auto">
              <NavLinks
                role={role}
                pathname={pathname}
                unreadCount={unreadCount}
                onNavigate={() => setMenuOpen(false)}
              />
            </nav>
            <SidebarFooter roleLabel={roleLabel} userName={userName} logoutAction={logoutAction} />
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 overflow-x-hidden flex flex-col">
        {/* Desktop top bar */}
        <div className="hidden md:flex items-center gap-4 px-8 py-3.5 border-b border-border-hairline glass-deep sticky top-0 z-20">
          <GlobalSearch searchAction={searchAction} />
          <div className="flex-1" />
          <Link href="/admin/bookings/new" className="btn btn-primary">
            <Plus size={15} strokeWidth={2.5} />
            Add booking
          </Link>
          {showBell && (
            <NotificationBell
              items={notifications}
              unreadCount={unreadCount}
              allHref="/admin/notifications"
              markAllAction={markAllReadAction}
            />
          )}
          <UserMenu userName={userName} roleLabel={roleLabel} logoutAction={logoutAction} />
        </div>

        <div className="max-w-6xl w-full mx-auto px-4 md:px-8 safe-main flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}
