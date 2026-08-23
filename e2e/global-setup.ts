import { createClient } from '@supabase/supabase-js';

export default async function globalSetup() {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const projectRef = process.env.SUPABASE_PROJECT_ID;
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (!url || !projectRef || !accessToken) {
    throw new Error(
      'Thiếu biến Cloud cần thiết để kiểm tra lifecycle trước E2E.',
    );
  }

  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/api-keys`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    throw new Error(
      'Không thể lấy service key tạm thời để kiểm tra lifecycle E2E.',
    );
  }
  const serviceKey = (await response.json()).find(
    (item: { name?: string; api_key?: string }) => item.name === 'service_role',
  )?.api_key;
  if (!serviceKey)
    throw new Error('Project không trả service_role key cho E2E.');

  const admin = createClient(url, serviceKey, { db: { schema: 'api' } });
  const { data, error } = await admin.rpc('get_project_lifecycle');
  if (error || data?.ok !== true || data?.data?.mode !== 'PRE_PRODUCTION') {
    throw new Error(
      `PRODUCTION_TEST_DATA_FORBIDDEN: E2E bị chặn khi môi trường không còn PRE_PRODUCTION (${String(data?.data?.mode ?? 'UNKNOWN')}).`,
    );
  }
}
