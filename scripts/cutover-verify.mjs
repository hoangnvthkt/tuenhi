import { applicationCounts, adminClient } from './cutover-lib.mjs';
import { getProjectLifecycle } from './project-lifecycle.mjs';

const admin = await adminClient();
const [lifecycle, counts, inventory] = await Promise.all([
  getProjectLifecycle(admin),
  applicationCounts(admin),
  admin
    .from('inventory_balances')
    .select('product_id')
    .then(({ data, error }) => {
      if (error)
        throw new Error(`Không thể đọc inventory balances: ${error.message}`);
      return data ?? [];
    }),
]);
console.log(
  JSON.stringify(
    {
      lifecycle,
      applicationCounts: counts,
      inventory: { balanceRows: inventory.length },
      note: 'Đối soát financial events/revenue/profit dùng owner report theo checklist UAT; script này không đọc private ledger qua Data API.',
    },
    null,
    2,
  ),
);
