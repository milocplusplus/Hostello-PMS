"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { calculatePayout, type DealModel, type OtaModel } from "@/lib/payout";
import {
  notifyBookingCancelled,
  notifyBookingCreated,
  notifyBookingUpdated,
  notifyStayProgress,
} from "@/lib/notify";
import { findStayClash } from "@/lib/availability";
import {
  attachGuestIds,
  guestIdFiles,
  validateGuestIds,
  GUEST_ID_BUCKET,
} from "@/lib/guest-ids";
import { describeBookingChanges } from "@/lib/booking-changes";
import { readShortStay, rowShortStay, shortStayCheckOut } from "@/lib/short-stay";

type SaveResult = { error: string } | { bookingId: string };

/**
 * The one place a client-side booking gets written. Returns instead of
 * redirecting so both the full page and the calendar's quick-add modal use it.
 */
async function saveClientBooking(formData: FormData): Promise<SaveResult> {
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

  // Check the attachments before anything is written — once the booking exists,
  // rejecting the form would only invite a duplicate.
  const guestIds = guestIdFiles(formData);
  const guestIdProblem = validateGuestIds(guestIds);
  if (guestIdProblem) return { error: guestIdProblem };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Verify this is really the caller's own client account.
  const { data: ownClient } = await supabase
    .from("clients")
    .select("id, deal_model, share_percent, deduct_percent, ota_model, ota_share_percent")
    .eq("owner_user_id", user?.id ?? "")
    .single();

  if (!ownClient || ownClient.id !== client_id) {
    return { error: "You can only add bookings for your own properties." };
  }

  const { data: properties } = await supabase
    .from("properties")
    .select("id, name, stack_rate, short_stay_stack_rate, client_id")
    .in("id", property_ids);

  if ((properties ?? []).some((p) => p.client_id !== client_id)) {
    return { error: "All units in one booking must be your own properties." };
  }

  const stackRateTotal = (properties ?? []).reduce(
    (sum, p) => sum + Number((shortStay ? p.short_stay_stack_rate : p.stack_rate) ?? 0),
    0
  );

  // Bookings *and* blocks — see `findStayClash`. An owner blocking their own
  // house and then booking over it was the case this used to miss.
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
    dealModel: ownClient.deal_model as DealModel,
    sharePercent: Number(ownClient.share_percent),
    deductPercent: Number(ownClient.deduct_percent),
    otaModel: ownClient.ota_model as OtaModel,
    otaSharePercent: Number(ownClient.ota_share_percent),
    stackRate: stackRateTotal,
    source,
    status: status as "confirmed" | "tentative" | "cancelled",
  });

  const { data: newBooking, error } = await supabase
    .from("bookings")
    .insert({
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
      deal_model_snapshot: ownClient.deal_model,
      share_percent_snapshot: ownClient.share_percent,
      deduct_percent_snapshot: ownClient.deduct_percent,
      ota_model_snapshot: ownClient.ota_model,
      ota_share_percent_snapshot: ownClient.ota_share_percent,
      stack_rate_snapshot: stackRateTotal,
      net_sale: payout.netSale,
      hostello_share: payout.hostelloShare,
      client_payout: payout.clientPayout,
      notes,
      entered_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !newBooking) {
    return { error: error?.message ?? "Could not save booking." };
  }

  const linkRows = property_ids.map((property_id) => ({
    booking_id: newBooking!.id,
    property_id,
  }));
  await supabase.from("booking_properties").insert(linkRows);

  await attachGuestIds(supabase, {
    bookingId: newBooking.id,
    files: guestIds,
    uploadedBy: user?.id ?? null,
  });

  // The owner entered this one, so the fan-out sends it to the admins and not
  // back to them.
  await notifyBookingCreated(supabase, {
    clientId: client_id,
    bookingId: newBooking.id,
    unitNames: (properties ?? []).map((p) => p.name),
    checkIn: check_in,
    checkOut: check_out,
    source,
    shortStay,
    isTentative: status === "tentative",
  });

  revalidatePath("/client/bookings");
  revalidatePath("/client/bookings/[id]", "page");
  revalidatePath("/client/calendar");

  return { bookingId: newBooking.id };
}

export async function createClientBooking(formData: FormData) {
  const result = await saveClientBooking(formData);

  if ("error" in result) {
    redirect(`/client/bookings/new?error=${encodeURIComponent(result.error)}`);
  }

  redirect("/client/calendar");
}

/** Same write, but for the calendar's quick-add modal: it stays on the page. */
export async function createClientBookingInline(formData: FormData) {
  const result = await saveClientBooking(formData);
  return "error" in result ? { error: result.error } : { error: null };
}

/**
 * The owner's own edit. Same rules as the admin's — the split is recomputed
 * from the booking's snapshots, never from the client's current terms — with the
 * ownership check that every write on this side carries.
 */
export async function updateClientBooking(id: string, formData: FormData) {
  // Annotated on the const, not just the arrow: that is what lets TypeScript
  // treat a `back(...)` call as terminating and narrow what follows it.
  const back: (message: string) => never = (message) =>
    redirect(`/client/bookings/${id}/edit?error=${encodeURIComponent(message)}`);

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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: ownClient } = await supabase
    .from("clients")
    .select("id")
    .eq("owner_user_id", user?.id ?? "")
    .single();

  if (!ownClient) back("You can only edit your own bookings.");

  const { data: existing } = await supabase
    .from("bookings_v")
    .select(
      "client_id, check_in, check_out, sale_price, status, guest_name, is_short_stay, short_stay_start, short_stay_end, deal_model_snapshot, share_percent_snapshot, deduct_percent_snapshot, ota_model_snapshot, ota_share_percent_snapshot, booking_properties(property_id)"
    )
    .eq("id", id)
    .single();

  if (!existing || existing.client_id !== ownClient.id) back("You can only edit your own bookings.");
  if (existing.status === "cancelled") {
    back("This booking is cancelled. Create a new one instead of editing it.");
  }

  const { data: properties } = await supabase
    .from("properties")
    .select("id, name, stack_rate, short_stay_stack_rate, client_id")
    .in("id", property_ids);

  if ((properties ?? []).some((p) => p.client_id !== ownClient.id)) {
    back("All units in one booking must be your own properties.");
  }

  const clash = await findStayClash(supabase, {
    propertyIds: property_ids,
    checkIn: check_in,
    checkOut: check_out,
    excludeBookingId: id,
  });
  if (clash) back(clash);

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

  if (previousIds.length !== property_ids.length || !previousIds.every((p) => property_ids.includes(p))) {
    await supabase.from("booking_properties").delete().eq("booking_id", id);
    await supabase
      .from("booking_properties")
      .insert(property_ids.map((property_id) => ({ booking_id: id, property_id })));
  }

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

  revalidatePath("/client/bookings");
  revalidatePath("/client/bookings/[id]", "page");
  revalidatePath("/client/calendar");
  revalidatePath("/admin", "layout");

  redirect(`/client/bookings/${id}`);
}

/**
 * The owner attaching an ID card after the fact. RLS is what scopes this: the
 * insert policy only accepts a booking on their own client.
 */
export async function uploadClientGuestIds(formData: FormData) {
  const bookingId = formData.get("booking_id") as string;
  const files = guestIdFiles(formData);

  if (files.length === 0) {
    redirect(`/client/bookings/${bookingId}?id_error=${encodeURIComponent("Choose a file first.")}`);
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
    redirect(`/client/bookings/${bookingId}?id_error=${encodeURIComponent(error)}`);
  }

  revalidatePath("/client/bookings/[id]", "page");
  revalidatePath("/admin/bookings/[id]", "page");
  redirect(`/client/bookings/${bookingId}`);
}

/** Only their own uploads — the RLS policy is what enforces it. */
export async function deleteClientGuestId(formData: FormData) {
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

  revalidatePath("/client/bookings/[id]", "page");
  revalidatePath("/admin/bookings/[id]", "page");
  redirect(`/client/bookings/${bookingId}`);
}

/**
 * The owner's own tick. RLS already scopes `bookings` to their client, so a
 * bare id cannot reach someone else's stay — same reasoning as cancel below.
 */
export async function markClientStayProgress(formData: FormData) {
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
      .select("client_id, guest_name, booking_properties(properties(name))")
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

  revalidatePath("/client/today");
  revalidatePath("/client/checkins");
  revalidatePath("/client/bookings/[id]", "page");
  revalidatePath("/admin", "layout");
}

export async function cancelClientBooking(formData: FormData) {
  const id = formData.get("id") as string;

  const supabase = await createClient();

  // Read details before cancelling so the notification can describe what changed.
  const { data: booking } = await supabase
    .from("bookings_v")
    .select("client_id, check_in, check_out, source, is_short_stay, short_stay_start, short_stay_end, booking_properties(properties(name))")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("bookings").update({ status: "cancelled" }).eq("id", id);

  if (!error) {
    if (booking) {
      await notifyBookingCancelled(supabase, {
        clientId: booking.client_id,
        bookingId: id,
        unitNames:
          (booking.booking_properties as unknown as { properties: { name: string } | null }[])
            ?.map((bp) => bp.properties?.name ?? "")
            .filter(Boolean) ?? [],
        checkIn: booking.check_in,
        checkOut: booking.check_out,
        source: booking.source,
        shortStay: rowShortStay(booking),
      });
    }

    revalidatePath("/client/bookings");
    revalidatePath("/client/bookings/[id]", "page");
    revalidatePath("/client/calendar");
    // The admins' bell and activity feed are what this is for.
    revalidatePath("/admin", "layout");
  }
}
