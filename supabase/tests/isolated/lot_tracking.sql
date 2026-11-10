\set ON_ERROR_STOP on
-- Đợt 4a (10/11/2026): lô / hạn dùng tùy chọn. Sổ lô đi theo mọi phát sinh kho:
-- nhập theo lô, bán hết hạn trước (bỏ qua lô hết hạn), trả/hủy về đúng lô,
-- xuất hủy chọn lô, trả hàng nhập, âm kho. Local PG only.
begin;
do $$ begin if current_database() <> 'lot_tracking_test' or inet_server_addr() is not null then raise exception 'ISOLATED_DATABASE_REQUIRED'; end if; end $$;
insert into app_private.permission_definitions(code,category,label,description)
select permission,'audit',permission,'Synthetic local audit' from unnest(array['sale.draft.manage','sale.complete','sale.cancel','sale.discount.apply','sale.own.read','sale.all.read','return.request.create','return.complete','purchase.post','purchase.cost.enter','purchase.reverse','report.all_revenue.read']) permission
on conflict (code) do nothing;
insert into auth.users(id,email) values ('10000000-0000-4000-8000-000000000001','lot-owner@example.invalid');
insert into api.profiles(id,email,display_name,role_template,must_change_password) values ('10000000-0000-4000-8000-000000000001','lot-owner@example.invalid','Chủ','OWNER',false);
insert into api.store_settings(id,display_name) values(1,'Synthetic lots');
insert into api.sales_channels(id,code,name,name_normalized) values('20000000-0000-4000-8000-000000000001','IN_STORE','Local lots','local lots');
insert into app_private.document_sequences(document_type,prefix) values('SALE','HD'),('SALE_RETURN','TH'),('PURCHASE_RECEIPT','PN') on conflict do nothing;
insert into api.products(id,sku,sku_normalized,name,name_normalized,unit_name,created_by,updated_by)
values('30000001-0000-4000-8000-000000000001','LOT1','lot1','Lot item','lot item','Box','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
-- Five boxes from before tracking: they start without a lot.
insert into api.inventory_balances(product_id,on_hand_qty) values('30000001-0000-4000-8000-000000000001',5) on conflict (product_id) do update set on_hand_qty=5;
insert into app_private.inventory_cost_balances(product_id,inventory_value,avg_unit_cost) values('30000001-0000-4000-8000-000000000001',500,100)
on conflict(product_id) do update set inventory_value=500,avg_unit_cost=100;
insert into app_private.product_sale_prices(product_id,sale_price,changed_by) values('30000001-0000-4000-8000-000000000001',1000,'10000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);

create function pg_temp.ok(r jsonb, label text) returns jsonb language plpgsql as $$
begin if r->>'ok' is distinct from 'true' then raise exception '% FAILED %', label, r; end if; return r; end $$;
create function pg_temp.code(r jsonb) returns text language sql as $$ select r#>>'{error,code}' $$;
create function pg_temp.p() returns uuid language sql as $$ select '30000001-0000-4000-8000-000000000001'::uuid $$;
create function pg_temp.lots() returns text language sql as $$
 select coalesce(string_agg(coalesce(l.lot_number,'-') || ':' || b.on_hand_qty, ',' order by l.expiry_date), '')
 from app_private.lot_balances b join app_private.product_lots l on l.id=b.lot_id where b.product_id=pg_temp.p() $$;
create function pg_temp.free() returns numeric language sql as $$ select app_private.unassigned_lot_qty(pg_temp.p()) $$;
create function pg_temp.lot(n text) returns uuid language sql as $$ select id from app_private.product_lots where lot_number=n $$;
create function pg_temp.sale(qty int) returns uuid language plpgsql as $$
declare saved jsonb; sid uuid;
begin
 saved:=pg_temp.ok(api.save_sale_draft(null,null,null,'20000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object('productId',pg_temp.p(),'quantity',qty::text,'lineDiscountAmount','0','lineOrder',1)),'0','Lot fixture',gen_random_uuid()),'SAVE');
 sid:=(saved#>>'{data,sale,id}')::uuid;
 perform pg_temp.ok(api.complete_sale_with_allocations(sid,(saved#>>'{data,sale,version}')::bigint,(qty*1000)::text,'0',gen_random_uuid(),null),'COMPLETE');
 return sid;
end $$;
create function pg_temp.receipt(qty int) returns uuid language plpgsql as $$
declare receipt uuid:=gen_random_uuid();
begin
 insert into api.purchase_receipts(id,status,received_at,created_by,submitted_by,submitted_at) values(receipt,'AWAITING_COST',now(),auth.uid(),auth.uid(),now());
 insert into api.purchase_receipt_lines(id,purchase_receipt_id,product_id,product_name,sku,unit_name,received_qty,line_order)
 select gen_random_uuid(),receipt,id,name,sku,unit_name,qty,0 from api.products where id=pg_temp.p();
 return receipt;
end $$;
create function pg_temp.post(receipt uuid) returns jsonb language sql as $$
 select api.post_purchase_receipt(receipt,1,jsonb_build_array(jsonb_build_object('lineId',(select id from api.purchase_receipt_lines where purchase_receipt_id=receipt),'unitCost','100')),gen_random_uuid()) $$;
create function pg_temp.reconciled() returns boolean language sql as $$
 select not exists (select 1 from app_private.lot_balances b left join (select lot_id, sum(quantity_delta) q from app_private.lot_movements group by 1) m using (lot_id)
  where coalesce(m.q,0) <> b.on_hand_qty)
 and (select on_hand_qty from api.inventory_balances where product_id=pg_temp.p())
  = coalesce((select sum(on_hand_qty) from app_private.lot_balances where product_id=pg_temp.p()),0) + pg_temp.free() $$;

-- Công tắc: tắt thì không chọn được chế độ; bật rồi mới theo lô.
do $$
declare f jsonb;
begin
 if pg_temp.code(api.set_product_tracking(pg_temp.p(),'LOT')) <> 'LOT_TRACKING_DISABLED' then raise exception 'TRACKING_WITHOUT_FEATURE'; end if;
 f:=pg_temp.ok(api.get_inventory_features(),'FEATURES');
 if (f#>>'{data,lotTrackingEnabled}')::boolean then raise exception 'FEATURE_ON_BY_DEFAULT'; end if;
 perform pg_temp.ok(api.set_inventory_features((f#>>'{data,version}')::bigint,true,90),'ENABLE');
 perform pg_temp.ok(api.set_product_tracking(pg_temp.p(),'LOT'),'TRACK');
 if pg_temp.code(api.set_inventory_features((f#>>'{data,version}')::bigint+1,false,90)) <> 'LOT_TRACKING_IN_USE' then raise exception 'DISABLED_WHILE_IN_USE'; end if;
 if pg_temp.free() <> 5 then raise exception 'OLD_STOCK_NOT_UNASSIGNED'; end if;
 raise notice 'PASS tracking is off by default and needs the store switch';
end $$;

-- Gán lô cho hàng cũ, không quá tồn chưa có lô.
do $$
begin
 if pg_temp.code(api.assign_unassigned_lots(pg_temp.p(),'[{"lotNumber":"OLD","expiryDate":"2026-12-01","quantity":"6"}]',gen_random_uuid())) <> 'LOT_ASSIGN_EXCEEDS_STOCK' then raise exception 'ASSIGN_OVER_STOCK'; end if;
 if pg_temp.code(api.assign_unassigned_lots(pg_temp.p(),'[{"expiryDate":"2026-12-01","quantity":"1"}]',gen_random_uuid())) <> 'LOT_DETAILS_INVALID' then raise exception 'LOT_WITHOUT_NUMBER'; end if;
 perform pg_temp.ok(api.assign_unassigned_lots(pg_temp.p(),'[{"lotNumber":"OLD","expiryDate":"2026-12-01","quantity":"3"},{"lotNumber":"X","expiryDate":"2026-01-01","quantity":"1"}]',gen_random_uuid()),'ASSIGN');
 if pg_temp.lots() <> 'X:1,OLD:3' or pg_temp.free() <> 1 or not pg_temp.reconciled() then raise exception 'ASSIGN_WRONG % %',pg_temp.lots(),pg_temp.free(); end if;
 raise notice 'PASS existing stock is assigned to lots without exceeding it';
end $$;

-- Nhập hàng: bắt buộc đủ lô trước khi ghi sổ.
do $$
declare r uuid;
begin
 r:=pg_temp.receipt(10);
 if pg_temp.code(pg_temp.post(r)) <> 'LOT_DETAILS_REQUIRED' then raise exception 'POST_WITHOUT_LOTS'; end if;
 if pg_temp.code(api.set_purchase_receipt_lots(r,jsonb_build_array(jsonb_build_object('productId',pg_temp.p(),'lots','[{"expiryDate":"2027-03-01","quantity":"10"}]'::jsonb)))) <> 'LOT_DETAILS_INVALID' then raise exception 'LOT_MODE_WITHOUT_NUMBER'; end if;
 if pg_temp.code(api.set_purchase_receipt_lots(r,jsonb_build_array(jsonb_build_object('productId',pg_temp.p(),'lots','[{"lotNumber":"A","expiryDate":"2027-03-01","quantity":"11"}]'::jsonb)))) <> 'LOT_DETAILS_INVALID' then raise exception 'LOTS_OVER_QTY'; end if;
 perform pg_temp.ok(api.set_purchase_receipt_lots(r,jsonb_build_array(jsonb_build_object('productId',pg_temp.p(),
  'lots','[{"lotNumber":"A","expiryDate":"2027-03-01","quantity":"6"},{"lotNumber":"B","expiryDate":"2027-09-01","quantity":"4"}]'::jsonb))),'SET_LOTS');
 perform pg_temp.ok(pg_temp.post(r),'POST');
 if pg_temp.lots() <> 'X:1,OLD:3,A:6,B:4' or pg_temp.free() <> 1 or not pg_temp.reconciled() then raise exception 'RECEIPT_LOTS_WRONG % %',pg_temp.lots(),pg_temp.free(); end if;
 raise notice 'PASS receipts post only with full lot details and fill those lots';
end $$;

-- Bán: lô còn hạn sớm nhất trước, không tự lấy lô đã hết hạn; trả/hủy về đúng lô.
do $$
declare s1 uuid; s2 uuid; r jsonb; rid uuid; rlid uuid; v bigint;
begin
 s1:=pg_temp.sale(4);
 if pg_temp.lots() <> 'X:1,OLD:0,A:5,B:4' then raise exception 'FEFO_WRONG %',pg_temp.lots(); end if;
 r:=pg_temp.ok(api.create_sale_return_request(s1,'Trả một hộp',jsonb_build_array(jsonb_build_object('originalSaleLineId',(select id from api.sale_lines where sale_id=s1),'requestedQty','1')),gen_random_uuid()),'RETURN_REQ');
 rid:=(r#>>'{data,returnId}')::uuid; select id into rlid from api.sale_return_lines where sale_return_id=rid;
 perform pg_temp.ok(api.complete_sale_return(rid,(r#>>'{data,version}')::bigint,jsonb_build_array(jsonb_build_object('saleReturnLineId',rlid,'acceptedQty','1')),'CASH',gen_random_uuid(),null),'RETURN');
 if pg_temp.lots() <> 'X:1,OLD:0,A:6,B:4' then raise exception 'RETURN_LOT_WRONG %',pg_temp.lots(); end if;
 s2:=pg_temp.sale(2);
 select version into v from api.sales where id=s2;
 perform pg_temp.ok(api.cancel_sale(s2,v,'Khách đổi ý',gen_random_uuid()),'CANCEL');
 if pg_temp.lots() <> 'X:1,OLD:0,A:6,B:4' or not pg_temp.reconciled() then raise exception 'CANCEL_LOT_WRONG %',pg_temp.lots(); end if;
 raise notice 'PASS sales take unexpired lots first; returns and cancels restore the same lots';
end $$;

-- Xuất hủy chọn lô; không chọn thì lô hết hạn trước. Trả hàng nhập lấy lô của phiếu đó.
do $$
declare r jsonb; rid uuid;
begin
 if pg_temp.code(api.post_stock_write_off(jsonb_build_array(jsonb_build_object('productId',pg_temp.p(),'quantity','5','lotId',pg_temp.lot('B'))),'DAMAGED',null,gen_random_uuid())) <> 'WRITE_OFF_LOT_INVALID' then raise exception 'WRITE_OFF_LOT_OVER'; end if;
 perform pg_temp.ok(api.post_stock_write_off(jsonb_build_array(jsonb_build_object('productId',pg_temp.p(),'quantity','1','lotId',pg_temp.lot('B'))),'DAMAGED',null,gen_random_uuid()),'WO_LOT');
 perform pg_temp.ok(api.post_stock_write_off(jsonb_build_array(jsonb_build_object('productId',pg_temp.p(),'quantity','2')),'EXPIRED',null,gen_random_uuid()),'WO_FEFO');
 if pg_temp.lots() <> 'X:0,OLD:0,A:5,B:3' then raise exception 'WRITE_OFF_LOTS_WRONG %',pg_temp.lots(); end if;
 select id into rid from api.purchase_receipts where status='POSTED';
 perform pg_temp.ok(api.post_purchase_return(rid,jsonb_build_array(jsonb_build_object('receiptLineId',(select id from api.purchase_receipt_lines where purchase_receipt_id=rid),'quantity','1')),'Lỗi','CASH',gen_random_uuid()),'PURCHASE_RETURN');
 if pg_temp.lots() <> 'X:0,OLD:0,A:4,B:3' or not pg_temp.reconciled() then raise exception 'PURCHASE_RETURN_LOT_WRONG %',pg_temp.lots(); end if;
 raise notice 'PASS write-offs use the chosen lot or expiry order; purchase returns take that receipt''s lots';
end $$;

-- Âm kho: bán vượt lô thì phần thiếu nằm ngoài lô; nhập lô mới bù phần thiếu trước.
do $$
declare r uuid;
begin
 -- On hand 8: lots A4 B3, 1 without a lot.
 perform pg_temp.sale(10);
 if pg_temp.lots() <> 'X:0,OLD:0,A:0,B:0' or pg_temp.free() <> -2 then raise exception 'NEGATIVE_SALE_WRONG % %',pg_temp.lots(),pg_temp.free(); end if;
 r:=pg_temp.receipt(5);
 perform pg_temp.ok(api.set_purchase_receipt_lots(r,jsonb_build_array(jsonb_build_object('productId',pg_temp.p(),'lots','[{"lotNumber":"C","expiryDate":"2028-01-01","quantity":"5"}]'::jsonb))),'SET_C');
 perform pg_temp.ok(pg_temp.post(r),'POST_C');
 if pg_temp.lots() <> 'X:0,OLD:0,A:0,B:0,C:3' or pg_temp.free() <> 0 or not pg_temp.reconciled() then raise exception 'SHORTAGE_FILL_WRONG % %',pg_temp.lots(),pg_temp.free(); end if;
 if pg_temp.code(api.set_product_tracking(pg_temp.p(),'NONE')) <> 'LOT_STOCK_REMAINS' then raise exception 'UNTRACK_WITH_STOCK'; end if;
 raise notice 'PASS negative stock stays outside lots and the next lot fills it first';
end $$;

-- Danh sách hạn dùng và sổ lô chỉ ghi thêm.
do $$
declare r jsonb; blocked int:=0;
begin
 r:=pg_temp.ok(api.list_product_lots('ALL',null,100),'LIST');
 if r#>'{data,summary}' <> '{"ok":1,"expired":0,"expiring":0}'::jsonb or jsonb_array_length(r#>'{data,items}') <> 1 or r#>>'{data,items,0,lotNumber}' <> 'C' then
  raise exception 'LIST_WRONG %',r->'data';
 end if;
 begin update app_private.lot_movements set quantity_delta=1; exception when sqlstate '55000' then blocked:=blocked+1; end;
 begin delete from app_private.lot_movements; exception when sqlstate '55000' then blocked:=blocked+1; end;
 if blocked<>2 then raise exception 'LOT_LEDGER_EDITABLE'; end if;
 if (select count(*) from app_private.audit_events where action in ('product.tracking_changed','lots.assigned','settings.inventory_features')) <> 3 then raise exception 'LOT_AUDIT_MISSING'; end if;
 raise notice 'PASS expiry list counts lots by status; the lot ledger is append-only';
end $$;
rollback;
