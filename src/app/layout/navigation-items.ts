export const navigationItems = [
  { to: '/', label: 'Tổng quan', end: true },
  {
    to: '/products',
    label: 'Hàng hóa',
    end: false,
    permission: 'catalog.read',
  },
  { to: '/pos', label: 'Bán hàng', end: false },
  { to: '/sales', label: 'Hóa đơn', end: false },
  { to: '/more', label: 'Nhiều hơn', end: false },
  { to: '/staff', label: 'Nhân viên', end: false, permission: 'staff.manage' },
] as const;
