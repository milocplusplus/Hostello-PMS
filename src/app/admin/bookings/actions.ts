"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { calculatePayout, type DealModel, type OtaModel } from "@/lib/payout";
import {
  attachReceipt,
  receiptFile,
  receiptKind,
  validateReceipt,
  RECEIPT_BUCKET,
} from "@/lib/receipts";
import {
  attachGuestIds,
  guestIdFiles,
  validateGuestIds,
  GUEST_ID_BUCKET,
} from "@/lib/guest-ids";
import {
  notifyBookingCreated,
  notifyBookingCancelled,
  notifyBookingUpdated,
  notifyPaymentReceived,
  notifyStayProgress,
  notifyPayoutSettled,
} from "@/lib/notify";
import { findStayClash } from "@/lib/availability";
import { requireOwner } from "@/lib/auth";
import { payoutReader } from "@/lib/payout-inputs";
import { readShortStay, rowShortStay, shortStayCheckOut } from "@/lib/short-stay";
import { describeBookingChanges } from "@/lib/booking-changes";

type SaveResult = { error: string } | { clientId: string; bookingId: string };

/**
 * The one place a booking gets written. Returns instead of redirecting so both
 * the full page and the calendar's quick-add modal can use it.
 */
async function saveBooking(formData: FormData): Promise<SaveResult> {
  const client_id = formData.get("client_id") as string;
  const property_ids = formData.getAll("property_ids") as string[];
  const check_in = formData.get("check_in") as string;
  const guest_name = (formData.get("guest_name") as string)?.trim() || null;
  const guest_phone = (formData.get("guest_phone") as string)?.trim() || null;
  const source = (formData.get("source") as string) || "other";
  const status = (formData.get("status") as string) || "confirmed";
  const sale_price = Number(formData.get("sale_price")) || 0;
  const advance_received = Number(formData.get("advance_received")) || 0;
  const notes = (formData.get("notes") as string)?.trim() || null;
  // Only ever set by the channel inbox: the OTA's own confirmation code, which
  // is how a later cancellation email finds this row again.
  const ota_ref = (formData.get("ota_ref") as string)?.trim() || null;

  const { shortStay, error: shortStayError } = readShortStay(formData);
  if (shortStayError) return { error: shortStayError };

  // A short stay is one date, stored as the night it sits on.
  const check_out = shortStay ? shortStayCheckOut(check_in) : (formData.get("check_out") as string);

  if (property_ids.length === 0) {
    return { error: "Select at least one unit." };
  }

  if (!check_in || !check_out || check_out <= check_in) {
    return { error: "Check-out must be after check-in." };
  }

  // Check the attachment before anything is written — once the booking exists,
  // rejecting the form would only invite a duplicate.
  const receipt = receiptFile(formData);
  const receiptProblem = receipt ? validateReceipt(receipt) : null;
  if (receiptProblem) return { error: receiptProblem };

  const guestIds = guestIdFiles(formData);
  const guestIdProblem = validateGuestIds(guestIds);
  if (guestIdProblem) return { error: guestIdProblem };

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Never trust client-submitted split numbers — recompute authoritatively
  // from the client's current deal terms and the selected properties' stack rates.
  // An ops session may not read either, so the lookup goes through the server's
  // own credentials; the math below is unchanged.
  const reader = await payoutReader(supabase);
  if (!reader.ok) return { error: reader.error };

  const { data: clientRecord } = await reader.client
    .from("clients")
    .select("deal_model, share_percent, deduct_percent, ota_model, ota_share_percent")
    .eq("id", client_id)
    .single();

  if (!clientRecord) {
    return { error: "Client not found." };
  }

  const { data: properties } = await reader.client
    .from("properties")
    .select("id, name, stack_rate, short_stay_stack_rate")
    .in("id", property_ids);

  // Hours are charged against the unit's short-stay rate — flat for the stay,
  // which is exactly `rate × 1 night` once the stay is stored as one night.
  const stackRateTotal = (properties ?? []).reduce(
    (sum, p) => sum + Number((shortStay ? p.short_stay_stack_rate : p.stack_rate) ?? 0),
    0
  );

  // Bookings *and* blocks — see `findStayClash`. Blocked nights used to pass
  // straight through here.
  const clash = await findStayClash(supabase, {
    propertyIds: property_ids,
    checkIn: check_in,
    checkOut: check_out,
  });
  if (clash) return { error: clash };

  const payout = calculatePayout({
    salePrice: sale_price,
    checkIn: check_in,
    checkOut: check_out,
    dealModel: clientRecord.deal_model as DealModel,
    sharePercent: Number(clientRecord.share_percent),
    deductPercent: Number(clientRecord.deduct_percent),
    otaModel: clientRecord.ota_model as OtaModel,
    otaSharePercent: Number(clientRecord.ota_share_percent),
    stackRate: stackRateTotal,
    source,
    status: status as "confirmed" | "tentative" | "cancelled",
  });

  // The id is minted here rather than read back: an ops session can write a
  // booking but cannot SELECT the table, so `.select()` on the insert would
  // return nothing for them.
  const bookingId = randomUUID();

  const { error } = await supabase
    .from("bookings")
    .insert({
      id: bookingId,
      client_id,
      guest_name,
      guest_phone,
      check_in,
      check_out,
      is_short_stay: Boolean(shortStay),
      short_stay_start: shortStay?.start ?? null,
      short_stay_end: shortStay?.end ?? null,
      source,
      status,
      sale_price,
      advance_received,
      deal_model_snapshot: clientRecord.deal_model,
      share_percent_snapshot: clientRecord.share_percent,
      deduct_percent_snapshot: clientRecord.deduct_percent,
      ota_model_snapshot: clientRecord.ota_model,
      ota_share_percent_snapshot: clientRecord.ota_share_percent,
      stack_rate_snapshot: stackRateTotal,
      net_sale: payout.netSale,
      hostello_share: payout.hostelloShare,
      client_payout: payout.clientPayout,
      notes,
      ota_ref,
      entered_by: user?.id ?? null,
    });

  if (error) {
    return { error: error.message };
  }

  const linkRows = property_ids.map((property_id) => ({
    booking_id: bookingId,
    property_id,
  }));
  await supabase.from("booking_properties").insert(linkRows);

  // Best-effort, like the notification below: the booking is already real, and
  // a receipt can always be attached again from the booking page.
  if (receipt) {
    await attachReceipt(supabase, {
      bookingId: bookingId,
      file: receipt,
      kind: receiptKind(formData),
      amount: advance_received,
      uploadedBy: user?.id ?? null,
    });
  }

  await attachGuestIds(supabase, {
    bookingId: bookingId,
    files: guestIds,
    uploadedBy: user?.id ?? null,
  });

  await notifyBookingCreated(supabase, {
    clientId: client_id,
    bookingId: bookingId,
    unitNames: (properties ?? []).map((p) => p.name),
    checkIn: check_in,
    checkOut: check_out,
    source,
    shortStay,
    isTentative: status === "tentative",
  });

  revalidatePath("/admin/bookings");
  revalidatePath("/admin/bookings/[id]", "page");
  revalidatePath("/admin/calendar");
  revalidatePath(`/admin/clients/${client_id}`);
  revalidatePath("/client", "layout");

  return { clientId: client_id, bookingId: bookingId };
}

export async function createBooking(formData: FormData) {
  const result = await saveBooking(formData);

  if ("error" in result) {
    redirect(`/admin/bookings/new?error=${encodeURIComponent(result.error)}`);
  }

  redirect(`/admin/clients/${result.clientId}`);
}

/**
 * Same write, but for callers that stay on the page: the calendar's quick-add
 * modal, and the channel inbox approving a reservation an OTA emailed in.
 *
 * The ids come back because the inbox has to record which booking its message
 * became; the modal ignores them.
 */
export async function createBookingInline(formData: FormData) {
  const result = await saveBooking(formData);
  return "error" in result
    ? { error: result.error, bookingId: null, clientId: null }
    : { error: null, bookingId: result.bookingId, clientId: result.clientId };
}

/**
 * Edit an existing booking.
 *
 * The split is recomputed from the booking's **own snapshots**, not the
 * client's current terms — correcting a phone number must never silently
 * re-price a stay that was agreed months ago. The stack rate is the one term
 * that does move, because it belongs to the units and the units can change.
 */
export async function updateBooking(id: string, formData: FormData) {
  // Annotated on the const, not just the arrow: that is what lets TypeScript
  // treat a `back(...)` call as terminating and narrow what follows it.
  const back: (message: string) => never = (message) =>
    redirect(`/admin/bookings/${id}/edit?error=${encodeURIComponent(message)}`);

  const property_ids = formData.getAll("property_ids") as string[];
  const check_in = formData.get("check_in") as string;
  const guest_name = (formData.get("guest_name") as string)?.trim() || null;
  const guest_phone = (formData.get("guest_phone") as string)?.trim() || null;
  const source = (formData.get("source") as string) || "other";
  const status = (formData.get("status") as string) || "confirmed";
  const sale_price = Number(formData.get("sale_price")) || 0;
  const advance_received = Number(formData.get("advance_received")) || 0;
  const notes = (formData.get("notes") as string)?.trim() || null;

  const { shortStay, error: shortStayError } = readShortStay(formData);
  if (shortStayError) back(shortStayError);

  const check_out = shortStay ? shortStayCheckOut(check_in) : (formData.get("check_out") as string);

  if (property_ids.length === 0) back("Select at least one unit.");
  if (!check_in || !check_out || check_out <= check_in) back("Check-out must be after check-in.");

  // The edit form carries the same ID-card field as the new-booking form, so a
  // save can bring more scans with it.
  const guestIds = guestIdFiles(formData);
  const guestIdProblem = validateGuestIds(guestIds);
  if (guestIdProblem) back(guestIdProblem);

  const supabase = await createClient();

  // The snapshots are payout inputs, so this read goes through the same trusted
  // route as the terms — an ops session sees them masked everywhere else.
  const reader = await payoutReader(supabase);
  if (!reader.ok) back(reader.error);

  const { data: existing } = await reader.client
    .from("bookings_v")
    .select(
      "client_id, check_in, check_out, sale_price, status, guest_name, is_short_stay, short_stay_start, short_stay_end, deal_model_snapshot, share_percent_snapshot, deduct_percent_snapshot, ota_model_snapshot, ota_share_percent_snapshot, booking_properties(property_id)"
    )
    .eq("id", id)
    .single();

  if (!existing) back("Booking not found.");
  if (existing.status === "cancelled") {
    back("This booking is cancelled. Create a new one instead of editing it.");
  }

  const clash = await findStayClash(supabase, {
    propertyIds: property_ids,
    checkIn: check_in,
    checkOut: check_out,
    excludeBookingId: id,
  });
  if (clash) back(clash);

  const { data: properties } = await reader.client
    .from("properties")
    .select("id, name, stack_rate, short_stay_stack_rate, client_id")
    .in("id", property_ids);

  if ((properties ?? []).some((p) => p.client_id !== existing.client_id)) {
    back("All units in one booking must belong to the same client.");
  }

  const stackRateTotal = (properties ?? []).reduce(
    (sum, p) => sum + Number((shortStay ? p.short_stay_stack_rate : p.stack_rate) ?? 0),
    0
  );

  const payout = calculatePayout({
    salePrice: sale_price,
    checkIn: check_in,
    checkOut: check_out,
    dealModel: existing.deal_model_snapshot as DealModel,
    sharePercent: Number(existing.share_percent_snapshot ?? 0),
    deductPercent: Number(existing.deduct_percent_snapshot ?? 0),
    // Bookings written before the OTA migration have no snapshot by design.
    otaModel: (existing.ota_model_snapshot ?? "none") as OtaModel,
    otaSharePercent: Number(existing.ota_share_percent_snapshot ?? 0),
    stackRate: stackRateTotal,
    source,
    status: status as "confirmed" | "tentative" | "cancelled",
  });

  const updatedAt = new Date().toISOString();

  const { error } = await supabase
    .from("bookings")
    .update({
      guest_name,
      guest_phone,
      check_in,
      check_out,
      is_short_stay: Boolean(shortStay),
      short_stay_start: shortStay?.start ?? null,
      short_stay_end: shortStay?.end ?? null,
      source,
      status,
      sale_price,
      advance_received,
      stack_rate_snapshot: stackRateTotal,
      net_sale: payout.netSale,
      hostello_share: payout.hostelloShare,
      client_payout: payout.clientPayout,
      notes,
      updated_at: updatedAt,
    })
    .eq("id", id);

  if (error) back(error.message);

  const previousIds = (existing.booking_properties as unknown as { property_id: string }[]).map(
    (bp) => bp.property_id
  );

  if (!previousIds.every((p) => property_ids.includes(p)) || previousIds.length !== property_ids.length) {
    await supabase.from("booking_properties").delete().eq("booking_id", id);
    await supabase
      .from("booking_properties")
      .insert(property_ids.map((property_id) => ({ booking_id: id, property_id })));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  await attachGuestIds(supabase, { bookingId: id, files: guestIds, uploadedBy: user?.id ?? null });

  const changed = describeBookingChanges(
    {
      checkIn: existing.check_in,
      checkOut: existing.check_out,
      salePrice: Number(existing.sale_price ?? 0),
      status: existing.status,
      guestName: existing.guest_name,
      propertyIds: previousIds,
      shortStay: rowShortStay(existing),
    },
    {
      checkIn: check_in,
      checkOut: check_out,
      salePrice: sale_price,
      status,
      guestName: guest_name,
      propertyIds: property_ids,
      shortStay,
    }
  );

  // A save that moved nothing is not news.
  if (changed) {
    await notifyBookingUpdated(supabase, {
      clientId: existing.client_id,
      bookingId: id,
      unitNames: (properties ?? []).map((p) => p.name),
      checkIn: check_in,
      checkOut: check_out,
      source,
      shortStay,
      changed,
      updatedAt,
    });
  }

  revalidatePath("/admin/bookings");
  revalidatePath("/admin/bookings/[id]", "page");
  revalidatePath("/admin/calendar");
  revalidatePath(`/admin/clients/${existing.client_id}`);
  revalidatePath("/client", "layout");

  redirect(`/admin/bookings/${id}`);
}

export async function uploadBookingReceipt(formData: FormData) {
  const bookingId = formData.get("booking_id") as string;
  const file = receiptFile(formData);

  if (!file) {
    redirect(`/admin/bookings/${bookingId}?receipt_error=${encodeURIComponent("Choose a file first.")}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const kind = receiptKind(formData);
  const amount = Number(formData.get("receipt_amount")) || null;

  const { error, receiptId } = await attachReceipt(supabase, {
    bookingId,
    file,
    kind,
    amount,
    uploadedBy: user?.id ?? null,
  });

  if (error) {
    redirect(`/admin/bookings/${bookingId}?receipt_error=${encodeURIComponent(error)}`);
  }

  // Proof that money moved is the one booking change the owner most wants told.
  if (receiptId) {
    const { data: booking } = await supabase
      .from("bookings_v")
      .select("client_id, guest_name")
      .eq("id", bookingId)
      .single();

    if (booking) {
      await notifyPaymentReceived(supabase, {
        clientId: booking.client_id,
        bookingId,
        receiptId,
        kind,
        amount,
        guestName: booking.guest_name,
      });
    }
  }

  revalidatePath("/admin/bookings/[id]", "page");
  revalidatePath("/client/bookings/[id]", "page");
  revalidatePath("/client", "layout");
  redirect(`/admin/bookings/${bookingId}`);
}

export async function deleteBookingReceipt(formData: FormData) {
  const id = formData.get("id") as string;
  const bookingId = formData.get("booking_id") as string;

  const supabase = await createClient();

  const { data: receipt } = await supabase
    .from("booking_receipts")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("booking_receipts").delete().eq("id", id);
  if (error) return;

  if (receipt?.storage_path) {
    await supabase.storage.from(RECEIPT_BUCKET).remove([receipt.storage_path]);
  }

  revalidatePath("/admin/bookings/[id]", "page");
  revalidatePath("/client/bookings/[id]", "page");
  redirect(`/admin/bookings/${bookingId}`);
}

export async function uploadGuestIds(formData: FormData) {
  const bookingId = formData.get("booking_id") as string;
  const files = guestIdFiles(formData);

  if (files.length === 0) {
    redirect(`/admin/bookings/${bookingId}?id_error=${encodeURIComponent("Choose a file first.")}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await attachGuestIds(supabase, {
    bookingId,
    files,
    uploadedBy: user?.id ?? null,
  });

  if (error) {
    redirect(`/admin/bookings/${bookingId}?id_error=${encodeURIComponent(error)}`);
  }

  revalidatePath("/admin/bookings/[id]", "page");
  revalidatePath("/client/bookings/[id]", "page");
  redirect(`/admin/bookings/${bookingId}`);
}

export async function deleteGuestId(formData: FormData) {
  const id = formData.get("id") as string;
  const bookingId = formData.get("booking_id") as string;

  const supabase = await createClient();

  const { data: card } = await supabase
    .from("booking_guest_ids")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("booking_guest_ids").delete().eq("id", id);
  if (error) return;

  if (card?.storage_path) {
    await supabase.storage.from(GUEST_ID_BUCKET).remove([card.storage_path]);
  }

  revalidatePath("/admin/bookings/[id]", "page");
  revalidatePath("/client/bookings/[id]", "page");
  redirect(`/admin/bookings/${bookingId}`);
}

export async function markBookingSettled(formData: FormData) {
  // The owner-owes-the-owner direction: ops never sees it and cannot set it.
  await requireOwner();
  const id = formData.get("id") as string;
  const settled = formData.get("settled") === "true";

  const supabase = await createClient();
  const { error } = await supabase
    .from("bookings")
    .update({
      settled,
      settled_date: settled ? new Date().toISOString().slice(0, 10) : null,
    })
    .eq("id", id);

  if (error) return;

  // Only notify on settle, not on un-settle (that's a correction, not news).
  if (settled) {
    const { data: booking } = await supabase
      .from("bookings_v")
      .select("client_id, client_payout, booking_properties(properties(name))")
      .eq("id", id)
      .single();

    if (booking) {
      await notifyPayoutSettled(supabase, {
        clientId: booking.client_id,
        bookingId: id,
        unitNames: (booking.booking_properties as unknown as { properties: { name: string } | null }[])
          ?.map((bp) => bp.properties?.name ?? "")
          .filter(Boolean) ?? [],
        clientPayout: Number(booking.client_payout ?? 0),
      });
    }
  }

  revalidatePath("/admin/bookings");
  revalidatePath("/admin/bookings/[id]", "page");
  revalidatePath("/client", "layout");
}

/**
 * Tick an arrival or a departure off the day sheet. Both directions toggle, so
 * a mis-tap is undone the same way it was made.
 */
export async function markStayProgress(formData: FormData) {
  const id = formData.get("id") as string;
  const step = formData.get("step") === "out" ? "checked_out_at" : "checked_in_at";
  const done = formData.get("done") === "true";

  const supabase = await createClient();
  const { error } = await supabase
    .from("bookings")
    .update({ [step]: done ? new Date().toISOString() : null })
    .eq("id", id);

  if (error) return;

  // Only the doing is news; un-ticking is a correction.
  if (done) {
    const { data: booking } = await supabase
      .from("bookings_v")
      .select("client_id, guest_name, booking_properties(properties:properties_v(name))")
      .eq("id", id)
      .single();

    if (booking) {
      await notifyStayProgress(supabase, {
        clientId: booking.client_id,
        bookingId: id,
        step: step === "checked_out_at" ? "out" : "in",
        guestName: booking.guest_name,
        unitNames:
          (booking.booking_properties as unknown as { properties: { name: string } | null }[])
            ?.map((bp) => bp.properties?.name ?? "")
            .filter(Boolean) ?? [],
      });
    }
  }

  revalidatePath("/admin/today");
  revalidatePath("/admin/checkins");
  revalidatePath("/admin/bookings/[id]", "page");
  revalidatePath("/client", "layout");
}

export async function cancelBooking(formData: FormData) {
  const id = formData.get("id") as string;

  const supabase = await createClient();

  // Read details before cancelling so the notification can describe what changed.
  const { data: booking } = await supabase
    .from("bookings_v")
    .select("client_id, check_in, check_out, source, is_short_stay, short_stay_start, short_stay_end, booking_properties(properties:properties_v(name))")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("bookings").update({ status: "cancelled" }).eq("id", id);

  if (error) return;

  if (booking) {
    await notifyBookingCancelled(supabase, {
      clientId: booking.client_id,
      bookingId: id,
      unitNames: (booking.booking_properties as unknown as { properties: { name: string } | null }[])
        ?.map((bp) => bp.properties?.name ?? "")
        .filter(Boolean) ?? [],
      checkIn: booking.check_in,
      checkOut: booking.check_out,
      source: booking.source,
      shortStay: rowShortStay(booking),
    });
  }

  revalidatePath("/admin/bookings");
  revalidatePath("/admin/bookings/[id]", "page");
  revalidatePath("/admin/calendar");
  revalidatePath("/client/bookings");
  revalidatePath("/client/calendar");
  revalidatePath("/client", "layout");
}
