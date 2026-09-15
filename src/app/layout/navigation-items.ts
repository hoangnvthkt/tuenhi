import {
  ChartPie,
  Package,
  ShoppingCart,
  Receipt,
  SquaresFour,
  Users,
} from '@phosphor-icons/react';

export const navigationItems = [
  { to: '/', label: 'Tổng quan', end: true, icon: ChartPie, tone: 'blue' },
  {
    to: '/products',
    label: 'Hàng hóa',
    end: false,
    permission: 'catalog.read',
    icon: Package,
    tone: 'orange',
  },
  {
    to: '/pos',
    label: 'Bán hàng',
    end: false,
    icon: ShoppingCart,
    tone: 'teal',
  },
  { to: '/sales', label: 'Hóa đơn', end: false, icon: Receipt, tone: 'violet' },
  {
    to: '/more',
    label: 'Nhiều hơn',
    end: false,
    icon: SquaresFour,
    tone: 'rose',
  },
  {
    to: '/staff',
    label: 'Nhân viên',
    end: false,
    permission: 'staff.manage',
    icon: Users,
    tone: 'blue',
  },
] as const;
