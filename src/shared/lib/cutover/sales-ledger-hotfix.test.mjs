import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260824092004_fix_sales_cogs_and_return_validation.sql',
);
const returnValidationMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260824092350_clarify_return_request_validation.sql',
);

describe('sales ledger hotfix migration', () => {
  it('records completed-sale COGS and corrects only under-recorded events with an audit trail', async () => {
    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toContain('v_total_cogs numeric(20,2) := 0;');
    expect(sql).toContain('v_total_cogs := v_total_cogs + v_cogs;');
    expect(sql).toMatch(
      /net_revenue,cogs_delta,attributed_user_id[\s\S]*v_sale\.net_total,v_total_cogs/,
    );
    expect(sql).toContain("event.event_type = 'SALE_COMPLETED'");
    expect(sql).toContain("'sales_financial_event.cogs_corrected'");
  });

  it('gives an explicit stable code when a return request line payload is invalid', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    const returnValidationSql = await readFile(
      returnValidationMigrationPath,
      'utf8',
    );

    expect(sql.match(/'RETURN_REQUEST_LINES_INVALID'/g)).toHaveLength(2);
    expect(returnValidationSql).toContain("'RETURN_REQUEST_LINES_INVALID'");
    expect(returnValidationSql).toContain(
      'Có dòng hàng không thuộc hóa đơn gốc.',
    );
  });
});
