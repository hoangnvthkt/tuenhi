import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260825021429_phase_1f_b4_staff_access_waiver.sql',
);

describe('staff access waiver migration', () => {
  it('keeps the Free-plan waiver separate from real Auth hardening', async () => {
    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toContain('staff_access_policy');
    expect(sql).toContain("'BLOCKED'");
    expect(sql).toContain("'OWNER_WAIVER'");
    expect(sql).toContain("'LEAKED_PASSWORD_PROTECTED'");
    expect(sql).toContain('record_staff_access_waiver_impl(p_reason text)');
    expect(sql).toContain('get_staff_access_capability_impl()');
    expect(sql).toContain("'project_lifecycle.staff_access_waived'");
    expect(sql).toContain('STAFF_ACCESS_POLICY_REQUIRED');
  });

  it('keeps lifecycle mutation service-only and the browser DTO minimal', async () => {
    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toMatch(
      /create function app_private\.record_staff_access_waiver_impl\(p_reason text\)[\s\S]*security definer[\s\S]*set search_path = ''/,
    );
    expect(sql).toMatch(
      /create function api\.get_staff_access_capability\(\)[\s\S]*security invoker[\s\S]*set search_path = ''/,
    );
    expect(sql).toContain(
      'grant execute on function api.get_staff_access_capability() to authenticated;',
    );
    expect(sql).toContain(
      'grant execute on function api.record_staff_access_waiver(text) to service_role;',
    );
    expect(sql).not.toContain("'cutoverAt', lifecycle.cutover_at");
  });
});
