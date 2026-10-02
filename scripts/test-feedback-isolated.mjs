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

for (const [database, file] of [
  ['feedback_print', 'sales_provisional_print_behavior.sql'],
  ['feedback_access', 'warehouse_viewer_access.sql'],
  ['feedback_alerts', 'purchase-cancellation.sql'],
  ['feedback_alerts', 'low-stock-alerts.sql'],
]) {
  await query(database, undefined, `supabase/tests/isolated/${file}`);
  console.log(`PASS ${file}`);
}

const owner = '80000000-0000-4000-8000-000000000001';
const product = '80000000-0000-4000-8000-000000000002';
try {
  await query(
    'feedback_alerts',
    `
    do $$ begin if current_database()<>'feedback_alerts' then raise exception 'ISOLATED_DATABASE_REQUIRED'; end if; end $$;
    insert into auth.users(id) values ('${owner}');
    insert into api.profiles(id,email,display_name,role_template,is_active,must_change_password)
    values ('${owner}','concurrency@example.invalid','Concurrent fixture','OWNER',true,false);
    insert into api.products(id,sku,sku_normalized,name,name_normalized,unit_name,min_stock_qty,created_by,updated_by)
    values ('${product}','CONCURRENT','concurrent','Concurrent fixture','concurrent fixture','Hộp',50,'${owner}','${owner}');
    insert into api.inventory_balances(product_id,on_hand_qty) values ('${product}',50);
  `,
  );
  await Promise.all([
    query(
      'feedback_alerts',
      `begin; update api.inventory_balances set on_hand_qty=on_hand_qty-1 where product_id='${product}'; select pg_sleep(0.2); commit;`,
    ),
    query(
      'feedback_alerts',
      `begin; update api.inventory_balances set on_hand_qty=on_hand_qty-1 where product_id='${product}'; commit;`,
    ),
  ]);
  assert.equal(
    await query(
      'feedback_alerts',
      `select on_hand_qty from api.inventory_balances where product_id='${product}';`,
    ),
    '48',
  );
  assert.equal(
    await query(
      'feedback_alerts',
      `select count(*) from api.user_notifications where user_id='${owner}' and entity_id='${product}';`,
    ),
    '1',
  );
  console.log('PASS concurrent reductions create one low-stock episode');
} finally {
  await query(
    'feedback_alerts',
    `
    delete from api.user_notifications where entity_id='${product}' or user_id='${owner}';
    delete from api.inventory_balances where product_id='${product}';
    delete from api.products where id='${product}';
    delete from api.profiles where id='${owner}';
    delete from auth.users where id='${owner}';
  `,
  );
}
