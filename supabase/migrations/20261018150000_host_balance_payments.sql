-- Host mode: a host has no Hostello to approve a guest payment, so the payment they
-- record counts at once. It can only ever be money the host received themselves.
-- Applied to the live DB as `host_balance_payments` on 2026-10-18.
create policy "booking_payments: host records own" on public.booking_payments
  for insert to authenticated
  with check (status = 'received' and received_by = 'owner' and owns_host_client(client_id));

create policy "booking_payments: host removes own" on public.booking_payments
  for delete to authenticated
  using (owns_host_client(client_id));
