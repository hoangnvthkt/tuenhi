export function isLifecycleEnvelope(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    value.ok === true &&
    typeof value.data === 'object' &&
    value.data !== null
  );
}

export async function getProjectLifecycle(admin) {
  const { data, error } = await admin.rpc('get_project_lifecycle');
  if (error || !isLifecycleEnvelope(data)) {
    throw new Error(
      'PROJECT_LIFECYCLE_UNAVAILABLE: Không thể kiểm tra trạng thái môi trường Cloud.',
    );
  }
  return data.data;
}

export function assertPreProductionAutomationAllowed(lifecycle) {
  if (lifecycle?.mode !== 'PRE_PRODUCTION') {
    throw new Error('PRODUCTION_TEST_DATA_FORBIDDEN');
  }
  return lifecycle;
}

export async function assertSyntheticTestsAllowed(admin) {
  const lifecycle = await getProjectLifecycle(admin);
  return assertPreProductionAutomationAllowed(lifecycle);
}
