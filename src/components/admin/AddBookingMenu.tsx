"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Plus, ChevronDown, Lock, CalendarDays, Users } from "lucide-react";

const MENU = [
  { href: "/admin/calendar/block", label: "Block dates", icon: Lock },
  { href: "/admin/calendar", label: "Check calendar", icon: CalendarDays },
  { href: "/admin/clients/new", label: "Add client", icon: Users },
];

export function AddBookingMenu() {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={wrap} className="relative shrink-0">
      <div className="flex items-center rounded-lg overflow-hidden gradient-gold">
        <Link
          href="/admin/bookings/new"
          className="flex items-center gap-1.5 pl-3.5 pr-3 py-2.5 text-sm font-medium text-surface-0"
        >
          <Plus size={16} strokeWidth={2.5} />
          Add booking
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="More actions"
          aria-expanded={open}
          className="px-2 py-2.5 text-surface-0 border-l border-black/15"
        >
          <ChevronDown size={15} strokeWidth={2.5} />
        </button>
      </div>

      {open && (
        <div className="absolute right-0 mt-1.5 w-48 rounded-lg bg-surface-2 border border-border-strong shadow-[var(--shadow-card)] p-1 z-20">
          {MENU.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-ink-secondary hover:text-ink-primary hover:bg-surface-3 transition-colors"
            >
              <m.icon size={14} />
              {m.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
