"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { buildXlsx, type Sheet } from "@/lib/xlsx";
import { errorBanner } from "@/lib/form-styles";

/** Builds the file in the browser from the rows the Server Action returns; nothing is stored. */
export function HostExport({
  action,
}: {
  action: () => Promise<{ ok: true; sheets: Sheet[]; filename: string } | { ok: false; error: string }>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const res = await action();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const url = URL.createObjectURL(buildXlsx(res.sheets));
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not prepare the file. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={download} disabled={busy} className="btn btn-gold self-start disabled:opacity-60">
        <Download size={15} />
        {busy ? "Preparing the file…" : "Download my data (.xlsx)"}
      </button>
      {error && <p className={errorBanner}>{error}</p>}
    </div>
  );
}
