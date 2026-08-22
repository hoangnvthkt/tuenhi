alter function app_private.get_my_notifications_impl(
  boolean,
  timestamptz,
  uuid,
  integer
) volatile;

alter function api.get_my_notifications(
  boolean,
  timestamptz,
  uuid,
  integer
) volatile;
