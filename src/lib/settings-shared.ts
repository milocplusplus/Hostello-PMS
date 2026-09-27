/**
 * The parts of the settings a browser component may import: types and plain
 * formatting. `settings.ts` holds the reads, which need the server.
 */

export type PaymentAccount =
  | { kind: "bank"; bank: string; title: string; number: string; iban: string }
  | { kind: "jazzcash" | "easypaisa"; title: string; number: string };

export const WALLET_LABEL = { jazzcash: "JazzCash", easypaisa: "Easypaisa" } as const;

/** The accounts as plain text — for a WhatsApp message. */
export function paymentDetailsText(accounts: PaymentAccount[]): string {
  return accounts
    .map((a) =>
      a.kind === "bank"
        ? [`${a.bank} — ${a.title}`, `Account: ${a.number}`, a.iban ? `IBAN: ${a.iban}` : null]
            .filter(Boolean)
            .join("\n")
        : `${WALLET_LABEL[a.kind]} — ${a.title}\nNumber: ${a.number}`
    )
    .join("\n\n");
}

/** The business line on a receipt or a statement: a name and one line of contact. */
export type BusinessContact = { name: string; line: string | null };
