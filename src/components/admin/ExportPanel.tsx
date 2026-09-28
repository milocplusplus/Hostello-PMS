"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { buildXlsx } from "@/lib/xlsx";
import type { ExportRequest } from "@/app/admin/stats/actions";
import { fieldInput, fieldLabel, errorBanner } from "@/lib/form-styles";

type Pick = { key: string; label: string; from: string; to: string };

/** This month, last month, this year, last year, everything — from `today`. */
function quickPicks(today: string): Pick[] {
  const [y, m] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  return [
    { key: "this-month", label: "This month", from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDay(y, m))}` },
    { key: "last-month", label: "Last month", from: `${prevY}-${pad(prevM)}-01`, to: `${prevY}-${pad(prevM)}-${pad(lastDay(prevY, prevM))}` },
    { key: "this-year", label: "This year", from: `${y}-01-01`, to: `${y}-12-31` },
    { key: "last-year", label: "Last year", from: `${y - 1}-01-01`, to: `${y - 1}-12-31` },
    { key: "all", label: "Everything", from: "2000-01-01", to: "2100-12-31" },
  ];
}

/**
 * The Excel export: bookings, payments, owner expenses, clients and units, one
 * sheet each. The Server Action gathers the rows; the file is built here.
 */
export function ExportPanel({
  today,
  clients,
  initialClient,
  action,
}: {
  today: string;
  clients: { id: string; name: string }[];
  initialClient: string;
  action: (req: ExportRequest) => Promise<{ ok: true; sheets: Parameters<typeof buildXlsx>[0]; filename: string } | { ok: false; error: string }>;
}) {
  const picks = quickPicks(today);
  const [pick, setPick] = useState("this-month");
  const [from, setFrom] = useState(picks[0].from);
  const [to, setTo] = useState(picks[0].to);
  const [client, setClient] = useState(initialClient);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function choose(key: string) {
    setPick(key);
    const p = picks.find((x) => x.key === key);
    if (p) {
      setFrom(p.from);
      setTo(p.to);
    }
  }

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const label = picks.find((p) => p.key === pick)?.label ?? `${from} to ${to}`;
      const res = await action({ from, to, clientId: client || null, label });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const url = URL.createObjectURL(buildXlsx(res.sheets));
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setError("The export failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-5 flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-bold">Export to Excel</h2>
        <p className="text-xs text-ink-muted mt-1">
          Bookings (by check-in), payments, owner expenses, clients and units — one sheet each. Guest
          names are included, phone numbers are not. Each export is recorded in the audit log.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Period">
        {picks.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => choose(p.key)}
            aria-pressed={pick === p.key}
            className={`text-xs rounded-lg border px-2.5 py-1.5 transition-colors ${
              pick === p.key
                ? "border-hostello-gold text-ink-primary bg-surface-2"
                : "border-border-hairline text-ink-secondary hover:border-border-strong"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <label className="flex flex-col gap-1.5 min-w-0">
          <span className={fieldLabel}>From</span>
          <input type="date" value={from} max={to} onChange={(e) => { setFrom(e.target.value); setPick("custom"); }} className={`${fieldInput} min-w-0`} />
        </label>
        <label className="flex flex-col gap-1.5 min-w-0">
          <span className={fieldLabel}>To</span>
          <input type="date" value={to} min={from} onChange={(e) => { setTo(e.target.value); setPick("custom"); }} className={`${fieldInput} min-w-0`} />
        </label>
        <label className="flex flex-col gap-1.5 min-w-0 col-span-2 sm:col-span-1">
          <span className={fieldLabel}>Client</span>
          <select value={client} onChange={(e) => setClient(e.target.value)} className={fieldInput}>
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className={errorBanner}>{error}</p>}

      <button type="button" onClick={download} disabled={busy || !from || !to} className="btn btn-gold self-start disabled:opacity-60">
        <Download size={16} />
        {busy ? "Preparing the file…" : "Download .xlsx"}
      </button>
    </section>
  );
}
