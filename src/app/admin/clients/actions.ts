"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { DEAL_MODELS } from "@/lib/payout";
import { clientHasHistory } from "@/lib/client-history";
import { OWNER_NOTICE_GROUPS, type OwnerNotices } from "@/lib/owner-notices";
import { requireOwner } from "@/lib/auth";
import { VIEW_AS_COOKIE, VIEW_AS_PATH } from "@/lib/view-as";
import {
  RATE_FIELDS,
  adjusted,
  isAdjustMode,
  isRateField,
  type AdjustMode,
  type RateField,
} from "@/lib/bulk-rates";
import { removePropertyPhoto, setPropertyPhoto } from "@/lib/property-photos";
import {
  notifyClientTermsUpdated,
  notifyPropertyAdded,
  notifyPropertyRemoved,
  notifyBulkSummary,
} from "@/lib/notify";

// ── Clients ──────────────────────────────────────────────

export async function createClientRecord(formData: FormData) {
  const name = (formData.get("name") as string)?.trim();
  const contact_email = (formData.get("contact_email") as string)?.trim() || null;
  const contact_phone = (formData.get("contact_phone") as string)?.trim() || null;
  const deal_model = (formData.get("deal_model") as string) || "percent";
  const monthly_fee = Number(formData.get("monthly_fee")) || 0;
  const share_percent = Number(formData.get("share_percent")) || 0;
  const deduct_percent = Number(formData.get("deduct_percent")) || 0;
  const ota_model = (formData.get("ota_model") as string) || "percent";
  const ota_share_percent = Number(formData.get("ota_share_percent")) || 0;
  const login_email = (formData.get("login_email") as string)?.trim() || null;
  const login_password = (formData.get("login_password") as string) || null;

  if (!name) {
    redirect(`/admin/clients/new?error=${encodeURIComponent("Client name is required.")}`);
  }

  if (login_email && (!login_password || login_password.length < 8)) {
    redirect(
      `/admin/clients/new?error=${encodeURIComponent(
        "Set a password of at least 8 characters, or leave both login fields blank."
      )}`
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .insert({
      name,
      contact_email,
      contact_phone,
      deal_model,
      monthly_fee,
      share_percent,
      deduct_percent,
      ota_model,
      ota_share_percent,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(
      `/admin/clients/new?error=${encodeURIComponent(error?.message ?? "Could not create client.")}`
    );
  }

  revalidatePath("/admin/clients");

  if (login_email && login_password) {
    const { error: loginError } = await supabase.rpc("create_client_login", {
      p_client_id: data!.id,
      p_email: login_email,
      p_password: login_password,
      p_full_name: name,
    });

    if (loginError) {
      redirect(
        `/admin/clients/${data!.id}?error=${encodeURIComponent(
          `Client created, but the login couldn't be set up: ${loginError.message}`
        )}`
      );
    }
  }

  redirect(`/admin/clients/${data!.id}`);
}

export async function updateClientRecord(formData: FormData) {
  const id = formData.get("id") as string;
  const name = (formData.get("name") as string)?.trim();
  const contact_email = (formData.get("contact_email") as string)?.trim() || null;
  const contact_phone = (formData.get("contact_phone") as string)?.trim() || null;
  const deal_model = (formData.get("deal_model") as string) || "percent";
  const monthly_fee = Number(formData.get("monthly_fee")) || 0;
  const share_percent = Number(formData.get("share_percent")) || 0;
  const deduct_percent = Number(formData.get("deduct_percent")) || 0;
  const ota_model = (formData.get("ota_model") as string) || "percent";
  const ota_share_percent = Number(formData.get("ota_share_percent")) || 0;

  if (!name) {
    redirect(
      `/admin/clients/${id}/edit?error=${encodeURIComponent("Client name is required.")}`
    );
  }

  const supabase = await createClient();

  // Read the terms first: an owner should hear that their split changed, and
  // should not hear anything because a phone number was corrected.
  const { data: before } = await supabase
    .from("clients")
    .select("deal_model, monthly_fee, share_percent, deduct_percent, ota_model, ota_share_percent")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("clients")
    .update({
      name,
      contact_email,
      contact_phone,
      deal_model,
      monthly_fee,
      share_percent,
      deduct_percent,
      ota_model,
      ota_share_percent,
    })
    .eq("id", id);

  if (error) {
    redirect(`/admin/clients/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  const termsChanged =
    !!before &&
    (before.deal_model !== deal_model ||
      Number(before.monthly_fee) !== monthly_fee ||
      Number(before.share_percent) !== share_percent ||
      Number(before.deduct_percent) !== deduct_percent ||
      before.ota_model !== ota_model ||
      Number(before.ota_share_percent) !== ota_share_percent);

  if (termsChanged) {
    const summary = [
      DEAL_MODELS.find((m) => m.value === deal_model)?.label ?? deal_model,
      share_percent > 0 ? `Share ${share_percent}%` : null,
      deduct_percent > 0 ? `Deduction ${deduct_percent}%` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    await notifyClientTermsUpdated(supabase, {
      clientId: id,
      summary,
      day: new Date().toISOString().slice(0, 10),
    });
  }

  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${id}`);
  revalidatePath("/client", "layout");
  redirect(`/admin/clients/${id}`);
}

export async function deleteClientRecord(formData: FormData) {
  const id = formData.get("id") as string;

  const supabase = await createClient();
  if (await clientHasHistory(supabase, id)) {
    redirect(
      `/admin/clients/${id}?error=${encodeURIComponent(
        "This client has bookings, payments or expenses. Deactivate them instead — deleting would erase that history."
      )}`
    );
  }

  const { error } = await supabase.from("clients").delete().eq("id", id);

  if (error) {
    redirect(`/admin/clients/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/clients");
  redirect("/admin/clients");
}

/** Deactivate or reactivate. Everything it switches is in `set_client_active` and the triggers. */
export async function setClientActive(formData: FormData) {
  const id = formData.get("id") as string;
  const active = formData.get("active") === "true";
  const note = ((formData.get("note") as string) ?? "").trim().slice(0, 300);

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_client_active", {
    p_client_id: id,
    p_active: active,
    p_note: note || null,
  });

  if (error) {
    redirect(`/admin/clients/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin", "layout");
  redirect(
    `/admin/clients/${id}?notice=${encodeURIComponent(
      active ? "Reactivated. Their login, channels and messages are back on." : "Deactivated."
    )}`
  );
}

export async function createLoginForClient(formData: FormData) {
  const client_id = formData.get("client_id") as string;
  const login_email = (formData.get("login_email") as string)?.trim();
  const login_password = (formData.get("login_password") as string) || "";

  if (!login_email || login_password.length < 8) {
    redirect(
      `/admin/clients/${client_id}?error=${encodeURIComponent(
        "Enter an email and a password of at least 8 characters."
      )}`
    );
  }

  const supabase = await createClient();

  const { data: clientRecord } = await supabase
    .from("clients")
    .select("name")
    .eq("id", client_id)
    .single();

  const { error } = await supabase.rpc("create_client_login", {
    p_client_id: client_id,
    p_email: login_email,
    p_password: login_password,
    p_full_name: clientRecord?.name ?? null,
  });

  if (error) {
    redirect(`/admin/clients/${client_id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/admin/clients/${client_id}`);
  redirect(`/admin/clients/${client_id}`);
}

/**
 * Client logins use placeholder addresses that receive no mail, so Supabase's
 * recovery email can never reach the owner. This is how they get back in: an
 * admin sets the password and passes it on. The RPC also drops the client's
 * live sessions.
 */
export async function setClientPassword(formData: FormData) {
  const client_id = formData.get("client_id") as string;
  const new_password = (formData.get("new_password") as string) || "";

  if (new_password.length < 8) {
    redirect(
      `/admin/clients/${client_id}?error=${encodeURIComponent(
        "Password must be at least 8 characters."
      )}`
    );
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("set_client_password", {
    p_client_id: client_id,
    p_password: new_password,
  });

  if (error) {
    redirect(`/admin/clients/${client_id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/admin/clients/${client_id}`);
  redirect(
    `/admin/clients/${client_id}?notice=${encodeURIComponent(
      "Password updated. Give it to the owner — they'll need to sign in again."
    )}`
  );
}

// ── Properties ───────────────────────────────────────────

/**
 * Blank means "not recorded yet", and that is a null — not a zero. The
 * availability finder tells the two apart: a null is listed as missing, a zero
 * would read as a free unit that sleeps nobody.
 */
function optionalNumber(value: FormDataEntryValue | null, min = 0): number | null {
  const raw = (value as string | null)?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min ? n : null;
}

export async function createProperty(formData: FormData) {
  const client_id = formData.get("client_id") as string;
  const name = (formData.get("name") as string)?.trim();
  const location = (formData.get("location") as string)?.trim();
  const province = (formData.get("province") as string)?.trim() || null;
  const city = (formData.get("city") as string)?.trim() || null;
  const type = formData.get("type") as string;
  const status = (formData.get("status") as string) || "active";
  const stack_rate = Number(formData.get("stack_rate")) || 0;
  const short_stay_stack_rate = Number(formData.get("short_stay_stack_rate")) || 0;
  const max_guests = optionalNumber(formData.get("max_guests"), 1);
  const nightly_rate = optionalNumber(formData.get("nightly_rate"));
  const short_stay_rate = optionalNumber(formData.get("short_stay_rate"));

  if (!name || !location) {
    redirect(
      `/admin/clients/${client_id}/properties/new?error=${encodeURIComponent(
        "Property name and location are required."
      )}`
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("properties")
    .insert({
      client_id,
      name,
      location,
      province,
      city,
      type,
      status,
      stack_rate,
      short_stay_stack_rate,
      max_guests,
      nightly_rate,
      short_stay_rate,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(
      `/admin/clients/${client_id}/properties/new?error=${encodeURIComponent(
        error?.message ?? "Could not add the property."
      )}`
    );
  }

  await notifyPropertyAdded(supabase, {
    clientId: client_id,
    propertyId: data.id,
    propertyName: name,
    location: [location, city].filter(Boolean).join(", "),
  });

  revalidatePath(`/admin/clients/${client_id}`);
  revalidatePath("/client", "layout");
  redirect(`/admin/clients/${client_id}`);
}

export async function updateProperty(formData: FormData) {
  const id = formData.get("id") as string;
  const client_id = formData.get("client_id") as string;
  const name = (formData.get("name") as string)?.trim();
  const location = (formData.get("location") as string)?.trim();
  const province = (formData.get("province") as string)?.trim() || null;
  const city = (formData.get("city") as string)?.trim() || null;
  const type = formData.get("type") as string;
  const status = (formData.get("status") as string) || "active";
  const stack_rate = Number(formData.get("stack_rate")) || 0;
  const short_stay_stack_rate = Number(formData.get("short_stay_stack_rate")) || 0;
  const max_guests = optionalNumber(formData.get("max_guests"), 1);
  const nightly_rate = optionalNumber(formData.get("nightly_rate"));
  const short_stay_rate = optionalNumber(formData.get("short_stay_rate"));

  if (!name || !location) {
    redirect(
      `/admin/clients/${client_id}/properties/${id}/edit?error=${encodeURIComponent(
        "Property name and location are required."
      )}`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("properties")
    .update({
      name,
      location,
      province,
      city,
      type,
      status,
      stack_rate,
      short_stay_stack_rate,
      max_guests,
      nightly_rate,
      short_stay_rate,
    })
    .eq("id", id);

  if (error) {
    redirect(
      `/admin/clients/${client_id}/properties/${id}/edit?error=${encodeURIComponent(
        error.message
      )}`
    );
  }

  revalidatePath(`/admin/clients/${client_id}`);
  redirect(`/admin/clients/${client_id}`);
}

// A unit's cover photo. `set_property_photo()` checks the caller and keeps the
// file in the unit's own client folder, so a forged client id only fails.
export async function uploadPropertyPhoto(formData: FormData) {
  const id = formData.get("id") as string;
  const client_id = formData.get("client_id") as string;
  const file = formData.get("photo");
  const back = `/admin/clients/${client_id}/properties/${id}/edit`;
  if (!(file instanceof File) || file.size === 0) {
    redirect(`${back}?error=${encodeURIComponent("Choose a photo.")}`);
  }

  const supabase = await createClient();
  const error = await setPropertyPhoto(supabase, { clientId: client_id, propertyId: id, file });
  // The photo shows on cards, calendars and dashboards in both portals.
  revalidatePath("/", "layout");
  redirect(error ? `${back}?error=${encodeURIComponent(error)}` : back);
}

export async function clearPropertyPhoto(formData: FormData) {
  const id = formData.get("id") as string;
  const client_id = formData.get("client_id") as string;
  const back = `/admin/clients/${client_id}/properties/${id}/edit`;

  const supabase = await createClient();
  const error = await removePropertyPhoto(supabase, id);
  revalidatePath("/", "layout");
  redirect(error ? `${back}?error=${encodeURIComponent(error)}` : back);
}

export async function deletePropertyRecord(formData: FormData) {
  const id = formData.get("id") as string;
  const client_id = formData.get("client_id") as string;

  const supabase = await createClient();

  // The name has to be read before the row goes.
  const { data: property } = await supabase
    .from("properties")
    .select("name")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("properties").delete().eq("id", id);

  if (error) {
    // The owner's own expense records point at the unit, and deleting it must
    // not quietly delete or re-file their books. Matches both `expenses_…` and
    // `recurring_expenses_property_id_fkey`.
    const message = error.message.includes("expenses_property_id_fkey")
      ? "The owner has expenses or recurring bills on this property. They need moving or deleting first."
      : error.message;
    redirect(`/admin/clients/${client_id}?error=${encodeURIComponent(message)}`);
  }

  if (property) {
    await notifyPropertyRemoved(supabase, {
      clientId: client_id,
      propertyId: id,
      propertyName: property.name,
    });
  }

  revalidatePath(`/admin/clients/${client_id}`);
  revalidatePath("/client", "layout");
  redirect(`/admin/clients/${client_id}`);
}

/**
 * Open the owner portal as this client, read-only. Recorded in the audit log;
 * the owner is not told. The cookie and what it allows: `src/lib/view-as.ts`,
 * `viewingAs()` in auth.ts, and the write block in middleware.ts.
 */
export async function viewAsOwner(formData: FormData) {
  await requireOwner();
  const id = formData.get("id") as string;

  const supabase = await createClient();
  const { error } = await supabase.rpc("log_portal_view", { p_client_id: id });
  if (error) {
    redirect(`/admin/clients/${id}?error=${encodeURIComponent(error.message)}`);
  }

  (await cookies()).set(VIEW_AS_COOKIE, id, {
    path: VIEW_AS_PATH,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    // Ends on Exit (or on sign-in / sign-out), not on a timer.
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/client");
}

/**
 * Change one rate across several of a client's units. Each new value is
 * worked out here with the same `adjusted()` the preview used; a unit whose
 * result makes no sense (below zero, a percentage of a rate never set) is
 * skipped and named. Stack rates are snapshotted onto bookings, so only new
 * bookings see the change. The owner gets one notice for the lot.
 */
export async function bulkUpdateUnitRates(formData: FormData) {
  await requireOwner();
  const clientId = formData.get("client_id") as string;
  const field = formData.get("field");
  const mode = formData.get("mode");
  const value = Number(formData.get("value"));
  const ids = [...new Set(formData.getAll("ids").map(String))];
  const back = (params: Record<string, string>) =>
    redirect(`/admin/clients/${clientId}/rates?${new URLSearchParams(params).toString()}`);

  if (!isRateField(field) || !isAdjustMode(mode)) back({ error: "Pick what to change and how." });
  if (!Number.isFinite(value) || value < 0) back({ error: "Enter a number." });
  if (ids.length === 0) back({ error: "Tick the units to change first." });

  const supabase = await createClient();
  const { data: units } = await supabase
    .from("properties")
    .select("id, name, stack_rate, short_stay_stack_rate, max_guests")
    .eq("client_id", clientId)
    .in("id", ids);

  const f = field as RateField;
  const changed: string[] = [];
  const skipped: string[] = [];
  for (const u of units ?? []) {
    const current = u[f] === null ? null : Number(u[f]);
    const next = adjusted(f, current, mode as AdjustMode, value);
    if (next === null) {
      skipped.push(u.name);
      continue;
    }
    if (next === current) continue;
    const { error } = await supabase.from("properties").update({ [f]: next }).eq("id", u.id);
    if (error) skipped.push(`${u.name} (${error.message})`);
    else changed.push(u.name);
  }

  if (changed.length > 0) {
    const label = RATE_FIELDS.find((r) => r.key === f)?.label ?? "Rates";
    await notifyBulkSummary(supabase, {
      kind: "client_terms_updated",
      category: "system",
      clientId,
      title: `${label} updated on ${changed.length} unit${changed.length === 1 ? "" : "s"}`,
      body: `${changed.join(", ")}${f === "max_guests" ? "" : " · applies to new bookings"}`,
      eventKey: `bulk-rates:${clientId}:${f}:${Date.now()}`,
    });
  }

  revalidatePath(`/admin/clients/${clientId}`, "layout");
  revalidatePath("/client", "layout");
  back({
    notice: `Updated ${changed.length} unit${changed.length === 1 ? "" : "s"}.`,
    ...(skipped.length ? { error: `Skipped — ${skipped.join(", ")}.` } : {}),
  });
}

/**
 * This owner's notice rules. Each group is "default" (follow Settings — the
 * key is left out), "on" or "off". Checked in `fan_out_notification`.
 */
export async function setClientNotices(formData: FormData) {
  await requireOwner();
  const id = formData.get("id") as string;
  const rules: OwnerNotices = {};
  for (const g of OWNER_NOTICE_GROUPS) {
    const v = formData.get(g.key);
    if (v === "on") rules[g.key] = true;
    if (v === "off") rules[g.key] = false;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("clients").update({ owner_notices: rules }).eq("id", id);
  if (error) redirect(`/admin/clients/${id}?error=${encodeURIComponent(error.message)}#notices`);

  revalidatePath(`/admin/clients/${id}`);
  redirect(`/admin/clients/${id}?notice=${encodeURIComponent("Notification rules saved.")}#notices`);
}
