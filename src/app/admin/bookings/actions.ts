"use server";

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
  notifyBookingCreated,
  notifyBookingCancelled,
  notifyPaymentReceived,
  notifyPayoutSettled,
} from "@/lib/notify";

type SaveResult = { error: string } | { clientId: string; bookingId: string };

/**
 * The one place a booking gets written. Returns instead of redirecting so both
 * the full page and the calendar's quick-add modal can use it.
 */
async function saveBooking(formData: FormData): Promise<SaveResult> {
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

  // Check the attachment before anything is written — once the booking exists,
  // rejecting the form would only invite a duplicate.
  const receipt = receiptFile(formData);
  const receiptProblem = receipt ? validateReceipt(receipt) : null;
  if (receiptProblem) return { error: receiptProblem };

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Never trust client-submitted split numbers — recompute authoritatively
  // from the client's current deal terms and the selected properties' stack rates.
  const { data: clientRecord } = await supabase
    .from("clients")
    .select("deal_model, share_percent, deduct_percent, ota_model, ota_share_percent")
    .eq("id", client_id)
    .single();

  if (!clientRecord) {
    return { error: "Client not found." };
  }

  const { data: properties } = await supabase
    .from("properties")
    .select("id, name, stack_rate")
    .in("id", property_ids);

  const stackRateTotal = (properties ?? []).reduce((sum, p) => sum + Number(p.stack_rate ?? 0), 0);

  // Clash check: overlapping bookings on any of the same units.
  // date >= checkIn AND date < checkOut, so same-day checkout/check-in is fine.
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
      return {
        error: "Those dates clash with an existing booking on one of the selected units.",
      };
    }
  }

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
      entered_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !newBooking) {
    return { error: error?.message ?? "Could not save booking." };
  }

  const linkRows = property_ids.map((property_id) => ({
    booking_id: newBooking.id,
    property_id,
  }));
  await supabase.from("booking_properties").insert(linkRows);

  // Best-effort, like the notification below: the booking is already real, and
  // a receipt can always be attached again from the booking page.
  if (receipt) {
    await attachReceipt(supabase, {
      bookingId: newBooking.id,
      file: receipt,
      kind: receiptKind(formData),
      amount: advance_received,
      uploadedBy: user?.id ?? null,
    });
  }

  await notifyBookingCreated(supabase, {
    clientId: client_id,
    bookingId: newBooking.id,
    unitNames: (properties ?? []).map((p) => p.name),
    checkIn: check_in,
    checkOut: check_out,
    source,
    isTentative: status === "tentative",
  });

  revalidatePath("/admin/bookings");
  revalidatePath("/admin/bookings/[id]", "page");
  revalidatePath("/admin/calendar");
  revalidatePath(`/admin/clients/${client_id}`);
  revalidatePath("/client", "layout");

  return { clientId: client_id, bookingId: newBooking.id };
}

export async function createBooking(formData: FormData) {
  const result = await saveBooking(formData);

  if ("error" in result) {
    redirect(`/admin/bookings/new?error=${encodeURIComponent(result.error)}`);
  }

  redirect(`/admin/clients/${result.clientId}`);
}

/** Same write, but for the calendar's quick-add modal: it stays on the page. */
export async function createBookingInline(formData: FormData) {
  const result = await saveBooking(formData);
  return "error" in result ? { error: result.error } : { error: null };
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
      .from("bookings")
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

export async function markBookingSettled(formData: FormData) {
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
      .from("bookings")
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

export async function cancelBooking(formData: FormData) {
  const id = formData.get("id") as string;

  const supabase = await createClient();

  // Read details before cancelling so the notification can describe what changed.
  const { data: booking } = await supabase
    .from("bookings")
    .select("client_id, check_in, check_out, source, booking_properties(properties(name))")
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
    });
  }

  revalidatePath("/admin/bookings");
  revalidatePath("/admin/bookings/[id]", "page");
  revalidatePath("/admin/calendar");
  revalidatePath("/client/bookings");
  revalidatePath("/client/calendar");
  revalidatePath("/client", "layout");
}
