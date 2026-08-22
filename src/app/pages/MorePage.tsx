import { Link } from 'react-router';
import { useSession } from '../../features/auth/use-session';

const destinations = [
  {
    to: '/more/suppliers',
    title: 'Nhà cung cấp',
    description: 'Thông tin liên hệ và trạng thái nhà cung cấp.',
    permissions: ['supplier.read', 'supplier.manage'],
  },
  {
    to: '/more/customers',
    title: 'Khách hàng',
    description: 'Khách cá nhân, doanh nghiệp và nhóm khách.',
    permissions: ['customer.read', 'customer.manage'],
  },
  {
    to: '/more/sales-channels',
    title: 'Kênh bán',
    description: 'Cấu hình kênh áp dụng cho hóa đơn.',
    permissions: ['settings.manage'],
  },
] as const;

export function MorePage() {
  const { session } = useSession();
  const visible = destinations.filter((destination) =>
    destination.permissions.some((permission) =>
      session?.permissions.includes(permission),
    ),
  );

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          Nhiều hơn
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Danh bạ và cấu hình phù hợp với quyền của bạn.
        </p>
      </div>
      {visible.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
          Bạn chưa có quyền sử dụng chức năng bổ sung nào.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visible.map((destination) => (
            <Link
              key={destination.to}
              to={destination.to}
              className="group min-h-28 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-teal-300 hover:bg-teal-50/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              <h2 className="font-bold text-slate-950 group-hover:text-teal-800">
                {destination.title}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                {destination.description}
              </p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
