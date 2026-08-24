"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, CalendarDays, Wallet, Building2, Bell, Menu, X } from "lucide-react";
import type { ReactNode } from "react";

const NAV = [
  { href: "/client", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/client/calendar", label: "Calendar", icon: CalendarDays, exact: false },
  { href: "/client/bookings", label: "Bookings", icon: Wallet, exact: false },
  { href: "/client/notifications", label: "Notifications", icon: Bell, exact: false },
];

function Logo({ clientName }: { clientName: string }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 gradient-brand"
      >
        <Building2 size={16} className="text-white" strokeWidth={2} />
      </div>
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

export function ClientShell({
  userName,
  clientName,
  unreadCount = 0,
  logoutAction,
  children,
}: {
  userName: string;
  clientName: string;
  unreadCount?: number;
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
          <Logo clientName={clientName} />
        </div>

        <nav className="flex-1 px-3 flex flex-col gap-0.5 mt-2">
          <NavLinks pathname={pathname} unreadCount={unreadCount} />
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
        <Logo clientName={clientName} />
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          className="p-2 -mr-2 text-ink-secondary shrink-0 relative"
        >
          <Menu size={20} />
          {unreadCount > 0 && (
            <span
              className="absolute top-1 right-1 w-2 h-2 rounded-full"
              style={{ backgroundColor: "var(--color-hostello-gold)" }}
            />
          )}
        </button>
      </div>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMenuOpen(false)}
            aria-hidden
          />
          <div className="relative w-64 bg-surface-1 border-r border-border-hairline flex flex-col">
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
              <NavLinks pathname={pathname} unreadCount={unreadCount} onNavigate={() => setMenuOpen(false)} />
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
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 overflow-x-hidden">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10 pt-20 md:pt-10">{children}</div>
      </div>
    </div>
  );
}
