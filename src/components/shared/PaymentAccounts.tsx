"use client";

import { useState } from "react";
import { Check, Copy, Landmark, Smartphone } from "lucide-react";
import { WALLET_LABEL, type PaymentAccount } from "@/lib/settings-shared";

/**
 * Where to send Hostello's money — the accounts saved in Settings, each number
 * one tap from the clipboard, because on a phone it gets typed into a banking
 * app next.
 */
export function PaymentAccounts({ accounts }: { accounts: PaymentAccount[] }) {
  if (accounts.length === 0) return null;

  return (
    <section className="card p-4 flex flex-col gap-3">
      <h2 className="text-sm font-bold">Send to</h2>
      <ul className="flex flex-col gap-3">
        {accounts.map((a, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="grid place-items-center w-9 h-9 rounded-xl bg-surface-2 shrink-0 mt-0.5">
              {a.kind === "bank" ? <Landmark size={16} /> : <Smartphone size={16} />}
            </span>
            <div className="min-w-0 flex-1 flex flex-col gap-1">
              <p className="text-sm font-bold truncate">
                {a.kind === "bank" ? a.bank : WALLET_LABEL[a.kind]}
                <span className="text-ink-muted font-normal"> · {a.title}</span>
              </p>
              <CopyLine label={a.kind === "bank" ? "Account" : "Number"} value={a.number} />
              {a.kind === "bank" && a.iban && <CopyLine label="IBAN" value={a.iban} />}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CopyLine({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          },
          () => undefined
        );
      }}
      className="flex items-center gap-2 text-left text-xs rounded-lg bg-surface-2 hover:bg-surface-3 px-2.5 py-1.5 transition-colors min-w-0"
      aria-label={`Copy ${label.toLowerCase()} ${value}`}
    >
      <span className="text-ink-muted shrink-0">{label}</span>
      <span className="font-mono text-ink-primary truncate flex-1">{value}</span>
      {copied ? (
        <Check size={14} className="text-status-available shrink-0" />
      ) : (
        <Copy size={14} className="text-ink-muted shrink-0" />
      )}
    </button>
  );
}
