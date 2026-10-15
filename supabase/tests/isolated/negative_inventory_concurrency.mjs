// Synthetic fixtures only. Requires an empty disposable database; never accepts TCP.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

const host = process.env.TUENHI_ISOLATED_PG_HOST;
const port = process.env.TUENHI_ISOLATED_PG_PORT ?? '55441';
const executable = process.env.TUENHI_PSQL ?? 'psql';
const database = 'pos_negative_stock';
const owner = '96000000-0000-4000-8000-000000000001';
if (!host || !isAbsolute(host) || !/^\d+$/.test(port)) {
  throw new Error('ISOLATED_POSTGRES_UNIX_SOCKET_REQUIRED');
}
if (!(await stat(join(host, `.s.PGSQL.${port}`))).isSocket()) {
  throw new Error('ISOLATED_POSTGRES_SOCKET_REQUIRED');
}
function query(sql) {
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
const guard = `do $$ begin if current_database()<>'pos_negative_stock' or inet_server_addr() is not null then raise exception 'ISOLATED_DATABASE_REQUIRED'; end if; end $$;`;
const request = (sql) =>
  query(
    `set statement_timeout='10s'; begin; select set_config('request.jwt.claim.sub','${owner}',true); ${sql} commit;`,
  );
await query(guard);
assert.equal(
  await query('select count(*) from auth.users;'),
  '0',
  'Concurrency tests require a pristine disposable fixture',
);
const fixture = (
  await readFile(new URL('./negative_inventory.sql', import.meta.url), 'utf8')
)
  .split('-- The first regression')[0]
  .replace('begin;', 'begin; create schema _negative_inventory_test;')
  .replaceAll('pg_temp.', '_negative_inventory_test.');
let seeded = false;
try {
  await query(fixture + '\ncommit;');
  seeded = true;
  const product = (
    await request(
      "select _negative_inventory_test.product('CONCURRENT-NEGATIVE');",
    )
  )
    .split('\n')
    .at(-1);
  await Promise.all([
    request(
      `select _negative_inventory_test.sell('${product}',3); select pg_sleep(0.15);`,
    ),
    request(`select _negative_inventory_test.sell('${product}',4);`),
  ]);
  assert.equal(
    await query(
      `select on_hand_qty from api.inventory_balances where product_id='${product}';`,
    ),
    '-7',
  );
  await Promise.all([
    request(
      `select _negative_inventory_test.restock('${product}',2,7); select pg_sleep(0.15);`,
    ),
    request(`select _negative_inventory_test.restock('${product}',5,11);`),
  ]);
  assert.equal(
    await query(
      `select on_hand_qty from api.inventory_balances where product_id='${product}';`,
    ),
    '0',
  );
  assert.equal(
    await query(
      `select sum(c.cogs_total_snapshot) from app_private.sale_line_costs c join api.sale_lines l on l.id=c.sale_line_id where l.product_id='${product}';`,
    ),
    '69.00',
  );
  assert.equal(
    await query(
      `select sum(remaining_qty) from app_private.sale_inventory_shortages where product_id='${product}';`,
    ),
    '0',
  );
  console.log(
    'PASS concurrent oversales and replenishments serialize quantities and actual COGS',
  );

  const returned = (
    await request(`select _negative_inventory_test.sell('${product}',5);`)
  )
    .split('\n')
    .at(-1);
  await Promise.all([
    request(
      `select _negative_inventory_test.return_units('${returned}',2); select pg_sleep(0.15);`,
    ),
    request(`select _negative_inventory_test.restock('${product}',4,9);`),
  ]);
  assert.equal(
    await query(
      `select on_hand_qty from api.inventory_balances where product_id='${product}';`,
    ),
    '1',
  );
  assert.equal(
    await query(
      `select sum(cogs_delta) from app_private.inventory_cost_movements;`,
    ),
    await query(
      'select sum(cogs_delta) from app_private.sales_financial_events;',
    ),
  );
  assert.equal(
    await query(
      `select sum(c.inventory_value)+(select sum(cogs_delta) from app_private.sales_financial_events) from app_private.inventory_cost_balances c;`,
    ),
    '105.00',
  );
  console.log(
    'PASS concurrent return and restock avoid deadlock and conserve purchase cost',
  );

  const cancelled = (
    await request(`select _negative_inventory_test.sell('${product}',5);`)
  )
    .split('\n')
    .at(-1);
  await Promise.all([
    request(
      `select _negative_inventory_test.cancel('${cancelled}'); select pg_sleep(0.15);`,
    ),
    request(`select _negative_inventory_test.restock('${product}',4,13);`),
  ]);
  assert.equal(
    await query(
      `select on_hand_qty from api.inventory_balances where product_id='${product}';`,
    ),
    '5',
  );
  assert.equal(
    await query(
      `select sum(cogs_delta) from app_private.inventory_cost_movements;`,
    ),
    await query(
      'select sum(cogs_delta) from app_private.sales_financial_events;',
    ),
  );
  assert.equal(
    await query(
      `select sum(c.inventory_value)+(select sum(cogs_delta) from app_private.sales_financial_events) from app_private.inventory_cost_balances c;`,
    ),
    '157.00',
  );
  console.log(
    'PASS concurrent cancellation and restock avoid deadlock and conserve purchase cost',
  );
} finally {
  if (seeded) {
    await query(`${guard}
      do $$ begin if exists(select 1 from auth.users where id<>'${owner}') then raise exception 'UNEXPECTED_FIXTURE_USER'; end if; end $$;
      truncate auth.users cascade;
      delete from app_private.permission_definitions where category='negative-inventory';
      truncate api.sales_channels cascade;
      truncate api.store_settings cascade;
      truncate app_private.document_sequences cascade;
      drop schema _negative_inventory_test cascade;`);
  }
}
