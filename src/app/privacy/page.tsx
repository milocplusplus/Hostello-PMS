import Link from "next/link";

export const metadata = { title: "Privacy · Hostello" };

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-surface-0 text-ink-primary px-6 py-12">
      <div className="max-w-2xl mx-auto flex flex-col gap-4">
        <h1 className="text-xl font-bold">Privacy policy</h1>
        <p className="text-sm text-status-pending">
          Draft. This policy is a placeholder and has not been reviewed yet.
        </p>
        <p className="text-sm text-ink-secondary">
          We store what you enter: your account details, your listings, bookings, guest names and
          phone numbers, any guest ID scans and bill photos you upload, and your expenses. Only you
          can see your own data; Hostello staff may view it to give support. You can export it and
          delete your account at any time.
        </p>
        <Link href="/signup" className="text-xs text-hostello-gold hover:underline">
          ← Back to sign up
        </Link>
      </div>
    </main>
  );
}
