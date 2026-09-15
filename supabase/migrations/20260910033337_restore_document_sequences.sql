-- A production-data disposition removed the sequence rows after the document
-- schemas were installed. Restore every supported type and advance each value
-- past any document number that may already exist.

insert into app_private.document_sequences as sequence (
  document_type,
  prefix,
  last_value
)
select
  'PURCHASE_RECEIPT',
  'PN',
  coalesce(max(substring(receipt_number from '([0-9]+)$')::bigint), 0)
from api.purchase_receipts
where receipt_number is not null
on conflict (document_type) do update
set prefix = excluded.prefix,
    last_value = greatest(sequence.last_value, excluded.last_value),
    updated_at = now();

insert into app_private.document_sequences as sequence (
  document_type,
  prefix,
  last_value
)
select
  'STOCK_COUNT',
  'KK',
  coalesce(max(substring(count_number from '([0-9]+)$')::bigint), 0)
from api.stock_counts
where count_number is not null
on conflict (document_type) do update
set prefix = excluded.prefix,
    last_value = greatest(sequence.last_value, excluded.last_value),
    updated_at = now();

insert into app_private.document_sequences as sequence (
  document_type,
  prefix,
  last_value
)
select
  'SALE',
  'HD',
  coalesce(max(substring(sale_number from '([0-9]+)$')::bigint), 0)
from api.sales
where sale_number is not null
on conflict (document_type) do update
set prefix = excluded.prefix,
    last_value = greatest(sequence.last_value, excluded.last_value),
    updated_at = now();

insert into app_private.document_sequences as sequence (
  document_type,
  prefix,
  last_value
)
select
  'SALE_RETURN',
  'TH',
  coalesce(max(substring(return_number from '([0-9]+)$')::bigint), 0)
from api.sale_returns
where return_number is not null
on conflict (document_type) do update
set prefix = excluded.prefix,
    last_value = greatest(sequence.last_value, excluded.last_value),
    updated_at = now();
