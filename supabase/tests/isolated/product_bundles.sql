\set ON_ERROR_STOP on
-- Gói hàng 11/11/2026: danh sách chọn nhanh, không có giá gói. Local PG only.
begin;
do $$ begin if current_database() <> 'product_bundles_test' or inet_server_addr() is not null then raise exception 'ISOLATED_DATABASE_REQUIRED'; end if; end $$;
insert into auth.users(id,email) values
 ('10000000-0000-4000-8000-000000000001','bundle-owner@example.invalid'),
 ('10000000-0000-4000-8000-000000000002','bundle-viewer@example.invalid');
insert into api.profiles(id,email,display_name,role_template,must_change_password) values
 ('10000000-0000-4000-8000-000000000001','bundle-owner@example.invalid','Synthetic owner','OWNER',false),
 ('10000000-0000-4000-8000-000000000002','bundle-viewer@example.invalid','Synthetic viewer','WAREHOUSE_VIEWER',false);
insert into api.products(id,sku,sku_normalized,name,name_normalized,unit_name,min_stock_qty,created_by,updated_by)
select ('3000000' || n || '-0000-4000-8000-000000000001')::uuid,'B'||n,'b'||n,'Thuốc '||n,'thuốc '||n,'Hộp',0,
 '10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001' from generate_series(1,3) n;
insert into app_private.product_sale_prices(product_id,sale_price,changed_by)
select id, 10000*substr(sku,2)::int,'10000000-0000-4000-8000-000000000001' from api.products where sku like 'B%';
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);

create function pg_temp.l(n int, q int) returns jsonb language sql as $$
 select jsonb_build_object('productId','3000000' || n || '-0000-4000-8000-000000000001','quantity',q::text) $$;

do $$
declare r jsonb; bid uuid; k uuid := gen_random_uuid(); audit int; b jsonb;
begin
 r:=api.save_product_bundle(null,null,'  Gói cảm cúm ',true,jsonb_build_array(pg_temp.l(2,2),pg_temp.l(1,1)),k);
 if r->>'ok' is distinct from 'true' then raise exception 'SAVE_FAILED %',r; end if;
 bid:=(r#>>'{data,bundleId}')::uuid;
 -- Gửi trùng: không tạo gói thứ hai.
 if (api.save_product_bundle(null,null,'Gói cảm cúm',true,jsonb_build_array(pg_temp.l(2,2),pg_temp.l(1,1)),k))#>>'{data,bundleId}' <> bid::text
   or (select count(*) from app_private.product_bundles)<>1 then raise exception 'IDEMPOTENCY_BROKEN'; end if;
 select count(*) into audit from app_private.audit_events where entity_id=bid and action='product_bundle.created';
 if audit<>1 then raise exception 'AUDIT_MISSING %',audit; end if;
 -- Giá lấy từ giá hiện hành, giữ thứ tự khai báo, không có giá gói.
 r:=api.list_product_bundles();
 b:=r#>'{data,items,0}';
 if b->>'name'<>'Gói cảm cúm' or b#>>'{lines,0,sku}'<>'B2' or b#>>'{lines,0,quantity}'<>'2'
   or (b#>>'{lines,0,currentSalePrice}')::numeric<>20000 or b#>>'{lines,1,sku}'<>'B1' or b ? 'bundlePrice' then
  raise exception 'LIST_WRONG %',b; end if;
 -- Sửa đúng phiên bản; sai phiên bản bị chặn.
 r:=api.save_product_bundle(bid,1,'Gói cảm cúm',true,jsonb_build_array(pg_temp.l(3,1)),gen_random_uuid());
 if r#>>'{data,version}'<>'2' then raise exception 'UPDATE_FAILED %',r; end if;
 if api.save_product_bundle(bid,1,'Gói cảm',true,jsonb_build_array(pg_temp.l(3,1)),gen_random_uuid())#>>'{error,code}'<>'VERSION_CONFLICT' then raise exception 'STALE_ACCEPTED'; end if;
 if (select count(*) from app_private.product_bundle_lines where bundle_id=bid)<>1 then raise exception 'LINES_NOT_REPLACED'; end if;
 -- Dữ liệu sai.
 if api.save_product_bundle(null,null,'A',true,'[]',gen_random_uuid())#>>'{error,code}'<>'VALIDATION_FAILED' then raise exception 'EMPTY_ACCEPTED'; end if;
 if api.save_product_bundle(null,null,'A',true,jsonb_build_array(pg_temp.l(1,1),pg_temp.l(1,2)),gen_random_uuid())#>>'{error,code}'<>'VALIDATION_FAILED' then raise exception 'DUPLICATE_LINE_ACCEPTED'; end if;
 if api.save_product_bundle(null,null,'A',true,jsonb_build_array(pg_temp.l(1,0)),gen_random_uuid())#>>'{error,code}'<>'VALIDATION_FAILED' then raise exception 'ZERO_QTY_ACCEPTED'; end if;
 if api.save_product_bundle(null,null,'GÓI  CẢM CÚM',true,jsonb_build_array(pg_temp.l(1,1)),gen_random_uuid())#>>'{error,code}'<>'DUPLICATE_IN_DATABASE' then raise exception 'DUPLICATE_NAME_ACCEPTED'; end if;
 -- Món ngừng kinh doanh vẫn hiện trong gói (để POS báo bỏ qua), không thêm mới được.
 update api.products set is_active=false where sku='B3';
 r:=api.list_product_bundles();
 if r#>>'{data,items,0,lines,0,isActive}'<>'false' then raise exception 'INACTIVE_LINE_HIDDEN %',r; end if;
 if api.save_product_bundle(null,null,'B',true,jsonb_build_array(pg_temp.l(3,1)),gen_random_uuid())#>>'{error,code}'<>'REFERENCE_NOT_FOUND' then raise exception 'INACTIVE_ACCEPTED'; end if;
 -- Ngừng gói: POS không thấy, trang quản lý vẫn thấy.
 r:=api.save_product_bundle(bid,2,'Gói cảm cúm',false,jsonb_build_array(pg_temp.l(3,1)),gen_random_uuid());
 if r->>'ok' is distinct from 'true' then raise exception 'DEACTIVATE_FAILED %',r; end if;
 if jsonb_array_length(api.list_product_bundles()#>'{data,items}')<>0 or jsonb_array_length(api.list_product_bundles(true)#>'{data,items}')<>1 then raise exception 'INACTIVE_FILTER_WRONG'; end if;
 raise notice 'PASS bundles save, list live prices, reject bad input, hide inactive';
end $$;

do $$
begin
 perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
 if api.save_product_bundle(null,null,'X',true,jsonb_build_array(pg_temp.l(1,1)),gen_random_uuid())#>>'{error,code}'<>'PERMISSION_DENIED' then raise exception 'SAVE_NOT_GATED'; end if;
 if api.list_product_bundles(true)#>>'{error,code}'<>'PERMISSION_DENIED' then raise exception 'INACTIVE_LIST_NOT_GATED'; end if;
 raise notice 'PASS bundle management is gated by catalog.basic.manage';
end $$;
rollback;
