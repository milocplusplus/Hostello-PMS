import Link from "next/link";
import { Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

/** Airbnb emails the app could not add by itself. Nothing at all when there are none. */
export async function HostEmailsCard({ clientId }: { clientId: string }) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("ota_messages")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .in("status", ["pending", "needs_property", "failed"]);

  if (!count) return null;

  return (
    <Link
      href="/client/emails"
      className="card card-hover p-4 flex items-center gap-4"
    >
      <span className="shrink-0 w-10 h-10 rounded-2xl gradient-brand flex items-center justify-center text-white">
        <Inbox size={18} aria-hidden />
      </span>
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-sm font-semibold">
          {count === 1 ? "1 Airbnb email needs you" : `${count} Airbnb emails need you`}
        </span>
        <span className="text-xs text-ink-secondary">Open them to add the booking or dismiss them.</span>
      </span>
      <span className="text-[13px] font-bold text-hostello-purple-light shrink-0">Open</span>
    </Link>
  );
}
