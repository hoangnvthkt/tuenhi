import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const WORKSPACE = resolve(process.cwd());

export function required(...names) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`Thiếu biến môi trường bắt buộc: ${names.join(' hoặc ')}`);
}

export async function adminClient() {
  const url = required('SUPABASE_URL', 'VITE_SUPABASE_URL');
  let serviceKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!serviceKey) {
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${required('SUPABASE_PROJECT_ID')}/api-keys`,
      {
        headers: {
          Authorization: `Bearer ${required('SUPABASE_ACCESS_TOKEN')}`,
        },
      },
    );
    if (!response.ok)
      throw new Error('Không thể lấy service key tạm thời cho cutover.');
    serviceKey = (await response.json()).find(
      (item) => item.name === 'service_role',
    )?.api_key;
    if (!serviceKey)
      throw new Error('Project không trả service_role key cho cutover.');
  }
  return createClient(url, serviceKey, {
    db: { schema: 'api' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function hasFlag(name) {
  return process.argv.slice(2).includes(name);
}

export function valueForFlag(name, args = process.argv.slice(2)) {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;
  const assignment = args.find((argument) => argument.startsWith(`${name}=`));
  return assignment ? assignment.slice(name.length + 1) || null : null;
}

export function assertExternalDirectory(pathValue, label) {
  const target = resolve(pathValue);
  const relation = relative(WORKSPACE, target);
  if (
    !pathValue ||
    !target.startsWith(sep) ||
    (!relation.startsWith(`..${sep}`) && relation !== '..')
  ) {
    throw new Error(`${label} phải là thư mục tuyệt đối nằm ngoài workspace.`);
  }
  return target;
}

export function assertExternalFile(directory, pathValue, label) {
  const root = assertExternalDirectory(directory, 'CUTOVER_MANIFEST_DIR');
  const target = resolve(pathValue);
  const relation = relative(root, target);
  if (
    !pathValue ||
    !target.startsWith(sep) ||
    !relation ||
    relation === '..' ||
    relation.startsWith(`..${sep}`)
  ) {
    throw new Error(`${label} phải là tệp nằm trong CUTOVER_MANIFEST_DIR.`);
  }
  return target;
}

export async function ensureDirectory(pathValue) {
  await mkdir(pathValue, { recursive: true, mode: 0o700 });
}

export async function sha256File(pathValue) {
  return createHash('sha256')
    .update(await readFile(pathValue))
    .digest('hex');
}

function safeStoragePath(objectPath) {
  const segments = objectPath.split('/');
  if (
    !objectPath ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error('Object path Storage không an toàn.');
  }
  return segments;
}

async function listStorageDirectory(bucket, prefix = '') {
  const entries = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await bucket.list(prefix, {
      limit: 1000,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw new Error(`Không thể liệt kê Storage: ${error.message}`);
    entries.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }

  const files = [];
  for (const entry of entries) {
    const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id === null) {
      files.push(...(await listStorageDirectory(bucket, fullPath)));
    } else {
      files.push({ path: fullPath, metadata: entry.metadata ?? {} });
    }
  }
  return files;
}

export async function exportProductImages(admin, destination) {
  const bucket = admin.storage.from('product-images');
  const objects = await listStorageDirectory(bucket);
  const manifest = [];
  for (const object of objects.sort((left, right) =>
    left.path.localeCompare(right.path),
  )) {
    const { data, error } = await bucket.download(object.path);
    if (error || !data) {
      throw new Error(
        `Không thể tải ảnh ${object.path}: ${error?.message ?? 'không rõ lỗi'}`,
      );
    }
    const filePath = resolve(destination, ...safeStoragePath(object.path));
    const destinationRelation = relative(destination, filePath);
    if (
      destinationRelation.startsWith(`..${sep}`) ||
      destinationRelation === '..'
    ) {
      throw new Error('Đường dẫn lưu ảnh không an toàn.');
    }
    await ensureDirectory(resolve(filePath, '..'));
    const bytes = Buffer.from(await data.arrayBuffer());
    await writeFile(filePath, bytes, { mode: 0o600 });
    manifest.push({
      path: object.path,
      bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      contentType: data.type || null,
      metadata: object.metadata,
    });
  }
  await writeFile(
    resolve(destination, 'product-images-manifest.json'),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), objects: manifest }, null, 2)}\n`,
    { mode: 0o600 },
  );
  return manifest;
}

export async function applicationCounts(admin) {
  const tables = {
    profiles: 'id',
    categories: 'id',
    suppliers: 'id',
    customers: 'id',
    products: 'id',
    product_images: 'id',
    inventory_balances: 'product_id',
    stock_movements: 'id',
    sales: 'id',
    sale_returns: 'id',
    stock_counts: 'id',
    import_runs: 'id',
    legacy_sales: 'id',
  };
  const counts = {};
  for (const [table, primaryKey] of Object.entries(tables)) {
    const { count, error } = await admin.from(table).select(primaryKey, {
      count: 'exact',
      head: true,
    });
    if (error) throw new Error(`Không thể đếm ${table}: ${error.message}`);
    counts[table] = count ?? 0;
  }
  return counts;
}

export async function listSyntheticProfiles(admin) {
  const { data, error } = await admin
    .from('profiles')
    .select('id,email')
    .like('email', 'codex-phase%@example.invalid')
    .order('email');
  if (error)
    throw new Error(`Không thể kiểm tra profile test: ${error.message}`);
  return data ?? [];
}

export async function listSyntheticAuthUsers(admin) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw new Error('Không thể kiểm tra Auth user test.');
    users.push(
      ...data.users.filter((user) =>
        /^codex-phase[0-9a-z-]+@example\.invalid$/i.test(user.email ?? ''),
      ),
    );
    if (data.users.length < 1000) break;
  }
  return users;
}

export function assertExpectedFile(pathValue) {
  return stat(pathValue).then((value) => {
    if (!value.isFile()) throw new Error('Đường dẫn không phải file.');
    return value;
  });
}
