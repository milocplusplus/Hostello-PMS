"use client";

import { Download } from "lucide-react";

/**
 * A ready-made Gmail filter: "from Airbnb, forward to Hostello". Gmail's Settings →
 * Filters → Import filters reads this file, so the host does not have to build the
 * filter by hand. It forwards nothing but Airbnb mail, and only works once Gmail
 * has accepted the forwarding address (step 1), which is why the page orders them.
 *
 * Built in the browser from the address the page already holds: no download route.
 */
function filterXml(address: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&apos;").replace(/</g, "&lt;");
  return [
    "<?xml version='1.0' encoding='UTF-8'?>",
    "<feed xmlns='http://www.w3.org/2005/Atom' xmlns:apps='http://schemas.google.com/apps/2006'>",
    "<title>Mail Filters</title>",
    "<entry>",
    "<category term='filter'></category>",
    "<title>Mail Filter</title>",
    "<content></content>",
    "<apps:property name='from' value='airbnb.com'/>",
    `<apps:property name='forwardTo' value='${esc(address)}'/>`,
    "</entry>",
    "</feed>",
  ].join("\n");
}

export function GmailFilterDownload({ address }: { address: string }) {
  function download() {
    const url = URL.createObjectURL(new Blob([filterXml(address)], { type: "application/xml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "hostello-airbnb-filter.xml";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button type="button" onClick={download} className="btn btn-gold self-start">
      <Download size={15} />
      Download the Gmail filter
    </button>
  );
}
