do $$
declare
  definition text;
  allowlist_block text;
  actual_allowlist text[];
  expected_allowlist constant text[] := array[
    'opening.post',
    'purchase.post',
    'purchase.reverse',
    'sale.cancel',
    'sale.complete',
    'sale.return.complete',
    'stock.count.post'
  ];
  role_name text;
  privilege_name text;
begin
  if to_regprocedure('app_private.get_my_command_outcome_impl(text,uuid)') is null
    or to_regprocedure('api.get_my_command_outcome(text,uuid)') is null then
    raise exception 'Phase 1F-B8 command outcome RPC contract is missing';
  end if;

  if not has_function_privilege(
    'authenticated',
    'api.get_my_command_outcome(text,uuid)',
    'execute'
  )
    or has_function_privilege(
      'anon',
      'api.get_my_command_outcome(text,uuid)',
      'execute'
    )
    or has_function_privilege(
      'service_role',
      'api.get_my_command_outcome(text,uuid)',
      'execute'
    ) then
    raise exception 'Phase 1F-B8 command outcome RPC grants are unsafe';
  end if;

  foreach role_name in array array['anon', 'authenticated'] loop
    foreach privilege_name in array array[
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE',
      'TRUNCATE',
      'REFERENCES',
      'TRIGGER'
    ] loop
      if has_table_privilege(
        role_name,
        'app_private.command_deduplication',
        privilege_name
      ) then
        raise exception '% has unexpected % privilege on private command responses',
          role_name,
          privilege_name;
      end if;
    end loop;
  end loop;

  if not (
    select p.prosecdef
    from pg_proc as p
    where p.oid = 'app_private.get_my_command_outcome_impl(text,uuid)'::regprocedure
  ) then
    raise exception 'private command outcome implementation must be security definer';
  end if;

  if exists (
    select 1
    from pg_proc as p
    where p.oid in (
      'app_private.get_my_command_outcome_impl(text,uuid)'::regprocedure,
      'api.get_my_command_outcome(text,uuid)'::regprocedure
    )
      and p.provolatile <> 'v'
  ) then
    raise exception 'command outcome functions must be volatile because they create correlation IDs';
  end if;

  definition := pg_get_functiondef(
    'app_private.get_my_command_outcome_impl(text,uuid)'::regprocedure
  );

  if position('auth.uid()' in definition) = 0
    or position('d.actor_id = v_actor_id' in definition) = 0 then
    raise exception 'command outcome lookup must be scoped to the authenticated actor';
  end if;

  allowlist_block := substring(
    definition
    from $pattern$v_command_name not in \(([^)]*)\)$pattern$
  );
  select array_agg(match[1] order by match[1])
  into actual_allowlist
  from regexp_matches(
    coalesce(allowlist_block, ''),
    $pattern$'([^']+)'$pattern$,
    'g'
  ) as match;

  if actual_allowlist is distinct from expected_allowlist then
    raise exception 'financial command allowlist differs: expected %, got %',
      expected_allowlist,
      actual_allowlist;
  end if;

  if position('RESOLVED' in definition) = 0
    or position('NOT_FOUND' in definition) = 0
    or position(
      $assert$jsonb_build_object('status', 'RESOLVED', 'response', v_response)$assert$
      in definition
    ) = 0 then
    raise exception 'command outcome lookup must distinguish resolved and missing results';
  end if;
end;
$$;
