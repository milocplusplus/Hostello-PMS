import Link from "next/link";

export const metadata = { title: "Terms · Hostello" };

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-surface-0 text-ink-primary px-6 py-12">
      <div className="max-w-2xl mx-auto flex flex-col gap-4">
        <h1 className="text-xl font-bold">Terms of service</h1>
        <p className="text-sm text-status-pending">
          Draft. These terms are a placeholder and have not been reviewed yet.
        </p>
        <p className="text-sm text-ink-secondary">
          Hostello is a tool for tracking your own short-term-rental bookings, calendars and
          expenses. You stay responsible for your listings, your guests and the accuracy of what
          you enter. Plans are billed by the number of listings; a free trial lasts 14 days and
          needs no card. If a plan lapses, your account becomes read-only and later paused; your
          data is kept so you can come back.
        </p>
        <Link href="/signup" className="text-xs text-hostello-gold hover:underline">
          ← Back to sign up
        </Link>
      </div>
    </main>
  );
}
