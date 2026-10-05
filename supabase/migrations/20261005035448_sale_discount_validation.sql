begin;
-- Validate discounts before writing any draft rows; exceptions after mutation
-- unwind the whole command rather than returning partially updated drafts.
do $migration$
declare definition text; patch record;
begin
  definition:=pg_get_functiondef('app_private.save_sale_draft_impl(uuid,bigint,uuid,uuid,jsonb,text,text,uuid)'::regprocedure);
  for patch in select * from (values
  ($old$  begin v_order:=p_order_discount::numeric;$old$,
   $new$  if coalesce(p_order_discount,'') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
    or length(split_part(p_order_discount,'.',1)) > 18
    or exists(select from jsonb_to_recordset(p_lines) as x(quantity text,"lineDiscountAmount" text)
      where length(x.quantity)>18 or x.quantity='0'
        or coalesce(x."lineDiscountAmount",'0') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
        or length(split_part(coalesce(x."lineDiscountAmount",'0'),'.',1))>18) then
    return app_private.command_error('VALIDATION_FAILED','Số lượng hoặc giảm giá chưa hợp lệ.',v_correlation);
  end if;
  begin v_order:=p_order_discount::numeric;$new$),
  ($old$  if p_sale_id is null then insert into api.sales$old$,
   $new$  if exists(select from jsonb_to_recordset(p_lines) as x("productId" uuid,quantity text,"lineDiscountAmount" text)
    join app_private.product_sale_prices price on price.product_id=x."productId" and price.valid_to is null
    where coalesce(x."lineDiscountAmount",'0')::numeric > round(x.quantity::numeric*price.sale_price,2)) then
    return app_private.command_error('LINE_DISCOUNT_EXCEEDED','Giảm giá từng dòng không được vượt tiền hàng.',v_correlation);
  end if;
  if p_sale_id is null then insert into api.sales$new$),
  ($old$return app_private.command_error('LINE_DISCOUNT_EXCEEDED','Giảm giá từng dòng không được vượt tiền hàng.',v_correlation); end if;
  if (v_order$old$,
   $new$raise sqlstate 'PT001'; end if;
  if (v_order$new$),
  ($old$return app_private.command_error('PERMISSION_DENIED','Bạn không có quyền áp dụng giảm giá.',v_correlation);$old$,
   $new$raise sqlstate 'PT003';$new$),
  ($old$exception when others then return app_private.command_error('ORDER_DISCOUNT_EXCEEDED','Giảm giá toàn đơn vượt số tiền còn lại.',v_correlation);$old$,
   $new$exception when others then raise sqlstate 'PT002';$new$),
  ($old$exception when invalid_text_representation or numeric_value_out_of_range then$old$,
   $new$exception
 when sqlstate 'PT001' then return app_private.command_error('LINE_DISCOUNT_EXCEEDED','Giảm giá từng dòng không được vượt tiền hàng.',v_correlation);
 when sqlstate 'PT002' then return app_private.command_error('ORDER_DISCOUNT_EXCEEDED','Giảm giá toàn đơn vượt số tiền còn lại.',v_correlation);
 when sqlstate 'PT003' then return app_private.command_error('PERMISSION_DENIED','Bạn không có quyền áp dụng giảm giá.',v_correlation);
 when invalid_text_representation or numeric_value_out_of_range or check_violation then$new$)
  ) as changes(before_text,after_text) loop
    if position(patch.before_text in definition)=0 then raise exception 'SALE_DISCOUNT_CONTRACT_CHANGED'; end if;
    definition:=replace(definition,patch.before_text,patch.after_text);
  end loop;
  execute definition;
end $migration$;
commit;
