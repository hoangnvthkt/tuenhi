import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertStaffLocalTarget } from './staff-auth-local-target.mjs';
test('refuses Cloud, credentials, alternate ports and redirect destinations before I/O', () => {
  for (const url of [
    'https://example.supabase.co',
    'http://127.0.0.1:54321',
    'http://localhost.evil.test:55321',
    'http://user:pass@localhost:55321',
    'http://localhost:55321/path',
  ])
    assert.throws(() => assertStaffLocalTarget(url));
  assert.equal(
    assertStaffLocalTarget('http://127.0.0.1:55321'),
    'http://127.0.0.1:55321',
  );
});
