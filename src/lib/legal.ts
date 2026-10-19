/**
 * Who the public pages speak for. One place, so the landing page footer, the terms
 * and the privacy policy cannot disagree about the name, the address or the law.
 */
export const LEGAL = {
  name: "Hostello LLP",
  brand: "Hostello",
  email: "info@hostello.pro",
  phone: "+92 326 9872909",
  /** For wa.me links: digits only, with the country code. */
  whatsapp: "923269872909",
  law: "Pakistan",
  court: "Islamabad",
  updated: "19 October 2026",
  /**
   * True once a lawyer has read the terms and the privacy policy. While false, both
   * pages say plainly that they are a draft; flip it when the review is done.
   */
  reviewed: false,
};
