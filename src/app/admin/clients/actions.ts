"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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

  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${id}`);
  redirect(`/admin/clients/${id}`);
}

export async function deleteClientRecord(formData: FormData) {
  const id = formData.get("id") as string;

  const supabase = await createClient();
  const { error } = await supabase.from("clients").delete().eq("id", id);

  if (error) {
    redirect(`/admin/clients/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/clients");
  redirect("/admin/clients");
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

export async function createProperty(formData: FormData) {
  const client_id = formData.get("client_id") as string;
  const name = (formData.get("name") as string)?.trim();
  const location = (formData.get("location") as string)?.trim();
  const province = (formData.get("province") as string)?.trim() || null;
  const city = (formData.get("city") as string)?.trim() || null;
  const type = formData.get("type") as string;
  const status = (formData.get("status") as string) || "active";
  const stack_rate = Number(formData.get("stack_rate")) || 0;

  if (!name || !location) {
    redirect(
      `/admin/clients/${client_id}/properties/new?error=${encodeURIComponent(
        "Property name and location are required."
      )}`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.from("properties").insert({
    client_id,
    name,
    location,
    province,
    city,
    type,
    status,
    stack_rate,
  });

  if (error) {
    redirect(
      `/admin/clients/${client_id}/properties/new?error=${encodeURIComponent(error.message)}`
    );
  }

  revalidatePath(`/admin/clients/${client_id}`);
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
    .update({ name, location, province, city, type, status, stack_rate })
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

export async function deletePropertyRecord(formData: FormData) {
  const id = formData.get("id") as string;
  const client_id = formData.get("client_id") as string;

  const supabase = await createClient();
  const { error } = await supabase.from("properties").delete().eq("id", id);

  if (error) {
    redirect(`/admin/clients/${client_id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/admin/clients/${client_id}`);
  redirect(`/admin/clients/${client_id}`);
}
