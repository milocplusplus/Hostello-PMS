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
      <div className="flex items-center rounded-xl overflow-hidden gradient-gold shadow-[0_1px_0_rgba(255,255,255,0.3)_inset,0_10px_28px_-10px_rgba(201,164,76,0.7)] transition-transform duration-150 hover:-translate-y-0.5">
        <Link
          href="/admin/bookings/new"
          className="flex items-center gap-1.5 pl-4 pr-3 py-2.5 text-sm font-semibold text-surface-0"
        >
          <Plus size={16} strokeWidth={2.5} />
          Add booking
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="More actions"
          aria-expanded={open}
          className="px-2.5 py-2.5 text-surface-0 border-l border-black/15 hover:bg-black/10 transition-colors"
        >
          <ChevronDown
            size={15}
            strokeWidth={2.5}
            className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {open && (
        <div className="absolute right-0 mt-2 w-52 rounded-xl bg-surface-2 border border-border-strong shadow-[var(--shadow-pop)] p-1.5 z-20 animate-in">
          {MENU.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-ink-secondary hover:text-ink-primary hover:bg-surface-3 transition-colors"
            >
              <m.icon size={14} className="text-hostello-purple-light" />
              {m.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
