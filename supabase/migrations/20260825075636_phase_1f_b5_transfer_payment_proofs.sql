-- Phase 1F-B5: immutable proof images for new bank-transfer payments/refunds.
-- Storage data is manipulated exclusively through the Storage API; this migration
-- configures the bucket, RLS policies, and application-side metadata only.

alter table api.payments
  add column transfer_proof_path text;

alter table api.sale_return_payments
  add column transfer_proof_path text;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'payment-proofs',
  'payment-proofs',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create function app_private.payment_proof_path_is_owned(
  p_object_path text,
  p_transaction_kind text,
  p_transaction_id uuid,
  p_actor uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_actor is not null
    and p_object_path is not null
    and p_object_path ~ case p_transaction_kind
      when 'sale' then '^sales/' || p_transaction_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
      when 'return' then '^returns/' || p_transaction_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
      else '^$'
    end
    and exists (
      select 1
      from storage.objects object
      where object.bucket_id = 'payment-proofs'
        and object.name = p_object_path
        and object.owner_id = p_actor::text
    );
$$;

create function app_private.can_upload_payment_proof(p_object_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_object_path ~ '^sales/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
      then app_private.has_permission('sale.complete') and exists (
        select 1 from api.sales sale
        where sale.id = split_part(p_object_path, '/', 2)::uuid
          and sale.status = 'DRAFT'
          and sale.created_by = auth.uid()
      )
    when p_object_path ~ '^returns/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
      then app_private.has_permission('return.complete') and exists (
        select 1 from api.sale_returns sale_return
        where sale_return.id = split_part(p_object_path, '/', 2)::uuid
          and sale_return.status = 'REQUESTED'
      )
    else false
  end;
$$;

create function app_private.can_read_payment_proof(p_object_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_object_path ~ '^sales/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
      then app_private.has_permission('sale.own.read') and exists (
        select 1 from api.sales sale
        where sale.id = split_part(p_object_path, '/', 2)::uuid
          and sale.status <> 'DRAFT'
          and (sale.created_by = auth.uid() or app_private.has_permission('sale.all.read'))
      )
    when p_object_path ~ '^returns/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
      then (app_private.has_permission('return.request.create') or app_private.has_permission('return.complete'))
        and exists (
          select 1 from api.sale_returns sale_return
          where sale_return.id = split_part(p_object_path, '/', 2)::uuid
            and (sale_return.created_by = auth.uid() or app_private.has_permission('return.complete'))
        )
    else false
  end;
$$;

create function app_private.can_delete_unattached_payment_proof(p_object_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
      select 1 from api.payments payment
      where payment.transfer_proof_path = p_object_path
    )
    and not exists (
      select 1 from api.sale_return_payments payment
      where payment.transfer_proof_path = p_object_path
    );
$$;

create policy payment_proofs_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'payment-proofs'
  and app_private.can_read_payment_proof(name)
);

create policy payment_proofs_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'payment-proofs'
  and app_private.can_upload_payment_proof(name)
);

create policy payment_proofs_delete_unattached
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'payment-proofs'
  and owner_id = auth.uid()::text
  and app_private.can_delete_unattached_payment_proof(name)
);

create function app_private.complete_sale_with_payment_proof_impl(
  p_sale_id uuid,
  p_expected_version bigint,
  p_payment_method text,
  p_idempotency_key uuid,
  p_transfer_proof_path text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_correlation uuid := gen_random_uuid();
  v_result jsonb;
begin
  if p_payment_method = 'BANK_TRANSFER' and not app_private.payment_proof_path_is_owned(
    p_transfer_proof_path, 'sale', p_sale_id, v_actor
  ) then
    return app_private.command_error(
      'TRANSFER_PROOF_REQUIRED',
      'Giao dịch chuyển khoản cần một ảnh chứng từ hợp lệ.',
      v_correlation
    );
  end if;
  if p_payment_method = 'CASH' and p_transfer_proof_path is not null then
    return app_private.command_error(
      'TRANSFER_PROOF_INVALID',
      'Chỉ giao dịch chuyển khoản mới được đính kèm ảnh chứng từ.',
      v_correlation
    );
  end if;

  v_result := app_private.complete_sale_impl(
    p_sale_id, p_expected_version, p_payment_method, p_idempotency_key
  );

  if p_payment_method = 'BANK_TRANSFER' then
    update api.payments
    set transfer_proof_path = p_transfer_proof_path
    where sale_id = p_sale_id
      and method = 'BANK_TRANSFER'
      and status = 'CAPTURED';
  end if;
  return v_result;
end;
$$;

create function app_private.complete_sale_return_with_payment_proof_impl(
  p_return_id uuid,
  p_expected_version bigint,
  p_lines jsonb,
  p_refund_method text,
  p_idempotency_key uuid,
  p_transfer_proof_path text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_correlation uuid := gen_random_uuid();
  v_result jsonb;
begin
  if p_refund_method = 'BANK_TRANSFER' and not app_private.payment_proof_path_is_owned(
    p_transfer_proof_path, 'return', p_return_id, v_actor
  ) then
    return app_private.command_error(
      'TRANSFER_PROOF_REQUIRED',
      'Hoàn tiền chuyển khoản cần một ảnh chứng từ hợp lệ.',
      v_correlation
    );
  end if;
  if p_refund_method = 'CASH' and p_transfer_proof_path is not null then
    return app_private.command_error(
      'TRANSFER_PROOF_INVALID',
      'Chỉ hoàn tiền chuyển khoản mới được đính kèm ảnh chứng từ.',
      v_correlation
    );
  end if;

  v_result := app_private.complete_sale_return_impl(
    p_return_id, p_expected_version, p_lines, p_refund_method, p_idempotency_key
  );

  if p_refund_method = 'BANK_TRANSFER' then
    update api.sale_return_payments
    set transfer_proof_path = p_transfer_proof_path
    where sale_return_id = p_return_id
      and method = 'BANK_TRANSFER'
      and status = 'REFUNDED';
  end if;
  return v_result;
end;
$$;

create or replace function api.complete_sale(
  p_sale_id uuid,
  p_expected_version bigint,
  p_payment_method text,
  p_idempotency_key uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.complete_sale_with_payment_proof_impl(
    p_sale_id, p_expected_version, p_payment_method, p_idempotency_key, null
  );
$$;

create function api.complete_sale(
  p_sale_id uuid,
  p_expected_version bigint,
  p_payment_method text,
  p_idempotency_key uuid,
  p_transfer_proof_path text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.complete_sale_with_payment_proof_impl(
    p_sale_id, p_expected_version, p_payment_method, p_idempotency_key, p_transfer_proof_path
  );
$$;

create or replace function api.complete_sale_return(
  p_return_id uuid,
  p_expected_version bigint,
  p_lines jsonb,
  p_refund_method text,
  p_idempotency_key uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.complete_sale_return_with_payment_proof_impl(
    p_return_id, p_expected_version, p_lines, p_refund_method, p_idempotency_key, null
  );
$$;

create function api.complete_sale_return(
  p_return_id uuid,
  p_expected_version bigint,
  p_lines jsonb,
  p_refund_method text,
  p_idempotency_key uuid,
  p_transfer_proof_path text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.complete_sale_return_with_payment_proof_impl(
    p_return_id, p_expected_version, p_lines, p_refund_method, p_idempotency_key, p_transfer_proof_path
  );
$$;

create or replace function app_private.get_sale_invoice_impl(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_sale api.sales%rowtype;
  v_correlation uuid := gen_random_uuid();
begin
  if v_actor is null or not app_private.has_permission('sale.own.read') then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền xem hóa đơn.', v_correlation);
  end if;
  select * into v_sale from api.sales where id = p_sale_id;
  if not found or v_sale.status = 'DRAFT'
    or (v_sale.created_by <> v_actor and not app_private.has_permission('sale.all.read')) then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền xem hóa đơn này.', v_correlation);
  end if;
  return app_private.command_success(jsonb_build_object(
    'version', 2,
    'store', (select jsonb_build_object(
      'displayName', x.display_name, 'logoPath', x.logo_path, 'address', x.address,
      'contactPhone', x.contact_phone, 'zalo', x.zalo, 'invoiceFooter', x.invoice_footer
    ) from app_private.sale_invoice_store_snapshots x where x.sale_id = p_sale_id),
    'sale', jsonb_build_object(
      'id', v_sale.id, 'saleNumber', v_sale.sale_number, 'completedAt', v_sale.completed_at,
      'status', v_sale.status, 'channelCode', v_sale.sales_channel_code_snapshot,
      'channelName', v_sale.sales_channel_name_snapshot, 'staffName', v_sale.staff_name_snapshot,
      'customerName', v_sale.customer_name_snapshot, 'customerPhone', v_sale.customer_phone_snapshot,
      'paymentMethod', (select method from api.payments where sale_id = p_sale_id),
      'paymentStatus', (select status from api.payments where sale_id = p_sale_id),
      'transferProofPath', (select transfer_proof_path from api.payments where sale_id = p_sale_id),
      'cancelledAt', v_sale.cancelled_at, 'cancelReason', v_sale.cancel_reason
    ),
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
      'id', line.id, 'productName', line.product_name, 'sku', line.sku,
      'unitName', line.unit_name, 'quantity', line.quantity::text,
      'unitSalePrice', line.unit_sale_price::text, 'grossAmount', line.gross_amount::text,
      'lineDiscountAmount', line.line_discount_amount::text,
      'allocatedOrderDiscount', line.allocated_order_discount::text, 'netAmount', line.net_amount::text,
      'returnedQty', coalesce((select sum(return_line.accepted_qty) from api.sale_return_lines return_line
        join api.sale_returns return_document on return_document.id = return_line.sale_return_id
        where return_document.status = 'COMPLETED' and return_line.original_sale_line_id = line.id), 0)::text,
      'returnableQty', greatest(line.quantity - coalesce((select sum(return_line.accepted_qty)
        from api.sale_return_lines return_line join api.sale_returns return_document
          on return_document.id = return_line.sale_return_id
        where return_document.status = 'COMPLETED' and return_line.original_sale_line_id = line.id), 0), 0)::text
    ) order by line.line_order) from api.sale_lines line where line.sale_id = p_sale_id), '[]'::jsonb),
    'totals', jsonb_build_object(
      'subtotal', v_sale.subtotal::text, 'lineDiscountTotal', v_sale.line_discount_total::text,
      'orderDiscountTotal', v_sale.order_discount_total::text, 'netTotal', v_sale.net_total::text,
      'capturedAmount', (select amount::text from api.payments where sale_id = p_sale_id)
    ),
    'lifecycle', jsonb_build_object(
      'canReturn', v_sale.status in ('COMPLETED', 'PARTIALLY_RETURNED') and exists (
        select 1 from api.sale_lines line where line.sale_id = p_sale_id and line.quantity > coalesce((
          select sum(return_line.accepted_qty) from api.sale_return_lines return_line
          join api.sale_returns return_document on return_document.id = return_line.sale_return_id
          where return_document.status = 'COMPLETED' and return_line.original_sale_line_id = line.id
        ), 0)
      ),
      'canCancel', v_sale.status = 'COMPLETED' and not exists (
        select 1 from api.sale_returns return_document
        where return_document.original_sale_id = p_sale_id and return_document.status = 'COMPLETED'
      ),
      'returns', coalesce((select jsonb_agg(jsonb_build_object(
        'id', return_document.id, 'returnNumber', return_document.return_number,
        'status', return_document.status, 'reason', return_document.reason,
        'refundTotal', return_document.refund_total::text, 'createdAt', return_document.created_at,
        'completedAt', return_document.completed_at, 'cancelReason', return_document.cancel_reason
      ) order by return_document.created_at desc, return_document.id desc)
      from api.sale_returns return_document where return_document.original_sale_id = p_sale_id), '[]'::jsonb)
    )
  ), v_correlation);
end;
$$;

create or replace function app_private.get_sale_return_impl(p_return_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_correlation uuid := gen_random_uuid();
  v_return api.sale_returns%rowtype;
begin
  if v_actor is null or (not app_private.has_permission('return.request.create') and not app_private.has_permission('return.complete')) then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền xem yêu cầu trả hàng.', v_correlation);
  end if;
  select * into v_return from api.sale_returns where id = p_return_id;
  if not found or (v_return.created_by <> v_actor and not app_private.has_permission('return.complete')) then
    return app_private.command_error('PERMISSION_DENIED', 'Bạn không có quyền xem yêu cầu trả hàng này.', v_correlation);
  end if;
  return app_private.command_success(jsonb_build_object(
    'id', v_return.id, 'returnNumber', v_return.return_number, 'saleId', v_return.original_sale_id,
    'saleNumber', (select sale_number from api.sales where id = v_return.original_sale_id),
    'status', v_return.status, 'reason', v_return.reason, 'refundTotal', v_return.refund_total::text,
    'version', v_return.version, 'createdByName', (select display_name from api.profiles where id = v_return.created_by),
    'createdAt', v_return.created_at, 'completedAt', v_return.completed_at,
    'cancelReason', v_return.cancel_reason, 'canComplete', app_private.has_permission('return.complete'),
    'refundMethod', (select method from api.sale_return_payments where sale_return_id = p_return_id),
    'transferProofPath', (select transfer_proof_path from api.sale_return_payments where sale_return_id = p_return_id),
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
      'id', line.id, 'originalSaleLineId', line.original_sale_line_id, 'productId', line.product_id,
      'productName', line.product_name, 'sku', line.sku, 'unitName', line.unit_name,
      'requestedQty', line.requested_qty::text, 'acceptedQty', line.accepted_qty::text,
      'refundAmount', line.refund_amount::text, 'soldQty', sale_line.quantity::text,
      'returnedQtyBefore', coalesce((select sum(previous_line.accepted_qty)
        from api.sale_return_lines previous_line join api.sale_returns previous_return
          on previous_return.id = previous_line.sale_return_id
        where previous_return.status = 'COMPLETED' and previous_line.original_sale_line_id = line.original_sale_line_id
          and previous_line.sale_return_id <> v_return.id), 0)::text
    ) order by line.line_order) from api.sale_return_lines line
      join api.sale_lines sale_line on sale_line.id = line.original_sale_line_id
    where line.sale_return_id = v_return.id), '[]'::jsonb)
  ), v_correlation);
end;
$$;

revoke all on function
  app_private.payment_proof_path_is_owned(text,text,uuid,uuid),
  app_private.can_upload_payment_proof(text),
  app_private.can_read_payment_proof(text),
  app_private.can_delete_unattached_payment_proof(text),
  app_private.complete_sale_with_payment_proof_impl(uuid,bigint,text,uuid,text),
  app_private.complete_sale_return_with_payment_proof_impl(uuid,bigint,jsonb,text,uuid,text)
from public, anon, authenticated;
grant execute on function
  app_private.can_upload_payment_proof(text),
  app_private.can_read_payment_proof(text),
  app_private.can_delete_unattached_payment_proof(text)
to authenticated;

revoke all on function
  api.complete_sale(uuid,bigint,text,uuid,text),
  api.complete_sale_return(uuid,bigint,jsonb,text,uuid,text)
from public, anon;
grant execute on function
  api.complete_sale(uuid,bigint,text,uuid),
  api.complete_sale(uuid,bigint,text,uuid,text),
  api.complete_sale_return(uuid,bigint,jsonb,text,uuid),
  api.complete_sale_return(uuid,bigint,jsonb,text,uuid,text)
to authenticated;
