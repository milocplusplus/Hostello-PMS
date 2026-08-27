"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { calculatePayout, type DealModel, type OtaModel } from "@/lib/payout";
import { notifyBookingCancelled, notifyBookingCreated } from "@/lib/notify";

type SaveResult = { error: string } | { bookingId: string };

/**
 * The one place a client-side booking gets written. Returns instead of
 * redirecting so both the full page and the calendar's quick-add modal use it.
 */
async function saveClientBooking(formData: FormData): Promise<SaveResult> {
  const client_id = formData.get("client_id") as string;
  const property_ids = formData.getAll("property_ids") as string[];
  const check_in = formData.get("check_in") as string;
  const check_out = formData.get("check_out") as string;
  const guest_name = (formData.get("guest_name") as string)?.trim() || null;
  const guest_phone = (formData.get("guest_phone") as string)?.trim() || null;
  const source = (formData.get("source") as string) || "other";
  const status = (formData.get("status") as string) || "confirmed";
  const sale_price = Number(formData.get("sale_price")) || 0;
  const advance_received = Number(formData.get("advance_received")) || 0;
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (property_ids.length === 0) {
    return { error: "Select at least one unit." };
  }
  if (!check_in || !check_out || check_out <= check_in) {
    return { error: "Check-out must be after check-in." };
  }

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
    .select("id, name, stack_rate, client_id")
    .in("id", property_ids);

  if ((properties ?? []).some((p) => p.client_id !== client_id)) {
    return { error: "All units in one booking must be your own properties." };
  }

  const stackRateTotal = (properties ?? []).reduce((sum, p) => sum + Number(p.stack_rate ?? 0), 0);

  const { data: existingBookingIds } = await supabase
    .from("booking_properties")
    .select("booking_id")
    .in("property_id", property_ids);

  if (existingBookingIds && existingBookingIds.length > 0) {
    const bookingIds = [...new Set(existingBookingIds.map((r) => r.booking_id))];
    const { data: clashes } = await supabase
      .from("bookings")
      .select("id")
      .in("id", bookingIds)
      .neq("status", "cancelled")
      .lt("check_in", check_out)
      .gt("check_out", check_in)
      .limit(1);

    if (clashes && clashes.length > 0) {
      return { error: "Those dates clash with an existing booking on one of the selected units." };
    }
  }

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

  // The owner entered this one, so the fan-out sends it to the admins and not
  // back to them.
  await notifyBookingCreated(supabase, {
    clientId: client_id,
    bookingId: newBooking.id,
    unitNames: (properties ?? []).map((p) => p.name),
    checkIn: check_in,
    checkOut: check_out,
    clientPayout: payout.clientPayout,
    isTentative: status === "tentative",
    advanceReceived: advance_received,
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

export async function cancelClientBooking(formData: FormData) {
  const id = formData.get("id") as string;

  const supabase = await createClient();

  // Read details before cancelling so the notification can describe what changed.
  const { data: booking } = await supabase
    .from("bookings")
    .select("client_id, check_in, check_out, booking_properties(properties(name))")
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
      });
    }

    revalidatePath("/client/bookings");
    revalidatePath("/client/bookings/[id]", "page");
    revalidatePath("/client/calendar");
    // The admins' bell and activity feed are what this is for.
    revalidatePath("/admin", "layout");
  }
}
