import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";
import { ClientShell } from "@/components/client/ClientShell";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  if (profile?.role === "admin") redirect("/admin");

  const { data: clientRecord } = await supabase
    .from("clients")
    .select("id, name")
    .eq("owner_user_id", user.id)
    .single();

  if (!clientRecord) {
    // Signed-in client user with no linked client record yet — nothing to show.
    return (
      <div className="min-h-screen bg-surface-0 text-ink-primary flex items-center justify-center px-6">
        <div className="card p-8 max-w-sm text-center">
          <p className="text-sm text-ink-secondary">
            Your account isn&apos;t linked to a client record yet. Contact Hostello to get set up.
          </p>
          <form action={logout} className="mt-4">
            <button
              type="submit"
              className="text-xs text-ink-secondary border border-border-hairline rounded-md px-3 py-1.5 hover:border-border-strong transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    );
  }

  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("client_id", clientRecord.id)
    .is("read_at", null);

  return (
    <ClientShell
      userName={profile?.full_name ?? clientRecord.name}
      clientName={clientRecord.name}
      unreadCount={unreadCount ?? 0}
      logoutAction={logout}
    >
      {children}
    </ClientShell>
  );
}
