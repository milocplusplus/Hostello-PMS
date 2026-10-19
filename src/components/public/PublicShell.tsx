import Link from "next/link";
import type { ReactNode } from "react";
import { HostelloMark } from "@/components/shared/HostelloMark";
import { LEGAL } from "@/lib/legal";

/** The top bar every public page shares: the mark, and the two ways in. */
export function PublicHeader({ showSignUp = true }: { showSignUp?: boolean }) {
  return (
    <header className="relative z-10 w-full max-w-5xl mx-auto px-5 md:px-8 py-5 flex items-center justify-between gap-4">
      <Link href="/" className="flex items-center gap-2.5" aria-label="Hostello, home">
        <HostelloMark size={30} />
        <span className="display text-lg font-extrabold tracking-[0.16em]">HOSTELLO</span>
      </Link>
      <nav className="flex items-center gap-2">
        <Link href="/login" className="btn btn-ghost btn-sm">
          Sign in
        </Link>
        {showSignUp && (
          <Link href="/signup" className="btn btn-gold btn-sm">
            Start free trial
          </Link>
        )}
      </nav>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="relative z-10 w-full max-w-5xl mx-auto px-5 md:px-8 py-10 border-t border-border-hairline text-xs text-ink-muted flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <p>
        © {new Date().getFullYear()} {LEGAL.name}
      </p>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Link href="/terms" className="hover:text-ink-primary transition-colors">
          Terms
        </Link>
        <Link href="/privacy" className="hover:text-ink-primary transition-colors">
          Privacy
        </Link>
        <a href={`mailto:${LEGAL.email}`} className="hover:text-ink-primary transition-colors">
          {LEGAL.email}
        </a>
        <a href={`https://wa.me/${LEGAL.whatsapp}`} className="hover:text-ink-primary transition-colors">
          {LEGAL.phone}
        </a>
      </p>
    </footer>
  );
}

/** A long document: terms, privacy. Headings are numbered by the caller's sections. */
export function LegalDocument({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: ReactNode;
  sections: { heading: string; body: ReactNode }[];
}) {
  return (
    <main className="min-h-screen flex flex-col bg-surface-0 text-ink-primary">
      <PublicHeader />
      <article className="w-full max-w-3xl mx-auto px-5 md:px-8 pb-16 flex-1">
        <h1 className="text-3xl md:text-4xl mt-6">{title}</h1>
        <p className="text-xs text-ink-muted mt-2">Last updated {LEGAL.updated}</p>

        {!LEGAL.reviewed && (
          <p className="mt-5 rounded-2xl border border-status-pending/40 bg-status-pending/10 px-4 py-3 text-xs text-status-pending">
            Draft. This document has not yet been reviewed by a lawyer and may change before launch.
          </p>
        )}

        <div className="mt-6 text-sm text-ink-secondary leading-relaxed flex flex-col gap-3">{intro}</div>

        <div className="mt-8 flex flex-col gap-8">
          {sections.map((s, i) => (
            <section key={s.heading} className="flex flex-col gap-2">
              <h2 className="text-lg text-ink-primary">
                {i + 1}. {s.heading}
              </h2>
              <div className="text-sm text-ink-secondary leading-relaxed flex flex-col gap-2.5">{s.body}</div>
            </section>
          ))}
        </div>
      </article>
      <PublicFooter />
    </main>
  );
}
