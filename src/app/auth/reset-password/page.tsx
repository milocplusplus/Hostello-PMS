import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { HostelloMark } from "@/components/shared/HostelloMark";

export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen bg-surface-0 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-1 mb-10">
          <div className="flex items-center gap-2">
            <HostelloMark size={26} />
            <span className="text-ink-primary text-lg font-medium tracking-wide">HOSTELLO</span>
          </div>
          <p className="text-ink-muted text-xs tracking-wide">PROPERTY MANAGEMENT</p>
        </div>

        <ResetPasswordForm />
      </div>
    </main>
  );
}
