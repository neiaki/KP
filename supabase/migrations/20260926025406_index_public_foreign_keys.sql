-- Index untuk foreign key publik yang belum memiliki index pendahulu.
-- Idempoten dan tidak mengubah data.

create index if not exists service_tickets_customer_id_idx
  on public.service_tickets (customer_id);

create index if not exists trade_in_records_resulting_unit_id_idx
  on public.trade_in_records (resulting_unit_id);

create index if not exists trade_in_records_transaction_id_idx
  on public.trade_in_records (transaction_id);

create index if not exists transaction_items_unit_id_idx
  on public.transaction_items (unit_id);

create index if not exists transactions_customer_id_idx
  on public.transactions (customer_id);
