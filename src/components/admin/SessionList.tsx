import { LogOut, Monitor, Smartphone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { describeDevice, sinceShort } from "@/lib/devices";
import { endSessions } from "@/app/admin/staff/actions";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";

type SessionRow = {
  id: string;
  signed_in_at: string;
  last_active: string | null;
  user_agent: string | null;
  ip: string | null;
  is_current: boolean;
};

/**
 * Where one person is signed in, with a sign-out per device and one for all.
 * Server-rendered; `list_user_sessions` decides who may see the list.
 * `self` is the admin's own list, where "all" means "all but this one".
 */
export async function SessionList({
  userId,
  name,
  from,
  self = false,
}: {
  userId: string;
  name: string;
  /** The page to come back to after a sign-out. */
  from: string;
  self?: boolean;
}) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_user_sessions", { p_user_id: userId });
  const sessions = (data ?? []) as SessionRow[];
  const others = sessions.filter((s) => !s.is_current);

  if (sessions.length === 0) {
    return <p className="text-xs text-ink-muted">Not signed in anywhere.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col divide-y divide-[var(--color-border-hairline)]">
        {sessions.map((s) => {
          const device = s.user_agent ? describeDevice(s.user_agent) : "Unknown device";
          const Icon = /iPhone|Android|iPad/.test(device) ? Smartphone : Monitor;
          return (
            <li key={s.id} className="flex items-center gap-3 py-2">
              <Icon size={16} className="text-ink-muted shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate">
                  {device}
                  {s.is_current && (
                    <span className="ml-2 text-[10px] uppercase tracking-[0.1em] text-status-available">This device</span>
                  )}
                </p>
                <p className="text-[11px] text-ink-muted truncate">
                  Active {sinceShort(s.last_active)} · signed in {sinceShort(s.signed_in_at)}
                  {s.ip ? ` · ${s.ip}` : ""}
                  {!s.user_agent && " · signed in before devices were recorded"}
                </p>
              </div>
              {!s.is_current && (
                <form action={endSessions}>
                  <input type="hidden" name="user_id" value={userId} />
                  <input type="hidden" name="session_id" value={s.id} />
                  <input type="hidden" name="from" value={from} />
                  <ConfirmDeleteButton
                    confirmText={`Sign ${self ? "yourself" : name} out of ${device}?`}
                    label="Sign out"
                    busy="Signing out…"
                    className="text-xs text-ink-muted hover:text-negative transition-colors shrink-0"
                  />
                </form>
              )}
            </li>
          );
        })}
      </ul>

      {(self ? others.length > 0 : sessions.length > 1) && (
        <form action={endSessions}>
          <input type="hidden" name="user_id" value={userId} />
          <input type="hidden" name="from" value={from} />
          {self && <input type="hidden" name="keep_current" value="true" />}
          <ConfirmDeleteButton
            confirmText={
              self
                ? "Sign out of every other device? This one stays signed in."
                : `Sign ${name} out everywhere? They will have to sign in again; their password is unchanged.`
            }
            label={self ? "Sign out my other devices" : "Sign out everywhere"}
            busy="Signing out…"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-negative hover:underline"
          >
            <LogOut size={13} />
            {self ? "Sign out my other devices" : "Sign out everywhere"}
          </ConfirmDeleteButton>
        </form>
      )}
    </div>
  );
}
