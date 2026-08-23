import { Link } from 'react-router';
import { useSession } from '../../features/auth/use-session';

const destinations = [
  {
    to: '/legacy-sales',
    title: 'Dữ liệu cũ',
    description: 'Tra cứu hóa đơn lưu trữ, tách khỏi vận hành chính thức.',
    permissions: ['legacy.sale.read'],
  },
  {
    to: '/imports',
    title: 'Nhập dữ liệu',
    description: 'Nhập danh mục từ mẫu Excel và xem lịch sử kết quả.',
    permissions: [
      'catalog.basic.manage',
      'supplier.manage',
      'customer.manage',
      'legacy.sale.import',
      'inventory.adjustment.post',
    ],
  },
  {
    to: '/more/purchases',
    title: 'Nhập hàng',
    description: 'Lập, gửi, nhập giá và ghi sổ phiếu nhập.',
    permissions: [
      'purchase.operational.read',
      'purchase.draft.manage',
      'purchase.cost.read',
    ],
  },
  {
    to: '/more/inventory/opening',
    title: 'Mở sổ tồn đầu kỳ',
    description: 'Tạo phiếu thủ công, Excel hoặc từ gợi ý dữ liệu cũ.',
    permissions: ['inventory.adjustment.post'],
  },
  {
    to: '/stock-counts',
    title: 'Kiểm kho',
    description: 'Đếm từng phần danh mục và chờ owner ghi sổ chênh lệch.',
    permissions: ['inventory.count.draft'],
  },
  {
    to: '/returns',
    title: 'Trả hàng',
    description: 'Tạo yêu cầu trả hàng và kiểm nhận theo quyền.',
    permissions: ['return.request.create', 'return.complete'],
  },
  {
    to: '/reports',
    title: 'Báo cáo',
    description: 'Doanh thu, kênh bán, thanh toán và lợi nhuận theo quyền.',
    permissions: ['report.own_revenue.read', 'report.all_revenue.read'],
  },
  {
    to: '/more/inventory/valuation',
    title: 'Định giá tồn kho',
    description: 'Tồn, giá vốn bình quân và tổng giá trị hiện tại.',
    permissions: ['report.cost_profit.read'],
  },
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
  {
    to: '/more/store-settings',
    title: 'Cấu hình cửa hàng',
    description: 'Thông tin hiển thị trên hóa đơn và bản in.',
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
