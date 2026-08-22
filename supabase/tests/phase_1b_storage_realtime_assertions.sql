begin;

do $$
declare
  v_bucket storage.buckets%rowtype;
  v_policy record;
  v_tables text[] := array['products', 'product_images', 'inventory_balances'];
  v_table text;
begin
  select * into v_bucket
  from storage.buckets
  where id = 'product-images';

  if not found then
    raise exception 'product-images bucket missing';
  end if;
  if v_bucket.public then
    raise exception 'product-images bucket must be private';
  end if;
  if v_bucket.file_size_limit is distinct from 5242880 then
    raise exception 'product-images bucket size limit must be 5 MiB';
  end if;
  if v_bucket.allowed_mime_types is distinct from
    array['image/jpeg', 'image/png', 'image/webp']::text[]
  then
    raise exception 'product-images MIME allowlist mismatch';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'product_images_%'
      and ('anon' = any(roles) or 'public' = any(roles))
  ) then
    raise exception 'anon/public must have no product image object policy';
  end if;

  if (
    select count(*)
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'product_images_%'
  ) <> 3 then
    raise exception 'product-images must have exactly select/insert/delete policies';
  end if;

  select * into v_policy
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and policyname = 'product_images_select';
  if not found
    or v_policy.cmd <> 'SELECT'
    or not ('authenticated' = any(v_policy.roles))
    or position('product-images' in coalesce(v_policy.qual, '')) = 0
    or position('catalog.read' in coalesce(v_policy.qual, '')) = 0
    or position('products/' in coalesce(v_policy.qual, '')) = 0
  then
    raise exception 'product image select policy mismatch';
  end if;

  select * into v_policy
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and policyname = 'product_images_insert';
  if not found
    or v_policy.cmd <> 'INSERT'
    or not ('authenticated' = any(v_policy.roles))
    or position('product-images' in coalesce(v_policy.with_check, '')) = 0
    or position('catalog.basic.manage' in coalesce(v_policy.with_check, '')) = 0
    or position('products/' in coalesce(v_policy.with_check, '')) = 0
  then
    raise exception 'product image insert policy mismatch';
  end if;

  select * into v_policy
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and policyname = 'product_images_delete';
  if not found
    or v_policy.cmd <> 'DELETE'
    or not ('authenticated' = any(v_policy.roles))
    or position('product-images' in coalesce(v_policy.qual, '')) = 0
    or position('catalog.basic.manage' in coalesce(v_policy.qual, '')) = 0
    or position('products/' in coalesce(v_policy.qual, '')) = 0
  then
    raise exception 'product image delete policy mismatch';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'product_images_%'
      and cmd in ('UPDATE', 'ALL')
  ) then
    raise exception 'product images must not have update/all object policy';
  end if;

  foreach v_table in array v_tables loop
    if (
      select count(*)
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'api'
        and tablename = v_table
    ) <> 1 then
      raise exception 'api.% must be in supabase_realtime exactly once', v_table;
    end if;
  end loop;
end;
$$;

rollback;
