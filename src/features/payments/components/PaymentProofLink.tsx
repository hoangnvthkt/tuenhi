import { usePrivateQueryKey } from '@/features/auth';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { createPaymentProofApi } from '../api/payment-proof-api';

export function PaymentProofLink({
  objectPath,
}: {
  objectPath: string | null;
}) {
  const privateKey = usePrivateQueryKey();
  const [api] = useState(createPaymentProofApi);
  const query = useQuery({
    queryKey: privateKey(...['payment-proof-url', objectPath]),
    queryFn: () => api.createSignedUrl(objectPath!),
    enabled: Boolean(objectPath),
    staleTime: 8 * 60 * 1000,
  });

  if (!objectPath) {
    return (
      <p className="mt-2 text-sm text-slate-600">
        Chưa có chứng từ (giao dịch cũ).
      </p>
    );
  }
  if (query.isPending) {
    return <p className="mt-2 text-sm text-slate-600">Đang mở ảnh chứng từ…</p>;
  }
  if (query.isError || !query.data) {
    return (
      <p className="mt-2 text-sm text-red-800">Không thể mở ảnh chứng từ.</p>
    );
  }
  return (
    <a
      href={query.data}
      target="_blank"
      rel="noreferrer"
      className="mt-2 inline-flex min-h-11 items-center rounded-lg border border-teal-700 px-3 text-sm font-semibold text-teal-800"
    >
      Xem chứng từ chuyển khoản
    </a>
  );
}
