import { WifiOff } from "lucide-react";

// Precached by the service worker and served when a navigation fails with no
// network. Every page in this app is server-rendered against Supabase, so there
// is nothing honest to show offline — say so instead of faking a shell.
export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-surface-0 flex flex-col items-center justify-center px-6 text-center">
      <div className="w-12 h-12 rounded-xl bg-surface-2 border border-border-hairline flex items-center justify-center mb-5">
        <WifiOff size={20} className="text-ink-muted" />
      </div>
      <h1 className="text-ink-primary text-lg font-medium">You&apos;re offline</h1>
      <p className="text-ink-secondary text-sm mt-2 max-w-xs">
        Hostello PMS needs a connection to load your bookings and calendar.
        Reconnect and try again.
      </p>
    </main>
  );
}
