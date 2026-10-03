-- Add inventory-only access without changing existing employee templates.
alter table api.profiles drop constraint profiles_role_template_check;
alter table api.profiles add constraint profiles_role_template_check
  check (role_template in ('SALES_WAREHOUSE', 'BUSINESS', 'WAREHOUSE_VIEWER', 'OWNER'));
alter table app_private.role_default_permissions drop constraint role_default_permissions_role_template_check;
alter table app_private.role_default_permissions add constraint role_default_permissions_role_template_check
  check (role_template in ('SALES_WAREHOUSE', 'BUSINESS', 'WAREHOUSE_VIEWER'));
insert into app_private.role_default_permissions(role_template, permission_code, allowed)
select 'WAREHOUSE_VIEWER', code, code in ('catalog.read', 'inventory.read')
from app_private.permission_definitions;

-- Private target-user helper also supports permission-aware notification recipients.
-- The viewer allowlist precedes overrides, so historical GRANTs cannot escalate.
create function app_private.effective_permission_for_user(p_user_id uuid, p_permission_code text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when p.role_template = 'OWNER' then true
      when p.role_template = 'WAREHOUSE_VIEWER' and d.code not in ('catalog.read', 'inventory.read') then false
      when d.owner_only then false
      when o.effect = 'REVOKE' then false
      when o.effect = 'GRANT' then true
      else coalesce(r.allowed, false)
    end
    from api.profiles p
    join app_private.permission_definitions d on d.code = p_permission_code
    left join app_private.role_default_permissions r
      on r.role_template = p.role_template and r.permission_code = d.code
    left join app_private.user_permission_overrides o
      on o.user_id = p.id and o.permission_code = d.code
    where p.id = p_user_id and p.is_active and not p.must_change_password
  ), false);
$$;
revoke all on function app_private.effective_permission_for_user(uuid,text) from public, anon, authenticated;

create or replace function app_private.has_permission(p_permission_code text)
returns boolean language sql stable security definer set search_path = '' as $$
  select app_private.effective_permission_for_user((select auth.uid()), p_permission_code);
$$;

-- Administrative permission summaries preserve the existing inactive-profile
-- behavior, but respect the same non-escalating viewer boundary.
create or replace function app_private.effective_permissions_for(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(d.code order by d.code), '[]'::jsonb)
  from api.profiles p
  join app_private.permission_definitions d on true
  left join app_private.role_default_permissions r
    on r.role_template = p.role_template and r.permission_code = d.code
  left join app_private.user_permission_overrides o
    on o.user_id = p.id and o.permission_code = d.code
  where p.id = p_user_id
    and (p.role_template <> 'WAREHOUSE_VIEWER' or d.code in ('catalog.read', 'inventory.read'))
    and (p.role_template = 'OWNER' or (not d.owner_only and case
      when o.effect = 'REVOKE' then false
      when o.effect = 'GRANT' then true
      else coalesce(r.allowed, false)
    end));
$$;

-- Retain current command idempotency, lifecycle guards, grants and volatility.
-- Every surgical update fails closed if the reviewed source contract has drifted.
do $migration$
declare
  patch record;
  definition text;
begin
  for patch in select * from (values
    (
      'app_private.finalize_staff_profile_impl(uuid,text,text,text,uuid,uuid)',
      $old$p_role_template not in ('SALES_WAREHOUSE', 'BUSINESS', 'OWNER')$old$,
      $new$p_role_template not in ('SALES_WAREHOUSE', 'BUSINESS', 'WAREHOUSE_VIEWER', 'OWNER')$new$
    ),
    (
      'app_private.set_staff_role_impl(uuid,text,text,uuid)',
      $old$p_role not in ('SALES_WAREHOUSE', 'BUSINESS', 'OWNER')$old$,
      $new$p_role not in ('SALES_WAREHOUSE', 'BUSINESS', 'WAREHOUSE_VIEWER', 'OWNER')$new$
    ),
    (
      'app_private.set_staff_role_impl(uuid,text,text,uuid)',
      $old$if p_role = 'OWNER' then$old$,
      $new$if p_role in ('OWNER', 'WAREHOUSE_VIEWER') then$new$
    ),
    (
      'app_private.get_my_session_context_impl()',
      $old$not d.owner_only$old$,
      $new$not d.owner_only and app_private.has_permission(d.code)$new$
    ),
    (
      'app_private.list_staff_impl(timestamp with time zone,uuid,integer)',
      $old$'businessDefault', coalesce(b.allowed, false)$old$,
      $new$'businessDefault', coalesce(b.allowed, false),
        'warehouseViewerDefault', d.code in ('catalog.read', 'inventory.read')$new$
    ),
    (
      'app_private.set_staff_permission_override_impl(uuid,text,text,text,uuid)',
      $old$  if p_effect = 'GRANT' and permission_definition.owner_only then$old$,
      $new$  if p_effect = 'GRANT' and target_profile.role_template = 'WAREHOUSE_VIEWER'
    and p_permission_code not in ('catalog.read', 'inventory.read') then
    return app_private.command_error('PERMISSION_DENIED',
      'Tài khoản kho chỉ được xem hàng hóa và tồn kho.', correlation_id);
  end if;

  if p_effect = 'GRANT' and permission_definition.owner_only then$new$
    ),
    (
      'app_private.reject_invalid_permission_override()',
      $old$  if new.effect = 'GRANT' and permission_is_owner_only then$old$,
      $new$  if new.effect = 'GRANT' and target_role = 'WAREHOUSE_VIEWER'
    and new.permission_code not in ('catalog.read', 'inventory.read') then
    raise exception using errcode = 'P0001', message = 'WAREHOUSE_VIEWER_PERMISSION_NOT_ALLOWED';
  end if;

  if new.effect = 'GRANT' and permission_is_owner_only then$new$
    ),
    (
      'app_private.get_product_catalog_impl(text,uuid,text,boolean,text,uuid,integer)',
      $old$'currentSalePrice', c.current_sale_price::text$old$,
      $new$'currentSalePrice', case when app_private.has_permission('pricing.sale.read') then c.current_sale_price::text else null end$new$
    ),
    (
      'app_private.get_product_detail_impl(uuid)',
      $old$'currentSalePrice', c.current_sale_price::text$old$,
      $new$'currentSalePrice', case when app_private.has_permission('pricing.sale.read') then c.current_sale_price::text else null end$new$
    ),
    (
      'app_private.get_product_detail_impl(uuid)',
      $old$'salePriceValidFrom', c.sale_price_valid_from$old$,
      $new$'salePriceValidFrom', case when app_private.has_permission('pricing.sale.read') then c.sale_price_valid_from else null end$new$
    )
  ) as changes(signature, before_text, after_text)
  loop
    select pg_get_functiondef(patch.signature::regprocedure) into definition;
    if position(patch.before_text in definition) = 0 then
      raise exception 'WAREHOUSE_VIEWER_MIGRATION_CONTRACT_CHANGED: %', patch.signature;
    end if;
    execute replace(definition, patch.before_text, patch.after_text);
  end loop;
end
$migration$;
