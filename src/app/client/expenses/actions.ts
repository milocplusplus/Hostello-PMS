"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  expenseReceiptFile,
  readExpenseForm,
  removeExpenseReceipt,
  uploadExpenseReceipt,
} from "@/lib/expenses";

/**
 * The owner's own books. Every write here is theirs by RLS — the policies check
 * the client, that the unit is one of theirs and that the category is one they
 * can see — so nothing below restates an ownership check it would only repeat.
 * No money anywhere else moves because of an expense.
 */

async function ownClient(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("clients")
    .select("id")
    .eq("owner_user_id", user?.id ?? "")
    .maybeSingle();

  return { user, client: data };
}

function listUrl(month: string | null, extra: Record<string, string> = {}) {
  const params = new URLSearchParams();
  if (month) params.set("month", month);
  for (const [k, v] of Object.entries(extra)) params.set(k, v);
  const q = params.toString();
  return `/client/expenses${q ? `?${q}` : ""}`;
}

function revalidateExpenses(clientId: string) {
  revalidatePath("/client/expenses");
  revalidatePath(`/admin/clients/${clientId}/expenses`);
}

/** Adds an expense, or saves changes to one when the form carries its id. */
export async function saveExpense(formData: FormData) {
  const id = (formData.get("id") as string) || null;
  const receipt = expenseReceiptFile(formData);
  const dropReceipt = formData.get("remove_receipt") === "on";

  const fail: (error: string) => never = (error) => {
    const params = new URLSearchParams({ error });
    redirect(`/client/expenses/${id ?? "new"}?${params}`);
  };

  const read = readExpenseForm(formData);
  if (!read.ok) fail(read.error);
  const input = read.value;

  const supabase = await createClient();
  const { user, client } = await ownClient(supabase);
  if (!client) fail("Only a property owner can record expenses.");

  // Reading it first is also the check that it exists and is theirs.
  const existing = id
    ? (
        await supabase
          .from("expenses")
          .select("id, receipt_path")
          .eq("id", id)
          .maybeSingle()
      ).data
    : null;
  if (id && !existing) fail("That expense no longer exists.");

  let uploadedPath: string | null = null;
  if (receipt) {
    const uploaded = await uploadExpenseReceipt(supabase, client.id, receipt);
    if (uploaded.error) fail(uploaded.error);
    uploadedPath = uploaded.path ?? null;
  }

  // A new file replaces the old one; the box removes it without a new one.
  const oldPath = existing?.receipt_path ?? null;
  const receiptPath = uploadedPath ?? (dropReceipt ? null : oldPath);

  const row = {
    client_id: client.id,
    property_id: input.propertyId,
    category_id: input.categoryId,
    amount: input.amount,
    incurred_on: input.incurredOn,
    vendor: input.vendor,
    method: input.method,
    paid: input.paid,
    due_on: input.dueOn,
    note: input.note,
    receipt_path: receiptPath,
    updated_at: new Date().toISOString(),
  };

  const { error } = existing
    ? await supabase.from("expenses").update(row).eq("id", existing.id)
    : await supabase.from("expenses").insert({ ...row, created_by: user?.id ?? null });

  if (error) {
    // Don't leave an orphan file behind if the row didn't land.
    await removeExpenseReceipt(supabase, uploadedPath);
    fail(
      error.code === "42501"
        ? "That unit or category isn't one of yours."
        : error.message
    );
  }

  if (oldPath && oldPath !== receiptPath) await removeExpenseReceipt(supabase, oldPath);

  revalidateExpenses(client.id);
  redirect(listUrl(input.incurredOn.slice(0, 7)));
}

export async function deleteExpense(formData: FormData) {
  const id = formData.get("id") as string;
  const month = (formData.get("month") as string) || null;

  const supabase = await createClient();
  const { client } = await ownClient(supabase);
  if (!client) redirect(listUrl(month, { error: "Only a property owner can remove expenses." }));

  const { data: existing } = await supabase
    .from("expenses")
    .select("id, receipt_path")
    .eq("id", id)
    .maybeSingle();
  if (!existing) redirect(listUrl(month, { error: "That expense no longer exists." }));

  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) redirect(listUrl(month, { error: error.message }));

  await removeExpenseReceipt(supabase, existing.receipt_path);

  revalidateExpenses(client.id);
  redirect(listUrl(month));
}

/** A category of their own, beside the shared defaults. */
export async function addExpenseCategory(formData: FormData) {
  const name = ((formData.get("name") as string) ?? "").trim().replace(/\s+/g, " ");
  const month = (formData.get("month") as string) || null;
  const back: (error?: string) => never = (error) =>
    redirect(listUrl(month, { categories: "open", ...(error ? { error } : {}) }));

  if (!name) back("Give the category a name.");
  if (name.length > 60) back("Keep the category name under 60 characters.");

  const supabase = await createClient();
  const { client } = await ownClient(supabase);
  if (!client) back("Only a property owner can add categories.");

  // The unique indexes cover their own list and the defaults separately; a
  // custom "utilities" beside the default Utilities is the case they miss.
  const { data: clash } = await supabase
    .from("expense_categories")
    .select("id")
    .is("client_id", null)
    .ilike("name", name.replace(/[\\%_]/g, "\\$&"))
    .maybeSingle();
  if (clash) back(`"${name}" is already one of the standard categories.`);

  const { error } = await supabase
    .from("expense_categories")
    .insert({ client_id: client.id, name });

  if (error) {
    back(error.code === "23505" ? `You already have a "${name}" category.` : error.message);
  }

  revalidateExpenses(client.id);
  back();
}

/** Only while nothing uses it — the expenses FK refuses otherwise. */
export async function removeExpenseCategory(formData: FormData) {
  const id = formData.get("id") as string;
  const month = (formData.get("month") as string) || null;
  const back: (error?: string) => never = (error) =>
    redirect(listUrl(month, { categories: "open", ...(error ? { error } : {}) }));

  const supabase = await createClient();
  const { client } = await ownClient(supabase);
  if (!client) back("Only a property owner can remove categories.");

  const { error } = await supabase.from("expense_categories").delete().eq("id", id);

  if (error) {
    back(
      error.code === "23503"
        ? "Some expenses still use that category. Move them to another one first."
        : error.message
    );
  }

  revalidateExpenses(client.id);
  back();
}
