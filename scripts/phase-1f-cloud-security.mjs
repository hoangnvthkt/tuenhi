process.env.PHASE_TEST_PREFIX = 'phase1f';
process.env.PHASE_TEST_LABEL = 'Phase 1F';
process.env.PHASE_TEST_CLEANUP_RPC = 'cleanup_phase1f_test_users';

await import('./phase-1e-cloud-security.mjs');
