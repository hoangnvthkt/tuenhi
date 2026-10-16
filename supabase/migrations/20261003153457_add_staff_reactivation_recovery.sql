-- Read-only resume gate. The original profile command owns the audit/reason;
-- a browser reload can resume Auth without storing the reason or replaying a write.
create function app_private.get_staff_reactivation_recovery_impl(p_user_id uuid, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 actor uuid := (select auth.uid());
 correlation uuid := gen_random_uuid();
 operation app_private.command_deduplication%rowtype;
 target api.profiles%rowtype;
begin
 if actor is null or not exists(select 1 from api.profiles p where p.id=actor and p.role_template='OWNER' and p.is_active and not p.must_change_password) then
  return app_private.command_error('PERMISSION_DENIED','Chỉ chủ cửa hàng được kiểm tra yêu cầu này.',correlation);
 end if;
 select * into operation from app_private.command_deduplication d where d.actor_id=actor and d.command_name='staff.set_active' and d.idempotency_key=p_idempotency_key;
 if not found then
  return app_private.command_error('STAFF_OPERATION_UNKNOWN','Chưa tìm thấy kết quả yêu cầu. Cần đối soát trước khi tiếp tục.',correlation);
 end if;
 select * into target from api.profiles p where p.id=p_user_id;
 if not found or operation.response#>>'{data,userId}' is distinct from p_user_id::text
   or operation.response#>>'{data,isActive}' is distinct from 'true'
   or not target.is_active or target.updated_at>operation.created_at then
  return app_private.command_error('STAFF_RECOVERY_STALE','Tài khoản đã thay đổi sau yêu cầu này. Vui lòng kiểm tra lại trạng thái.',correlation);
 end if;
 return app_private.command_success(jsonb_build_object('userId',p_user_id,'isActive',true,'operationFound',true),correlation);
end;
$$;
create function api.get_staff_reactivation_recovery(p_user_id uuid, p_idempotency_key uuid)
returns jsonb language sql security invoker set search_path = '' as $$
 select app_private.get_staff_reactivation_recovery_impl(p_user_id,p_idempotency_key);
$$;
revoke all on function app_private.get_staff_reactivation_recovery_impl(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function api.get_staff_reactivation_recovery(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function app_private.get_staff_reactivation_recovery_impl(uuid,uuid) to authenticated;
grant execute on function api.get_staff_reactivation_recovery(uuid,uuid) to authenticated;
