import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { InfoSheet } from "@/components/shared/InfoSheet";

/**
 * Every page's top: a heavy title, an optional back link and actions, and at
 * most one short line under it. Anything longer — what the page is for, how it
 * works — goes in `info`, behind an (i), instead of sitting on screen.
 */
export function PageHeader({
  title,
  sub,
  info,
  back,
  actions,
}: {
  title: string;
  sub?: ReactNode;
  info?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {back && (
        <Link
          href={back.href}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-muted hover:text-hostello-purple-light transition-colors w-fit"
        >
          <ArrowLeft size={14} />
          {back.label}
        </Link>
      )}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2">
          <h1 className="text-[28px] md:text-3xl truncate">{title}</h1>
          {info && (
            <InfoSheet title={title} className="bg-white/8 text-ink-secondary">
              {info}
            </InfoSheet>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {sub && <p className="text-sm font-semibold text-ink-secondary -mt-1">{sub}</p>}
    </div>
  );
}
