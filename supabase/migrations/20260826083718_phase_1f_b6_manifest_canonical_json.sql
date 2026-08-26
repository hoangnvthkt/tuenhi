create or replace function app_private.get_owner_pilot_mock_manifest_impl(
  p_keep_store_settings boolean,
  p_keep_sales_channels boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lifecycle app_private.project_lifecycle%rowtype;
  v_manifest jsonb;
  v_canonical_json text;
  v_correlation uuid := extensions.gen_random_uuid();
begin
  if auth.role() <> 'service_role' then
    return app_private.command_error(
      'PERMISSION_DENIED',
      'Chỉ script cutover được xác nhận mới có thể tạo manifest dữ liệu mock.',
      v_correlation
    );
  end if;

  if p_keep_store_settings is null or p_keep_sales_channels is null then
    return app_private.command_error(
      'VALIDATION_ERROR',
      'Cần xác định rõ giữ hay thay cấu hình cửa hàng và kênh bán.',
      v_correlation
    );
  end if;

  select * into v_lifecycle
  from app_private.project_lifecycle
  where id = true;

  if v_lifecycle.mode <> 'OWNER_PILOT'
    or v_lifecycle.staff_access_policy not in ('OWNER_WAIVER', 'LEAKED_PASSWORD_PROTECTED') then
    return app_private.command_error(
      'INVALID_STATE',
      'Chỉ có thể tạo manifest khi Owner Pilot đang được bảo vệ bằng policy nhân viên đã audit.',
      v_correlation
    );
  end if;

  if exists (select 1 from app_private.owner_pilot_mock_disposition_receipts) then
    return app_private.command_error(
      'MOCK_DISPOSITION_ALREADY_RECORDED',
      'Cloud đã có receipt hủy mock; không thể tạo thêm manifest reset.',
      v_correlation
    );
  end if;

  v_manifest := app_private.owner_pilot_mock_manifest_payload(
    p_keep_store_settings,
    p_keep_sales_channels
  );
  v_canonical_json := v_manifest::text;

  return app_private.command_success(
    jsonb_build_object(
      'manifest', v_manifest,
      'canonicalJson', v_canonical_json,
      'sha256', app_private.owner_pilot_mock_manifest_sha256(v_manifest)
    ),
    v_correlation
  );
end;
$$;
