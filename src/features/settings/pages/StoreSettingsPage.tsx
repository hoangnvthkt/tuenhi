import { usePrivateQueryKey } from '@/features/auth';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { refreshOperationalData } from '@/shared/api/refresh-operational-data';
import { useToast } from '@/shared/ui/feedback/use-toast';
import { createSettingsApi, settingsKeys } from '../api/settings-api';
import { getSupabaseClient } from '@/shared/supabase/client';
const imageExtensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
export function StoreSettingsPage() {
  const privateKey = usePrivateQueryKey();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [api] = useState(createSettingsApi);
  const query = useQuery({
    queryKey: privateKey(...settingsKeys.store),
    queryFn: () => api.getStoreSettings(),
  });
  const [saving, setSaving] = useState(false);
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<Awaited<
    ReturnType<typeof api.getStoreSettings>
  > | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  if (!dirty && query.data && baseline?.version !== query.data.version)
    setBaseline(query.data);
  const data = baseline ?? query.data;
  const uploadLogo = async (file: File) => {
    const extension = imageExtensions[file.type];
    if (!extension || file.size > 2 * 1024 * 1024) {
      toast.show({
        kind: 'error',
        title: 'Logo chưa hợp lệ',
        message: 'Chỉ nhận JPEG, PNG hoặc WebP, tối đa 2 MiB.',
      });
      return;
    }
    setSaving(true);
    try {
      const path = `store/${crypto.randomUUID()}.${extension}`;
      const { error } = await getSupabaseClient()
        .storage.from('store-branding')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      setLogoPath(path);
      setDirty(true);
      toast.show({
        kind: 'success',
        title: 'Đã tải logo',
        message: 'Bấm Lưu cấu hình để dùng logo này cho hóa đơn mới.',
      });
    } catch {
      toast.show({ kind: 'error', title: 'Không thể tải logo' });
    } finally {
      setSaving(false);
    }
  };
  const save = async (form: HTMLFormElement) => {
    if (!data || saving) return;
    const fd = new FormData(form);
    setSaving(true);
    try {
      await api.saveStoreSettings(
        data.version,
        {
          displayName: String(fd.get('displayName') ?? ''),
          logoPath: logoPath ?? data.logoPath,
          address: String(fd.get('address') ?? ''),
          contactPhone: String(fd.get('contactPhone') ?? ''),
          zalo: String(fd.get('zalo') ?? ''),
          invoiceFooter: String(fd.get('invoiceFooter') ?? ''),
        },
        crypto.randomUUID(),
      );
      toast.show({ kind: 'success', title: 'Đã lưu cấu hình cửa hàng' });
      setLogoPath(null);
      setDirty(false);
      await refreshOperationalData(queryClient);
    } catch (error) {
      toast.show({
        kind: 'error',
        title: 'Không thể lưu',
        message: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };
  if (query.isError && !data)
    return (
      <main className="p-6">
        <p role="alert" className="text-red-800">
          Không thể tải cấu hình cửa hàng.
        </p>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="mt-3 min-h-11 rounded-lg border px-4"
        >
          Thử lại
        </button>
      </main>
    );
  if (!data) return <main className="p-6">Đang tải cấu hình…</main>;
  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">Cấu hình cửa hàng</h1>
      <p className="mt-1 text-sm text-slate-600">
        Thông tin này được lưu trên hóa đơn khi thanh toán.
      </p>
      {query.isError ? (
        <div className="mt-3">
          <p role="alert">
            Không thể tải bản cập nhật. Nội dung đang nhập vẫn được giữ.
          </p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="min-h-11 px-3"
          >
            Thử lại
          </button>
        </div>
      ) : null}
      {dirty && query.data && query.data.version !== data.version ? (
        <div className="mt-3 rounded-lg bg-amber-50 p-3">
          <p>Cấu hình đã thay đổi trên máy chủ.</p>
          <button
            type="button"
            onClick={() => setConfirmReload(true)}
            className="min-h-11 px-3"
          >
            Tải cấu hình mới
          </button>
        </div>
      ) : null}
      {confirmReload ? (
        <div className="mt-3 rounded-lg border border-amber-300 p-3">
          <p>Bỏ nội dung chưa lưu để tải cấu hình mới?</p>
          <button
            type="button"
            onClick={() => {
              setDirty(false);
              setLogoPath(null);
              setBaseline(query.data ?? null);
              setConfirmReload(false);
            }}
            className="min-h-11 px-3 text-red-800"
          >
            Bỏ thay đổi và tải lại
          </button>
          <button
            type="button"
            onClick={() => setConfirmReload(false)}
            className="min-h-11 px-3"
          >
            Tiếp tục chỉnh sửa
          </button>
        </div>
      ) : null}
      <form
        key={data.version}
        onChange={() => setDirty(true)}
        onSubmit={(e) => {
          e.preventDefault();
          void save(e.currentTarget);
        }}
        className="mt-5 space-y-4 rounded-xl border border-slate-200 bg-white p-5"
      >
        <fieldset disabled={saving} className="space-y-4">
          <label className="block text-sm font-medium">
            Tên cửa hàng
            <input
              required
              name="displayName"
              defaultValue={data.displayName}
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3"
            />
          </label>
          <label className="block text-sm font-medium">
            Logo (tùy chọn)
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (file) void uploadLogo(file);
              }}
              className="mt-1 block text-sm"
            />
            {data.logoPath || logoPath ? (
              <span className="mt-1 block text-xs text-slate-600">
                Đã có logo cho hóa đơn mới.
              </span>
            ) : null}
          </label>
          <label className="block text-sm font-medium">
            Địa chỉ
            <textarea
              name="address"
              defaultValue={data.address ?? ''}
              className="mt-1 min-h-20 w-full rounded-lg border border-slate-300 p-3"
            />
          </label>
          <label className="block text-sm font-medium">
            Hotline
            <input
              name="contactPhone"
              defaultValue={data.contactPhone ?? ''}
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3"
            />
          </label>
          <label className="block text-sm font-medium">
            Zalo
            <input
              name="zalo"
              defaultValue={data.zalo ?? ''}
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3"
            />
          </label>
          <label className="block text-sm font-medium">
            Lời nhắn cuối hóa đơn
            <textarea
              name="invoiceFooter"
              defaultValue={data.invoiceFooter ?? ''}
              className="mt-1 min-h-20 w-full rounded-lg border border-slate-300 p-3"
            />
          </label>
          <button
            disabled={saving}
            className="min-h-11 rounded-lg bg-teal-700 px-4 font-semibold text-white disabled:opacity-50"
          >
            Lưu cấu hình
          </button>
        </fieldset>
      </form>
    </main>
  );
}
