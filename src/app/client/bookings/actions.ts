"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { calculatePayout, type DealModel } from "@/lib/payout";

export async function createClientBooking(formData: FormData) {
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

  function fail(msg: string) {
    redirect(`/client/bookings/new?error=${encodeURIComponent(msg)}`);
  }

  if (property_ids.length === 0) fail("Select at least one unit.");
  if (!check_in || !check_out || check_out <= check_in) {
    fail("Check-out must be after check-in.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Verify this is really the caller's own client account.
  const { data: ownClient } = await supabase
    .from("clients")
    .select("id, deal_model, share_percent, deduct_percent")
    .eq("owner_user_id", user?.id ?? "")
    .single();

  if (!ownClient || ownClient.id !== client_id) {
    fail("You can only add bookings for your own properties.");
    return;
  }

  const { data: properties } = await supabase
    .from("properties")
    .select("id, stack_rate, client_id")
    .in("id", property_ids);

  if ((properties ?? []).some((p) => p.client_id !== client_id)) {
    fail("All units in one booking must be your own properties.");
    return;
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
      fail("Those dates clash with an existing booking on one of the selected units.");
      return;
    }
  }

  const payout = calculatePayout({
    salePrice: sale_price,
    checkIn: check_in,
    checkOut: check_out,
    dealModel: ownClient.deal_model as DealModel,
    sharePercent: Number(ownClient.share_percent),
    deductPercent: Number(ownClient.deduct_percent),
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
    fail(error?.message ?? "Could not save booking.");
    return;
  }

  const linkRows = property_ids.map((property_id) => ({
    booking_id: newBooking!.id,
    property_id,
  }));
  await supabase.from("booking_properties").insert(linkRows);

  revalidatePath("/client/bookings");
  revalidatePath("/client/calendar");
  redirect("/client/calendar");
}

export async function cancelClientBooking(formData: FormData) {
  const id = formData.get("id") as string;

  const supabase = await createClient();
  const { error } = await supabase.from("bookings").update({ status: "cancelled" }).eq("id", id);

  if (!error) {
    revalidatePath("/client/bookings");
    revalidatePath("/client/calendar");
  }
}
