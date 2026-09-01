"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Users, Building2, CalendarClock, Loader2 } from "lucide-react";
import type { SearchResult } from "@/lib/search";

const KIND_ICON = {
  client: Users,
  property: Building2,
  booking: CalendarClock,
} as const;

/** Shared by both shells; each passes its own scoped Server Action. */
export function GlobalSearch({
  searchAction,
}: {
  searchAction: (query: string) => Promise<SearchResult[]>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Cmd/Ctrl+K to focus, Escape to close.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Close on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      return;
    }
    const handle = setTimeout(() => {
      startTransition(async () => {
        const r = await searchAction(query);
        setResults(r);
      });
    }, 200);
    return () => clearTimeout(handle);
  }, [query, searchAction]);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  return (
    <div ref={containerRef} className="relative flex-1 max-w-md">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search bookings, guests, properties..."
          className="field w-full pl-9 pr-14 py-2.5 rounded-xl"
        />
        <kbd className="hidden sm:flex absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-medium text-ink-muted bg-surface-3/70 border border-border-hairline rounded-md px-1.5 py-1 leading-none">
          ⌘K
        </kbd>
      </div>

      {open && query.trim().length >= 2 && (
        <div className="absolute top-full left-0 right-0 mt-2 card overflow-hidden z-50 max-h-96 overflow-y-auto animate-in shadow-[var(--shadow-pop)]">
          {isPending && results.length === 0 && (
            <div className="flex items-center gap-2 px-4 py-4 text-xs text-ink-muted">
              <Loader2 size={13} className="animate-spin" />
              Searching...
            </div>
          )}

          {!isPending && results.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-ink-muted">
              No matches for &ldquo;{query}&rdquo;.
            </div>
          )}

          {results.length > 0 && (
            <ul className="divide-y divide-[var(--color-border-hairline)]">
              {results.map((r) => {
                const Icon = KIND_ICON[r.kind];
                return (
                  <li key={`${r.kind}-${r.id}`}>
                    <button
                      type="button"
                      onClick={() => go(r.href)}
                      className="group w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2 transition-colors"
                    >
                      <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-hostello-purple-glow/15 border border-hostello-purple-glow/20 group-hover:bg-hostello-purple-glow/25 transition-colors">
                        <Icon size={14} className="text-hostello-purple-light" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm text-ink-primary truncate">{r.title}</p>
                        <p className="text-xs text-ink-muted truncate">{r.subtitle}</p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
