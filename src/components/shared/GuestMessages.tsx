"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import {
  messagesFor,
  waLink,
  waPhone,
  type GuestMessageContext,
  type GuestMessageId,
} from "@/lib/guest-messages";

/**
 * The three messages a guest gets every stay, ready to send.
 *
 * A client component because the text is editable before it goes: a template
 * that cannot be adjusted is a template nobody trusts, and the edit has to
 * reach the link's `?text=` without a round trip.
 *
 * It sends nothing. The button opens WhatsApp with the message typed, and the
 * wording here never claims more than that — there is no delivery receipt to
 * report and no row written when it is pressed.
 */
export function GuestMessages({ phone, context }: { phone: string | null; context: GuestMessageContext }) {
  const options = messagesFor(context);
  const [picked, setPicked] = useState<GuestMessageId>(options[0]?.id ?? "arrival");
  const [text, setText] = useState(() => options[0]?.body(context) ?? "");

  const number = waPhone(phone);

  function pick(id: GuestMessageId) {
    const next = options.find((m) => m.id === id);
    if (!next) return;
    setPicked(id);
    // Switching template replaces the draft — the picker is the edit, not a merge.
    setText(next.body(context));
  }

  const active = options.find((m) => m.id === picked);

  return (
    <div className="card p-5 flex flex-col gap-3">
      <div>
        <h2 className="eyebrow flex items-center gap-2">
          <MessageCircle size={13} className="text-ink-muted" />
          Message the guest
        </h2>
        <p className="text-[11px] text-ink-muted mt-1.5">
          {number
            ? "Pick one, edit anything, then open it in WhatsApp."
            : "No dialable number is stored for this guest, so there is nothing to open."}
        </p>
      </div>

      {number && (
        <>
          <div className="flex flex-wrap gap-2">
            {options.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => pick(m.id)}
                aria-pressed={m.id === picked}
                title={m.hint}
                className={`text-xs rounded-md border px-3 py-1.5 transition-colors ${
                  m.id === picked
                    ? "border-hostello-gold text-ink-primary bg-surface-2"
                    : "border-border-hairline text-ink-secondary hover:border-border-strong"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {active && <p className="text-[11px] text-ink-muted -mt-1">{active.hint}</p>}

          <label htmlFor="guest-message" className="sr-only">
            Message to send
          </label>
          <textarea
            id="guest-message"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            className="field text-xs leading-relaxed resize-y"
          />

          <div className="flex items-center gap-3 flex-wrap">
            <a
              href={waLink(number, text)}
              target="_blank"
              rel="noreferrer"
              className="btn btn-gold btn-sm"
            >
              Open in WhatsApp
            </a>
            <span className="text-[11px] text-ink-muted">
              Opens the chat with this text ready — it does not send it.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
