import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import assert from 'node:assert/strict';

// Deliberately refuse TCP hosts. Fixture SQL additionally checks database names.
const host = process.env.TUENHI_ISOLATED_PG_HOST;
const port = process.env.TUENHI_ISOLATED_PG_PORT ?? '55439';
if (!host || !isAbsolute(host) || !/^\d+$/.test(port)) {
  throw new Error(
    'Set TUENHI_ISOLATED_PG_HOST to a disposable local Unix socket directory.',
  );
}
if (!(await stat(join(host, `.s.PGSQL.${port}`))).isSocket()) {
  throw new Error('ISOLATED_POSTGRES_SOCKET_REQUIRED');
}
const executable = process.env.TUENHI_PSQL ?? 'psql';
function query(database, sql, file) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      executable,
      [
        '-X',
        '-qAt',
        '-h',
        host,
        '-p',
        port,
        '-d',
        database,
        '-v',
        'ON_ERROR_STOP=1',
        ...(file ? ['-f', file] : []),
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let output = '';
    let error = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      error += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve(output.trim()) : reject(new Error(error)),
    );
    child.stdin.end(sql);
  });
}

const database = 'audit_remediation';
for (const file of [
  'checkout_confirmation_guards.sql',
  'inventory_form_guards.sql',
  'return_lifecycle_behavior.sql',
  'operational_pagination.sql',
]) {
  await query(database, undefined, `supabase/tests/isolated/${file}`);
  console.log(`PASS ${file}`);
}
// Only a pristine, disposable schema may be used for the two-connection case.
assert.equal(
  await query(database, 'select count(*) from auth.users;'),
  '0',
  'Isolated concurrency fixture requires empty Auth tables',
);
const { readFile } = await import('node:fs/promises');
let seed = (
  await readFile(
    'supabase/tests/isolated/return_lifecycle_behavior.sql',
    'utf8',
  )
).split('do $$\n<<checks>>')[0];
seed += `
 do $$ declare saved jsonb; result jsonb; begin
 saved:=api.save_sale_draft(null,null,null,'20000000-0000-4000-8000-000000000001','[{"productId":"30000000-0000-4000-8000-000000000001","quantity":"5","lineDiscountAmount":"0","lineOrder":0}]','0','Concurrent returns',gen_random_uuid());
 result:=api.complete_sale((saved#>>'{data,sale,id}')::uuid,(saved#>>'{data,sale,version}')::bigint,'CASH',gen_random_uuid(),null);
 if result->>'ok' is distinct from 'true' then raise exception 'CONCURRENCY_SEED_FAILED'; end if;
 end $$;
 commit;
`;
try {
  await query(database, seed);
  const request = `begin; select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true); select api.create_sale_return_request(s.id,'Concurrent request',jsonb_build_array(jsonb_build_object('originalSaleLineId',l.id,'requestedQty','3')),gen_random_uuid()) from api.sales s join api.sale_lines l on l.sale_id=s.id; select pg_sleep(0.15); commit;`;
  const responses = await Promise.all([
    query(database, request),
    query(database, request),
  ]);
  const results = responses.map((output) =>
    JSON.parse(output.split('\n').find((line) => line.startsWith('{'))),
  );
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(
    results.filter((result) => result.error?.code === 'RETURN_QTY_EXCEEDED')
      .length,
    1,
  );
  assert.equal(
    await query(
      database,
      'select sum(requested_qty) from api.sale_return_lines;',
    ),
    '3',
  );
  console.log('PASS concurrent requests reserve only available quantity');
} finally {
  // These tables started empty; cleanup is restricted to the allowlisted local DB.
  await query(
    database,
    `do $$ begin if current_database()<>'audit_remediation' or inet_server_addr() is not null then raise exception 'ISOLATED_DATABASE_REQUIRED'; end if; if exists(select 1 from auth.users where id<>'10000000-0000-4000-8000-000000000001') then raise exception 'UNEXPECTED_FIXTURE_USER'; end if; end $$; truncate auth.users cascade; truncate app_private.permission_definitions cascade; truncate api.sales_channels cascade; truncate api.store_settings cascade; truncate app_private.document_sequences cascade;`,
  );
}
