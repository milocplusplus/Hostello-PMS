"use client";

import { useState } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import { SubmitButton } from "@/components/shared/Busy";

/** Top-bar avatar + sign-out. Shared by both shells. */
export function UserMenu({
  userName,
  roleLabel,
  logoutAction,
}: {
  userName: string;
  roleLabel: string;
  logoutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 pl-1 pr-2 py-1 rounded-full hover:bg-surface-2 transition-colors"
      >
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium text-white shrink-0 gradient-brand">
          {userName.slice(0, 1).toUpperCase()}
        </div>
        <div className="hidden sm:flex flex-col items-start leading-none min-w-0">
          <span className="text-sm text-ink-primary truncate max-w-[10rem]">{userName}</span>
          <span className="text-[10px] text-ink-muted mt-0.5">{roleLabel}</span>
        </div>
        <ChevronDown size={14} className="text-ink-muted hidden sm:block" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-44 card p-1.5 z-50 animate-in">
            <form action={logoutAction}>
              <SubmitButton
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-ink-secondary hover:text-ink-primary hover:bg-surface-2 transition-colors"
                blocking
                busy="Signing you out…"
                note="Closing your session."
              >
                <LogOut size={14} />
                Sign out
              </SubmitButton>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
