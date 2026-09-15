begin;

do $$
declare
  v_missing text;
begin
  select string_agg(expected.document_type || ' (' || expected.prefix || ')', ', ' order by expected.document_type)
  into v_missing
  from (
    values
      ('PURCHASE_RECEIPT', 'PN'),
      ('STOCK_COUNT', 'KK'),
      ('SALE', 'HD'),
      ('SALE_RETURN', 'TH')
  ) as expected(document_type, prefix)
  where not exists (
    select 1
    from app_private.document_sequences sequence
    where sequence.document_type = expected.document_type
      and sequence.prefix = expected.prefix
  );

  if v_missing is not null then
    raise exception 'Missing document sequence configuration: %', v_missing;
  end if;
end;
$$;

rollback;
