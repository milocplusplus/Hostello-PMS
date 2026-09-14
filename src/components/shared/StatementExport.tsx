"use client";

import { useState } from "react";
import { Download } from "lucide-react";

/**
 * Saves the month's statement.
 *
 * The CSV is built on the server during the same render that drew the table —
 * the rows were already in memory, so this costs no query and no round trip,
 * and there is no route handler to add. All this does is turn a string the page
 * already holds into a file, the same way `PayoutReceipt` saves its PNG.
 *
 * Deliberately not an `<a download>` with a data: URI — Safari on iOS ignores
 * the filename on one and saves "unknown", which is no use to somebody filing
 * twelve of these.
 */
export function StatementExport({
  csv,
  filename,
  disabled,
}: {
  csv: string;
  filename: string;
  /** No stays in the month: the file would be a header and a zero row. */
  disabled?: boolean;
}) {
  const [saved, setSaved] = useState(false);

  function save() {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <button
      type="button"
      onClick={save}
      disabled={disabled}
      title={disabled ? "Nothing to export for this month" : undefined}
      className="btn btn-ghost btn-sm disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <Download size={13} />
      {saved ? "Saved" : "Export statement"}
    </button>
  );
}
