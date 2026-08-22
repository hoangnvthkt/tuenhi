create function app_private.stringify_legacy_decimal(
  p_object jsonb,
  p_key text
)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select jsonb_set(
    p_object,
    array[p_key],
    case when p_object -> p_key is null or p_object -> p_key = 'null'::jsonb
      then 'null'::jsonb
      else to_jsonb(p_object ->> p_key)
    end
  );
$$;

create function app_private.stringify_legacy_list_decimals(p_response jsonb)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_items jsonb;
begin
  if coalesce((p_response ->> 'ok')::boolean, false) is not true then
    return p_response;
  end if;
  select coalesce(jsonb_agg(
    app_private.stringify_legacy_decimal(item, 'reportedNetTotal')
  ), '[]'::jsonb)
  into v_items
  from jsonb_array_elements(p_response #> '{data,items}') item;
  return jsonb_set(p_response, '{data,items}', v_items);
end;
$$;

create function app_private.stringify_legacy_detail_decimals(p_response jsonb)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_data jsonb;
  v_lines jsonb;
  v_line jsonb;
  v_key text;
begin
  if coalesce((p_response ->> 'ok')::boolean, false) is not true then
    return p_response;
  end if;
  v_data := p_response -> 'data';
  foreach v_key in array array[
    'reportedSubtotal', 'reportedDiscountTotal', 'reportedNetTotal'
  ] loop
    v_data := app_private.stringify_legacy_decimal(v_data, v_key);
  end loop;
  v_lines := '[]'::jsonb;
  for v_line in select value from jsonb_array_elements(v_data -> 'lines') loop
    foreach v_key in array array[
      'quantity', 'unitPrice', 'lineDiscount', 'lineTotal'
    ] loop
      v_line := app_private.stringify_legacy_decimal(v_line, v_key);
    end loop;
    v_lines := v_lines || jsonb_build_array(v_line);
  end loop;
  v_data := jsonb_set(v_data, '{lines}', v_lines);
  return jsonb_set(p_response, '{data}', v_data);
end;
$$;

create or replace function api.get_legacy_sales(
  p_filters jsonb default '{}'::jsonb,
  p_cursor_sold_on date default null,
  p_cursor_id uuid default null,
  p_limit integer default 30
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.stringify_legacy_list_decimals(
    app_private.get_legacy_sales_impl(
      p_filters, p_cursor_sold_on, p_cursor_id, p_limit
    )
  );
$$;

create or replace function api.get_legacy_sale(p_legacy_sale_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.stringify_legacy_detail_decimals(
    app_private.get_legacy_sale_impl(p_legacy_sale_id)
  );
$$;

revoke execute on function app_private.stringify_legacy_decimal(jsonb,text)
from public, anon;
revoke execute on function app_private.stringify_legacy_list_decimals(jsonb)
from public, anon;
revoke execute on function app_private.stringify_legacy_detail_decimals(jsonb)
from public, anon;
grant execute on function app_private.stringify_legacy_decimal(jsonb,text)
to authenticated;
grant execute on function app_private.stringify_legacy_list_decimals(jsonb)
to authenticated;
grant execute on function app_private.stringify_legacy_detail_decimals(jsonb)
to authenticated;
