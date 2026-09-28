"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { motion } from "motion/react";
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
  BedDouble,
  LogIn,
  Plus,
  PencilRuler,
  ShieldCheck,
  History,
  Settings,
  Home,
  Search,
} from "lucide-react";
import type { ReactNode } from "react";
import type { StaffRole } from "@/lib/auth";
import { GlobalSearch } from "@/components/shared/GlobalSearch";
import { HostelloMark } from "@/components/shared/HostelloMark";
import { InstallAppButton } from "@/components/shared/InstallAppButton";
import { NotificationBell } from "@/components/shared/NotificationBell";
import { UserMenu } from "@/components/shared/UserMenu";
import { MoreSheet, PILL, TabBar, isActive, type MoreItem, type TabItem } from "@/components/shared/PhoneNav";
import { SubmitButton } from "@/components/shared/Busy";
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
function navGroups(role: StaffRole, inboxLive = false): NavGroup[] {
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
        { href: "/admin/availability", label: "Availability", icon: BedDouble, exact: false },
        // "Soon" until Settings has the inbox address — nothing arrives before that.
        { href: "/admin/channel-inbox", label: "Channel inbox", icon: Inbox, exact: false, soon: !inboxLive },
        {
          href: "/admin/bookings",
          label: owner ? "Bookings & Payouts" : "Bookings",
          icon: Wallet,
          exact: false,
        },
        ...(owner
          ? [
              { href: "/admin/settlements", label: "Settlements", icon: HandCoins, exact: false },
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
              {
                href: "/admin/property-requests",
                label: "Rate requests",
                icon: PencilRuler,
                exact: false,
              },
              { href: "/admin/staff", label: "Staff", icon: ShieldCheck, exact: false },
              { href: "/admin/audit", label: "Audit log", icon: History, exact: false },
              { href: "/admin/settings", label: "Settings", icon: Settings, exact: false },
            ],
          },
        ]
      : []),
  ];
}

/** The phone's four tabs. Ops has no money pages, so its fourth is Today. */
function phoneTabs(role: StaffRole): TabItem[] {
  return [
    { href: "/admin", label: "Home", icon: Home, exact: true },
    { href: "/admin/calendar", label: "Calendar", icon: CalendarDays, exact: false },
    { href: "/admin/bookings", label: "Bookings", icon: BedDouble, exact: false },
    role === "admin"
      ? { href: "/admin/settlements", label: "Money", icon: Wallet, exact: false }
      : { href: "/admin/today", label: "Today", icon: Sun, exact: false },
  ];
}

/** A tile colour and a short label for each page behind More. */
const MORE_LOOK: Record<string, { label?: string; tint: string; icon?: MoreItem["icon"] }> = {
  "/admin/today": { tint: "linear-gradient(135deg, #ea580c, #db2777)" },
  "/admin/checkins": { tint: "linear-gradient(135deg, #059669, #0d9488)" },
  "/admin/notifications": { tint: "linear-gradient(135deg, #a16207, #d97706)" },
  "/admin/availability": { label: "Find dates", icon: Search, tint: "linear-gradient(135deg, #0891b2, #2563eb)" },
  "/admin/channel-inbox": { label: "Inbox", tint: "linear-gradient(135deg, #334155, #6366f1)" },
  "/admin/stats": { tint: "linear-gradient(135deg, #7c3aed, #c026d3)" },
  "/admin/clients": { label: "Clients", tint: "linear-gradient(135deg, #1d4ed8, #6366f1)" },
  "/admin/property-requests": { label: "Rates", tint: "linear-gradient(135deg, #be123c, #f97316)" },
  "/admin/staff": { tint: "linear-gradient(135deg, #0f766e, #22d3ee)" },
  "/admin/audit": { label: "Audit", tint: "linear-gradient(135deg, #475569, #a855f7)" },
  "/admin/settings": { tint: "linear-gradient(135deg, #52525b, #c9a44c)" },
};

/** Every page in the sidebar that is not a tab, in sidebar order. */
/** Count badges by nav href: unread activity, and channel emails waiting. */
type Badges = Record<string, number>;

function moreItems(role: StaffRole, badges: Badges, inboxLive: boolean): MoreItem[] {
  const tabs = new Set(phoneTabs(role).map((t) => t.href));
  return navGroups(role, inboxLive)
    .flatMap((g) => g.items)
    .filter((i) => !tabs.has(i.href))
    .map((i) => {
      const look = MORE_LOOK[i.href];
      return {
        href: i.href,
        label: look?.label ?? i.label,
        icon: look?.icon ?? i.icon,
        tint: look?.tint ?? "linear-gradient(135deg, #4c1d95, #7c3aed)",
        soon: i.soon,
        badge: badges[i.href] || undefined,
      };
    });
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
  badges,
  inboxLive,
  onNavigate,
}: {
  role: StaffRole;
  pathname: string;
  badges: Badges;
  inboxLive: boolean;
  onNavigate?: () => void;
}) {
  return (
    <>
      {navGroups(role, inboxLive).map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p className="eyebrow px-3 pt-5 pb-2">{group.label}</p>
          {group.items.map((item) => {
            const active = isActive(pathname, item.href, item.exact);
            const Icon = item.icon;
            const badge = badges[item.href] ?? 0;
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
                {badge > 0 && (
                  <span className="relative num text-[10px] font-semibold text-surface-0 rounded-full min-w-[18px] h-[18px] px-1.5 flex items-center justify-center gradient-gold">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
                {item.soon && (
                  <span className="relative text-[9px] uppercase tracking-[0.12em] text-ink-muted border border-border-hairline rounded-full px-1.5 py-0.5 shrink-0">
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
          both the desktop sidebar and the phone's More sheet. */}
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

export function AdminShell({
  role,
  userName,
  logoutAction,
  searchAction,
  notifications,
  unreadCount,
  inboxCount = 0,
  inboxLive = false,
  markAllReadAction,
  children,
}: {
  role: StaffRole;
  userName: string;
  logoutAction: () => Promise<void>;
  searchAction: (query: string) => Promise<SearchResult[]>;
  notifications: NotificationItem[];
  unreadCount: number;
  /** Channel emails still waiting for someone (open statuses). */
  inboxCount?: number;
  /** The inbox address is set, so the inbox is no longer "coming soon". */
  inboxLive?: boolean;
  markAllReadAction: () => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const openMore = useCallback(() => setMenuOpen(true), []);
  const closeMore = useCallback(() => setMenuOpen(false), []);
  // The rename lives here: /admin serves both staff roles and says which one
  // is looking at it.
  const roleLabel = role === "ops" ? "Operations" : "Owners View";
  const showBell = role === "admin";
  const badges: Badges = { "/admin/notifications": unreadCount, "/admin/channel-inbox": inboxCount };

  return (
    <div className="min-h-screen flex text-ink-primary">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 border-r border-border-hairline glass flex-col sticky top-0 h-screen">
        <div className="px-5 py-6">
          <Logo />
        </div>

        <nav className="flex-1 px-3 flex flex-col gap-1 overflow-y-auto pb-4">
          <NavLinks role={role} pathname={pathname} badges={badges} inboxLive={inboxLive} />
        </nav>

        <SidebarFooter roleLabel={roleLabel} userName={userName} logoutAction={logoutAction} />
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-surface-0/95 border-b border-white/5 flex items-center justify-between px-4 py-3 safe-topbar">
        <Logo />
        {showBell && (
          <NotificationBell
            items={notifications}
            unreadCount={unreadCount}
            allHref="/admin/notifications"
            markAllAction={markAllReadAction}
          />
        )}
      </div>

      <TabBar
        tabs={phoneTabs(role)}
        more={moreItems(role, badges, inboxLive)}
        pathname={pathname}
        dot={(showBell && unreadCount > 0) || inboxCount > 0}
        onMore={openMore}
      />
      <MoreSheet
        open={menuOpen}
        onClose={closeMore}
        items={moreItems(role, badges, inboxLive)}
        footer={<SidebarFooter roleLabel={roleLabel} userName={userName} logoutAction={logoutAction} />}
      />

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
