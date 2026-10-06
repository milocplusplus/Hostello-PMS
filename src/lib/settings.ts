import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { currentProfile } from "@/lib/auth";
import type { DealModel, OtaModel } from "@/lib/payout";
import { DEFAULT_SHORT_STAY } from "@/lib/short-stay";
import type { HouseStyle } from "@/lib/guest-messages";
import type { OwnerNoticeGroup, OwnerNotices } from "@/lib/owner-notices";
import { paymentDetailsText, type BusinessContact, type PaymentAccount } from "@/lib/settings-shared";

export { WALLET_LABEL, paymentDetailsText, type BusinessContact, type PaymentAccount } from "@/lib/settings-shared";

/**
 * Business settings — the one `app_settings` row the admin edits on
 * /admin/settings. Everyone reads it through `app_settings_v`, which blanks the
 * deal defaults for anyone but the admin and all but the contact line for a
 * signed-out visitor; a blank falls back to the built-in value here, so no
 * caller has to handle a missing setting.
 */

export type BookingStatusDefault = "confirmed" | "tentative";

export type AppSettings = {
  defaultDealModel: DealModel;
  defaultMonthlyFee: number;
  defaultSharePercent: number;
  defaultDeductPercent: number;
  defaultOtaModel: OtaModel;
  defaultOtaSharePercent: number;
  /** "14:00" — wall-clock, no seconds. */
  checkinTime: string;
  checkoutTime: string;
  shortStayStart: string;
  shortStayEnd: string;
  defaultBookingStatus: BookingStatusDefault;
  opsCanEditPrices: boolean;
  opsCanCancel: boolean;
  opsCanBlock: boolean;
  businessName: string;
  businessPhone: string | null;
  businessEmail: string | null;
  businessAddress: string | null;
  paymentAccounts: PaymentAccount[];
  guestTemplates: Partial<Record<"arrival" | "balance" | "checkout" | "review", string>>;
  /** Which owner notices go out by default. Admin-only in the view; all on otherwise. */
  ownerNotices: Record<OwnerNoticeGroup, boolean>;
  /** Where channel emails are forwarded. Null until the intake is live. */
  channelInboxAddress: string | null;
  /** The email Hostello's Airbnb / Booking.com account uses — what owners invite as co-host. */
  channelCohostEmail: string | null;
};

export const DEFAULT_SETTINGS: AppSettings = {
  defaultDealModel: "percent",
  defaultMonthlyFee: 0,
  defaultSharePercent: 20,
  defaultDeductPercent: 0,
  defaultOtaModel: "percent",
  defaultOtaSharePercent: 20,
  checkinTime: "14:00",
  checkoutTime: "12:00",
  shortStayStart: DEFAULT_SHORT_STAY.start,
  shortStayEnd: DEFAULT_SHORT_STAY.end,
  defaultBookingStatus: "confirmed",
  opsCanEditPrices: true,
  opsCanCancel: true,
  opsCanBlock: true,
  businessName: "Hostello",
  businessPhone: null,
  businessEmail: null,
  businessAddress: null,
  paymentAccounts: [],
  guestTemplates: {},
  ownerNotices: { bookings: true, calendar: true, payments: true, digest: true, reminder: true },
  channelInboxAddress: null,
  channelCohostEmail: null,
};

type Row = Record<string, unknown>;

const hm = (v: unknown, fallback: string) => (typeof v === "string" && v ? v.slice(0, 5) : fallback);
const num = (v: unknown, fallback: number) => (v === null || v === undefined ? fallback : Number(v));
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

function fromRow(r: Row | null): AppSettings {
  if (!r) return DEFAULT_SETTINGS;
  const d = DEFAULT_SETTINGS;
  return {
    defaultDealModel: (r.default_deal_model as DealModel) ?? d.defaultDealModel,
    defaultMonthlyFee: num(r.default_monthly_fee, d.defaultMonthlyFee),
    defaultSharePercent: num(r.default_share_percent, d.defaultSharePercent),
    defaultDeductPercent: num(r.default_deduct_percent, d.defaultDeductPercent),
    defaultOtaModel: (r.default_ota_model as OtaModel) ?? d.defaultOtaModel,
    defaultOtaSharePercent: num(r.default_ota_share_percent, d.defaultOtaSharePercent),
    checkinTime: hm(r.checkin_time, d.checkinTime),
    checkoutTime: hm(r.checkout_time, d.checkoutTime),
    shortStayStart: hm(r.short_stay_start, d.shortStayStart),
    shortStayEnd: hm(r.short_stay_end, d.shortStayEnd),
    defaultBookingStatus:
      r.default_booking_status === "tentative" ? "tentative" : d.defaultBookingStatus,
    opsCanEditPrices: bool(r.ops_can_edit_prices, d.opsCanEditPrices),
    opsCanCancel: bool(r.ops_can_cancel, d.opsCanCancel),
    opsCanBlock: bool(r.ops_can_block, d.opsCanBlock),
    businessName: text(r.business_name) ?? d.businessName,
    businessPhone: text(r.business_phone),
    businessEmail: text(r.business_email),
    businessAddress: text(r.business_address),
    paymentAccounts: Array.isArray(r.payment_accounts) ? (r.payment_accounts as PaymentAccount[]) : [],
    guestTemplates:
      r.guest_templates && typeof r.guest_templates === "object"
        ? (r.guest_templates as AppSettings["guestTemplates"])
        : {},
    ownerNotices: { ...d.ownerNotices, ...((r.owner_notices as OwnerNotices | null) ?? {}) },
    channelInboxAddress: text(r.channel_inbox_address),
    channelCohostEmail: text(r.channel_cohost_email),
  };
}

/** For a Server Component: one read per request, shared by layout and page. */
export const loadSettings = cache(async (): Promise<AppSettings> => {
  const supabase = await createClient();
  return readSettings(supabase);
});

/** For a Server Action, which has its own client already. */
export async function readSettings(supabase: SupabaseClient): Promise<AppSettings> {
  const { data } = await supabase.from("app_settings_v").select("*").maybeSingle();
  return fromRow(data as Row | null);
}

/** What `BookingForm` pre-fills a new booking with. */
export type BookingDefaults = {
  status: BookingStatusDefault;
  checkinTime: string;
  checkoutTime: string;
  shortStayStart: string;
  shortStayEnd: string;
};

export function bookingDefaults(s: AppSettings): BookingDefaults {
  return {
    status: s.defaultBookingStatus,
    checkinTime: s.checkinTime,
    checkoutTime: s.checkoutTime,
    shortStayStart: s.shortStayStart,
    shortStayEnd: s.shortStayEnd,
  };
}

/** What the settings put into every guest message. */
export function houseStyle(s: AppSettings): HouseStyle {
  return {
    templates: s.guestTemplates,
    checkinTime: s.checkinTime,
    checkoutTime: s.checkoutTime,
    paymentDetails: paymentDetailsText(s.paymentAccounts),
    businessName: s.businessName,
    businessPhone: s.businessPhone,
  };
}

/**
 * Whether the signed-in staff member may do this: the admin always, ops as
 * Settings allows. For hiding a control — the database (`ops_allowed()`) and
 * `updateBooking` are what actually refuse.
 */
export async function staffMay(rule: "cancel" | "block" | "prices"): Promise<boolean> {
  const [profile, s] = await Promise.all([currentProfile(), loadSettings()]);
  if (profile?.role !== "ops") return true;
  return rule === "cancel" ? s.opsCanCancel : rule === "block" ? s.opsCanBlock : s.opsCanEditPrices;
}

export function businessContact(s: AppSettings): BusinessContact {
  const line = [s.businessPhone, s.businessEmail, s.businessAddress].filter(Boolean).join(" · ");
  return { name: s.businessName, line: line || null };
}
