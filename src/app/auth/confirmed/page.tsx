import { ConfirmedHandler } from "@/components/auth/ConfirmedHandler";
import { HostelloMark } from "@/components/shared/HostelloMark";

export default function ConfirmedPage() {
  return (
    <main className="min-h-screen bg-surface-0 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-10">
          <HostelloMark size={26} />
          <span className="text-ink-primary text-lg font-medium tracking-wide">HOSTELLO</span>
        </div>
        <ConfirmedHandler />
      </div>
    </main>
  );
}
