import type { SupabaseClient } from "@supabase/supabase-js";
import { receiptExtension, validateReceipt } from "./receipts";

/**
 * Owner expenses — an owner's own books. Tracking only: nothing here is read by
 * Settlements, `owed.ts` or the payout math, and nothing should be. See
 * docs/expenses.md.
 *
 * The owner writes, the admin reads, ops sees nothing — all of which is RLS.
 * Bill photos are private and reach a browser only through a signed URL.
 */
export const EXPENSE_BUCKET = "expense-receipts";

export type ExpenseMethod = "cash" | "bank" | "jazzcash" | "easypaisa" | "card";

export const EXPENSE_METHODS: { value: ExpenseMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank transfer" },
  { value: "jazzcash", label: "JazzCash" },
  { value: "easypaisa", label: "Easypaisa" },
  { value: "card", label: "Card" },
];

export function expenseMethodLabel(method: string | null) {
  return EXPENSE_METHODS.find((m) => m.value === method)?.label ?? null;
}

export type ExpenseCategory = { id: string; name: string; own: boolean };

export type Expense = {
  id: string;
  amount: number;
  incurredOn: string;
  categoryId: string;
  categoryName: string;
  propertyId: string | null;
  /** Null is "All units" — a general cost, never a missing unit. */
  propertyName: string | null;
  vendor: string | null;
  method: ExpenseMethod | null;
  paid: boolean;
  dueOn: string | null;
  note: string | null;
  receiptPath: string | null;
  receiptUrl: string | null;
  receiptIsPdf: boolean;
  /** False for a due bill the daily job wrote: in no total until confirmed. */
  confirmed: boolean;
  recurringId: string | null;
};

export type ExpenseStatusFilter = "paid" | "unpaid";

export type ExpenseFilters = {
  /** A property id, or "general" for the ones on no unit. */
  unit?: string;
  category?: string;
  status?: ExpenseStatusFilter;
};

const SELECT =
  "id, amount, incurred_on, category_id, property_id, vendor, method, paid, due_on, note, receipt_path, confirmed, recurring_id, expense_categories(name), properties(name)";

type Row = {
  id: string;
  amount: number | string;
  incurred_on: string;
  category_id: string;
  property_id: string | null;
  vendor: string | null;
  method: string | null;
  paid: boolean;
  due_on: string | null;
  note: string | null;
  receipt_path: string | null;
  confirmed: boolean;
  recurring_id: string | null;
  expense_categories: { name: string } | null;
  properties: { name: string } | null;
};

/** First and last day of a month, both inclusive, as ISO dates. */
export function monthBounds(year: number, month0: number) {
  const start = new Date(Date.UTC(year, month0, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(year, month0 + 1, 0)).toISOString().slice(0, 10);
  return { start, end };
}

/** Rows → display shape, with a signed URL per bill photo in one round trip. */
async function withReceipts(supabase: SupabaseClient, rows: Row[]): Promise<Expense[]> {
  const paths = rows.map((r) => r.receipt_path).filter((p): p is string => !!p);
  const urls = new Map<string, string>();

  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from(EXPENSE_BUCKET)
      .createSignedUrls(paths, 60 * 60);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }

  return rows.map((r) => ({
    id: r.id,
    amount: Number(r.amount),
    incurredOn: r.incurred_on,
    categoryId: r.category_id,
    categoryName: r.expense_categories?.name ?? "Uncategorised",
    propertyId: r.property_id,
    propertyName: r.property_id ? (r.properties?.name ?? "Unit") : null,
    vendor: r.vendor,
    method: (r.method as ExpenseMethod | null) ?? null,
    paid: r.paid,
    dueOn: r.due_on,
    note: r.note,
    receiptPath: r.receipt_path,
    receiptUrl: r.receipt_path ? (urls.get(r.receipt_path) ?? null) : null,
    receiptIsPdf: !!r.receipt_path?.endsWith(".pdf"),
    confirmed: r.confirmed,
    recurringId: r.recurring_id,
  }));
}

/** One owner's confirmed expenses billed in a month, newest bill first. Due
 *  bills are not in it — they are not a cost until confirmed. */
export async function listExpenses(
  supabase: SupabaseClient,
  clientId: string,
  month: { year: number; month0: number },
  filters: ExpenseFilters = {}
): Promise<Expense[]> {
  const { start, end } = monthBounds(month.year, month.month0);

  let query = supabase
    .from("expenses")
    .select(SELECT)
    .eq("client_id", clientId)
    .eq("confirmed", true)
    .gte("incurred_on", start)
    .lte("incurred_on", end);

  if (filters.unit === "general") query = query.is("property_id", null);
  else if (filters.unit) query = query.eq("property_id", filters.unit);
  if (filters.category) query = query.eq("category_id", filters.category);
  if (filters.status) query = query.eq("paid", filters.status === "paid");

  const { data } = await query
    .order("incurred_on", { ascending: false })
    .order("created_at", { ascending: false });

  return withReceipts(supabase, (data ?? []) as unknown as Row[]);
}

export async function getExpense(supabase: SupabaseClient, id: string): Promise<Expense | null> {
  const { data } = await supabase.from("expenses").select(SELECT).eq("id", id).maybeSingle();
  if (!data) return null;
  const [expense] = await withReceipts(supabase, [data as unknown as Row]);
  return expense;
}

/**
 * Every bill still owed to a vendor, whatever month it was billed in — money
 * that has to leave is not bounded by the month on screen.
 */
export async function unpaidTotal(
  supabase: SupabaseClient,
  clientId: string
): Promise<{ total: number; count: number; earliestDue: string | null }> {
  const { data } = await supabase
    .from("expenses")
    .select("amount, due_on")
    .eq("client_id", clientId)
    .eq("confirmed", true)
    .eq("paid", false);

  const rows = data ?? [];
  const dues = rows.map((r) => r.due_on).filter((d): d is string => !!d).sort();
  return {
    total: rows.reduce((sum, r) => sum + Number(r.amount), 0),
    count: rows.length,
    earliestDue: dues[0] ?? null,
  };
}

/** The shared defaults first, then the owner's own, each alphabetical. */
export async function listExpenseCategories(
  supabase: SupabaseClient,
  clientId: string
): Promise<ExpenseCategory[]> {
  const { data } = await supabase
    .from("expense_categories")
    .select("id, name, client_id")
    .or(`client_id.is.null,client_id.eq.${clientId}`)
    .order("name");

  const rows = (data ?? []).map((c) => ({ id: c.id, name: c.name, own: c.client_id !== null }));
  // "Other" last among the defaults: it is the catch-all, not a peer.
  const rank = (c: ExpenseCategory) => (c.own ? 2 : c.name === "Other" ? 1 : 0);
  return rows.sort((a, b) => rank(a) - rank(b));
}

export type ExpenseInput = {
  amount: number;
  incurredOn: string;
  categoryId: string;
  propertyId: string | null;
  vendor: string | null;
  method: ExpenseMethod | null;
  paid: boolean;
  dueOn: string | null;
  note: string | null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Reads and checks the expense form. Ownership is RLS's job, not this one's. */
export function readExpenseForm(
  formData: FormData
): { ok: true; value: ExpenseInput } | { ok: false; error: string } {
  const text = (key: string) => (formData.get(key) as string | null)?.trim() || null;

  const amount = Number(text("amount"));
  const incurredOn = text("incurred_on");
  const categoryId = text("category_id");
  const unit = text("property_id");
  const method = text("method");
  const paid = formData.get("paid") !== "no";
  const dueOn = paid ? null : text("due_on");

  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter what it cost — more than zero." };
  }
  if (!incurredOn || !ISO_DATE.test(incurredOn)) {
    return { ok: false, error: "Pick the bill date." };
  }
  if (!categoryId) return { ok: false, error: "Pick a category." };
  if (method && !EXPENSE_METHODS.some((m) => m.value === method)) {
    return { ok: false, error: "Pick how it was paid." };
  }
  if (dueOn && !ISO_DATE.test(dueOn)) return { ok: false, error: "That due date isn't a date." };

  return {
    ok: true,
    value: {
      amount: Math.round(amount * 100) / 100,
      incurredOn,
      categoryId,
      propertyId: unit && unit !== "general" ? unit : null,
      vendor: text("vendor"),
      method: (method as ExpenseMethod | null) ?? null,
      paid,
      dueOn,
      note: text("note"),
    },
  };
}

/** The bill photo the form sent, or null when nothing was attached. */
export function expenseReceiptFile(formData: FormData): File | null {
  const file = formData.get("receipt");
  return file instanceof File && file.size > 0 ? file : null;
}

export async function uploadExpenseReceipt(
  supabase: SupabaseClient,
  clientId: string,
  file: File
): Promise<{ error: string | null; path?: string }> {
  const invalid = validateReceipt(file);
  if (invalid) return { error: invalid };

  const ext = receiptExtension(file.type);
  if (!ext) return { error: "Attach the bill as a PNG, JPG, WebP or PDF." };

  const path = `${clientId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(EXPENSE_BUCKET)
    .upload(path, file, { contentType: file.type });

  if (error) return { error: error.message };
  return { error: null, path };
}

export async function removeExpenseReceipt(supabase: SupabaseClient, path: string | null) {
  if (path) await supabase.storage.from(EXPENSE_BUCKET).remove([path]);
}

// ── Recurring bills ──────────────────────────────────────────────────────────
//
// A template the daily job (`generate_due_expenses()` in SQL) turns into a due
// expense each month. The job owns *when*; everything here is display and the
// one rule the app must agree with it on — see `generatedMarker`.

/** Bills the job wrote that the owner has yet to confirm, any month, oldest first. */
export async function listDueExpenses(
  supabase: SupabaseClient,
  clientId: string
): Promise<Expense[]> {
  const { data } = await supabase
    .from("expenses")
    .select(SELECT)
    .eq("client_id", clientId)
    .eq("confirmed", false)
    .order("incurred_on", { ascending: true });

  return withReceipts(supabase, (data ?? []) as unknown as Row[]);
}

export type RecurringExpense = {
  id: string;
  amount: number;
  dayOfMonth: number;
  categoryId: string;
  categoryName: string;
  propertyId: string | null;
  propertyName: string | null;
  vendor: string | null;
  method: ExpenseMethod | null;
  note: string | null;
  active: boolean;
  lastGeneratedMonth: string | null;
};

const RECURRING_SELECT =
  "id, amount, day_of_month, category_id, property_id, vendor, method, note, active, last_generated_month, expense_categories(name), properties(name)";

type RecurringRow = {
  id: string;
  amount: number | string;
  day_of_month: number;
  category_id: string;
  property_id: string | null;
  vendor: string | null;
  method: string | null;
  note: string | null;
  active: boolean;
  last_generated_month: string | null;
  expense_categories: { name: string } | null;
  properties: { name: string } | null;
};

function toRecurring(r: RecurringRow): RecurringExpense {
  return {
    id: r.id,
    amount: Number(r.amount),
    dayOfMonth: r.day_of_month,
    categoryId: r.category_id,
    categoryName: r.expense_categories?.name ?? "Uncategorised",
    propertyId: r.property_id,
    propertyName: r.property_id ? (r.properties?.name ?? "Unit") : null,
    vendor: r.vendor,
    method: (r.method as ExpenseMethod | null) ?? null,
    note: r.note,
    active: r.active,
    lastGeneratedMonth: r.last_generated_month,
  };
}

/** Active ones first, then by the day they fall on. */
export async function listRecurring(
  supabase: SupabaseClient,
  clientId: string
): Promise<RecurringExpense[]> {
  const { data } = await supabase
    .from("recurring_expenses")
    .select(RECURRING_SELECT)
    .eq("client_id", clientId)
    .order("active", { ascending: false })
    .order("day_of_month", { ascending: true });

  return ((data ?? []) as unknown as RecurringRow[]).map(toRecurring);
}

export async function getRecurring(
  supabase: SupabaseClient,
  id: string
): Promise<RecurringExpense | null> {
  const { data } = await supabase
    .from("recurring_expenses")
    .select(RECURRING_SELECT)
    .eq("id", id)
    .maybeSingle();
  return data ? toRecurring(data as unknown as RecurringRow) : null;
}

/** Today in Karachi — the calendar the job runs on, not the server's UTC one. */
export function karachiToday(): string {
  return new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** The date a bill falls on in a month; 29–31 become the last day of a short month. */
export function dueDateIn(year: number, month0: number, dayOfMonth: number): string {
  const lastDay = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month0, Math.min(dayOfMonth, lastDay))).toISOString().slice(0, 10);
}

/**
 * What `last_generated_month` should say when a bill is set up, edited or
 * resumed. If this month's day has already gone by, this month counts as done —
 * the owner has most likely logged that one by hand, and the job would
 * otherwise write it the next morning. Otherwise it is left as it was, so the
 * job writes this month's when the day comes. Never moves backwards.
 */
export function generatedMarker(
  dayOfMonth: number,
  previous: string | null,
  today: string = karachiToday()
): string | null {
  const [y, m] = today.split("-").map(Number);
  const monthStart = `${today.slice(0, 7)}-01`;
  const passed = today >= dueDateIn(y, m - 1, dayOfMonth);
  if (!passed) return previous;
  return previous && previous >= monthStart ? previous : monthStart;
}

/** When the job will next write this bill as due. */
export function nextDueDate(r: RecurringExpense, today: string = karachiToday()): string {
  const [y, m] = today.split("-").map(Number);
  const monthStart = `${today.slice(0, 7)}-01`;
  const doneThisMonth = !!r.lastGeneratedMonth && r.lastGeneratedMonth >= monthStart;
  if (!doneThisMonth) {
    const thisMonth = dueDateIn(y, m - 1, r.dayOfMonth);
    // A day already past but not yet written means tomorrow morning's run.
    return thisMonth >= today ? thisMonth : today;
  }
  return m === 12 ? dueDateIn(y + 1, 0, r.dayOfMonth) : dueDateIn(y, m, r.dayOfMonth);
}

export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}

export type RecurringInput = {
  amount: number;
  dayOfMonth: number;
  categoryId: string;
  propertyId: string | null;
  vendor: string | null;
  method: ExpenseMethod | null;
  note: string | null;
};

export function readRecurringForm(
  formData: FormData
): { ok: true; value: RecurringInput } | { ok: false; error: string } {
  const text = (key: string) => (formData.get(key) as string | null)?.trim() || null;

  const amount = Number(text("amount"));
  const dayOfMonth = Number(text("day_of_month"));
  const categoryId = text("category_id");
  const unit = text("property_id");
  const method = text("method");

  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter what it usually comes to — more than zero." };
  }
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
    return { ok: false, error: "Pick the day of the month it's due." };
  }
  if (!categoryId) return { ok: false, error: "Pick a category." };
  if (method && !EXPENSE_METHODS.some((m) => m.value === method)) {
    return { ok: false, error: "Pick how it's paid." };
  }

  return {
    ok: true,
    value: {
      amount: Math.round(amount * 100) / 100,
      dayOfMonth,
      categoryId,
      propertyId: unit && unit !== "general" ? unit : null,
      vendor: text("vendor"),
      method: (method as ExpenseMethod | null) ?? null,
      note: text("note"),
    },
  };
}
