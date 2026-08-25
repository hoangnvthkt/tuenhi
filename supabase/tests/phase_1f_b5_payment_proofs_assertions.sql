do $$
declare
  v_bucket storage.buckets%rowtype;
begin
  select * into v_bucket from storage.buckets where id = 'payment-proofs';
  if not found or v_bucket.public or v_bucket.file_size_limit <> 5242880
    or v_bucket.allowed_mime_types is distinct from array['image/jpeg', 'image/png', 'image/webp']::text[] then
    raise exception 'payment-proofs bucket contract mismatch';
  end if;

  if not exists (
    select 1 from pg_attribute
    where attrelid = 'api.payments'::regclass and attname = 'transfer_proof_path' and not attisdropped
  ) or not exists (
    select 1 from pg_attribute
    where attrelid = 'api.sale_return_payments'::regclass and attname = 'transfer_proof_path' and not attisdropped
  ) then
    raise exception 'payment proof metadata columns are missing';
  end if;

  if not exists (select 1 from pg_proc where oid = 'api.complete_sale(uuid,bigint,text,uuid,text)'::regprocedure)
    or not exists (select 1 from pg_proc where oid = 'api.complete_sale_return(uuid,bigint,jsonb,text,uuid,text)'::regprocedure) then
    raise exception 'payment proof RPC contracts are missing';
  end if;

  if has_function_privilege('anon', 'api.complete_sale(uuid,bigint,text,uuid,text)', 'execute')
    or has_function_privilege('anon', 'api.complete_sale_return(uuid,bigint,jsonb,text,uuid,text)', 'execute')
    or not has_function_privilege('authenticated', 'api.complete_sale(uuid,bigint,text,uuid,text)', 'execute')
    or not has_function_privilege('authenticated', 'api.complete_sale_return(uuid,bigint,jsonb,text,uuid,text)', 'execute') then
    raise exception 'payment proof RPC grants mismatch';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'payment_proofs_%' and ('anon' = any(roles) or 'public' = any(roles))
  ) or (
    select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname like 'payment_proofs_%'
  ) <> 3 then
    raise exception 'payment proof storage policies mismatch';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'payment_proofs_%' and cmd in ('UPDATE', 'ALL')
  ) then
    raise exception 'payment proofs must be immutable';
  end if;
end;
$$;
