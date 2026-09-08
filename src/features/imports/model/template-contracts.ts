import type { ImportTarget } from './contracts';

export const IMPORT_TARGETS = [
  'CATEGORIES',
  'PRODUCTS',
  'SUPPLIERS',
  'CUSTOMERS',
  'OPENING_BALANCES',
  'PURCHASE_RECEIPT',
] as const satisfies readonly ImportTarget[];

export const CURRENT_TEMPLATE_VERSION = {
  CATEGORIES: 1,
  PRODUCTS: 1,
  SUPPLIERS: 1,
  CUSTOMERS: 2,
  OPENING_BALANCES: 1,
  PURCHASE_RECEIPT: 1,
} as const;

export type ImportFieldType =
  'text' | 'boolean' | 'quantity' | 'money' | 'phone' | 'email';

export type ImportColumnContract = {
  header: string;
  field: string;
  type: ImportFieldType;
  required: boolean;
  maxLength?: number;
  aliases?: readonly string[];
  example: string;
  textFormat?: boolean;
};

export type TemplateContract = {
  target: ImportTarget;
  version: number;
  fileName: string;
  displayName: string;
  columns: readonly ImportColumnContract[];
};

const booleanColumn = {
  header: 'Hoạt động',
  field: 'isActive',
  type: 'boolean',
  required: false,
  aliases: ['Kích hoạt', 'Trạng thái'],
  example: 'Có',
} as const;

const customerBaseColumns = [
  {
    header: 'Tên khách hàng',
    field: 'name',
    type: 'text',
    required: true,
    maxLength: 200,
    aliases: ['Tên KH'],
    example: 'Khách hàng mẫu',
  },
  {
    header: 'Mã khách hàng',
    field: 'code',
    type: 'text',
    required: false,
    maxLength: 64,
    aliases: ['Mã KH'],
    example: 'KH-MAU-001',
    textFormat: true,
  },
] as const;

const customerContactColumns = [
  {
    header: 'Số điện thoại',
    field: 'phone',
    type: 'phone',
    required: false,
    maxLength: 16,
    aliases: ['SĐT', 'Điện thoại'],
    example: 'SĐT 0912345678',
    textFormat: true,
  },
  {
    header: 'Email',
    field: 'email',
    type: 'email',
    required: false,
    maxLength: 254,
    aliases: ['Thư điện tử'],
    example: 'khachhang@example.invalid',
  },
  {
    header: 'Địa chỉ',
    field: 'address',
    type: 'text',
    required: false,
    maxLength: 500,
    example: 'Địa chỉ mẫu',
  },
] as const;

const customerTailColumns = [
  {
    header: 'Ghi chú',
    field: 'notes',
    type: 'text',
    required: false,
    maxLength: 1000,
    example: 'Ghi chú mẫu',
  },
  booleanColumn,
] as const;

const TEMPLATE_CONTRACTS: readonly TemplateContract[] = [
  {
    target: 'CATEGORIES',
    version: 1,
    fileName: 'categories-v1.xlsx',
    displayName: 'Nhóm hàng',
    columns: [
      {
        header: 'Tên nhóm hàng',
        field: 'name',
        type: 'text',
        required: true,
        maxLength: 120,
        aliases: ['Nhóm hàng', 'Tên danh mục'],
        example: 'Nhóm hàng mẫu',
      },
      booleanColumn,
    ],
  },
  {
    target: 'PRODUCTS',
    version: 1,
    fileName: 'products-v1.xlsx',
    displayName: 'Sản phẩm',
    columns: [
      {
        header: 'SKU',
        field: 'sku',
        type: 'text',
        required: true,
        maxLength: 64,
        aliases: ['Mã SP', 'Mã sản phẩm'],
        example: 'SP-MAU-001',
        textFormat: true,
      },
      {
        header: 'Tên sản phẩm',
        field: 'name',
        type: 'text',
        required: true,
        maxLength: 200,
        aliases: ['Tên SP'],
        example: 'Sản phẩm mẫu',
      },
      {
        header: 'Đơn vị tính',
        field: 'unitName',
        type: 'text',
        required: true,
        maxLength: 50,
        aliases: ['ĐVT'],
        example: 'Hộp',
      },
      {
        header: 'Mã vạch',
        field: 'barcode',
        type: 'text',
        required: false,
        maxLength: 64,
        aliases: ['Barcode'],
        example: 'Mã 0123456789012',
        textFormat: true,
      },
      {
        header: 'Nhóm hàng',
        field: 'categoryName',
        type: 'text',
        required: false,
        maxLength: 120,
        aliases: ['Tên nhóm hàng'],
        example: 'Nhóm hàng mẫu',
      },
      {
        header: 'Mô tả',
        field: 'description',
        type: 'text',
        required: false,
        maxLength: 2000,
        example: 'Mô tả mẫu',
      },
      {
        header: 'Ngưỡng tồn tối thiểu',
        field: 'minStockQty',
        type: 'quantity',
        required: false,
        example: '10',
      },
      {
        header: 'Giá bán hiện hành',
        field: 'salePrice',
        type: 'money',
        required: false,
        example: '25000',
      },
      booleanColumn,
    ],
  },
  {
    target: 'SUPPLIERS',
    version: 1,
    fileName: 'suppliers-v1.xlsx',
    displayName: 'Nhà cung cấp',
    columns: [
      {
        header: 'Tên nhà cung cấp',
        field: 'name',
        type: 'text',
        required: true,
        maxLength: 200,
        aliases: ['Tên NCC'],
        example: 'Nhà cung cấp mẫu',
      },
      {
        header: 'Mã nhà cung cấp',
        field: 'code',
        type: 'text',
        required: false,
        maxLength: 64,
        aliases: ['Mã NCC'],
        example: 'NCC-MAU-001',
        textFormat: true,
      },
      {
        header: 'Số điện thoại',
        field: 'phone',
        type: 'phone',
        required: false,
        maxLength: 16,
        aliases: ['SĐT', 'Điện thoại'],
        example: 'SĐT 0912345678',
        textFormat: true,
      },
      {
        header: 'Email',
        field: 'email',
        type: 'email',
        required: false,
        maxLength: 254,
        example: 'nhacungcap@example.invalid',
      },
      {
        header: 'Địa chỉ',
        field: 'address',
        type: 'text',
        required: false,
        maxLength: 500,
        example: 'Địa chỉ mẫu',
      },
      {
        header: 'Ghi chú',
        field: 'notes',
        type: 'text',
        required: false,
        maxLength: 1000,
        example: 'Ghi chú mẫu',
      },
      booleanColumn,
    ],
  },
  {
    target: 'CUSTOMERS',
    version: 1,
    fileName: 'customers-v1.xlsx',
    displayName: 'Khách hàng',
    columns: [
      ...customerBaseColumns,
      ...customerContactColumns,
      ...customerTailColumns,
    ],
  },
  {
    target: 'CUSTOMERS',
    version: 2,
    fileName: 'customers-v2.xlsx',
    displayName: 'Khách hàng',
    columns: [
      ...customerBaseColumns,
      {
        header: 'Loại khách hàng',
        field: 'customerType',
        type: 'text',
        required: false,
        maxLength: 20,
        aliases: ['Loại khách'],
        example: 'Cá nhân',
      },
      ...customerContactColumns,
      {
        header: 'Công ty',
        field: 'companyName',
        type: 'text',
        required: false,
        maxLength: 200,
        example: 'Công ty mẫu',
      },
      {
        header: 'Mã số thuế',
        field: 'taxCode',
        type: 'text',
        required: false,
        maxLength: 32,
        aliases: ['MST'],
        example: 'MST-MAU-001',
        textFormat: true,
      },
      {
        header: 'Nhóm khách hàng',
        field: 'customerGroup',
        type: 'text',
        required: false,
        maxLength: 120,
        aliases: ['Nhóm khách'],
        example: 'Khách thường',
      },
      ...customerTailColumns,
    ],
  },
  {
    target: 'OPENING_BALANCES',
    version: 1,
    fileName: 'opening-balances-v1.xlsx',
    displayName: 'Tồn đầu kỳ',
    columns: [
      {
        header: 'SKU',
        field: 'sku',
        type: 'text',
        required: true,
        maxLength: 64,
        aliases: ['Mã SP', 'Mã sản phẩm'],
        example: 'SP-MAU-001',
        textFormat: true,
      },
      {
        header: 'Số lượng tồn đầu kỳ',
        field: 'openingQuantity',
        type: 'quantity',
        required: true,
        aliases: ['Tồn đầu kỳ'],
        example: '10',
      },
      {
        header: 'Đơn giá vốn đầu kỳ',
        field: 'openingUnitCost',
        type: 'money',
        required: true,
        aliases: ['Giá vốn đầu kỳ'],
        example: '25000.50',
      },
    ],
  },
  {
    target: 'PURCHASE_RECEIPT',
    version: 1,
    fileName: 'purchase-receipt-v1.xlsx',
    displayName: 'Dòng phiếu nhập',
    columns: [
      {
        header: 'SKU',
        field: 'sku',
        type: 'text',
        required: true,
        maxLength: 64,
        aliases: ['Mã SP', 'Mã sản phẩm'],
        example: 'SP-MAU-001',
        textFormat: true,
      },
      {
        header: 'Số lượng nhận',
        field: 'receivedQty',
        type: 'quantity',
        required: true,
        example: '10',
      },
      {
        header: 'Đơn giá nhập',
        field: 'unitCost',
        type: 'money',
        required: true,
        example: '25000.50',
      },
    ],
  },
];

export const SENSITIVE_CUSTOMER_HEADER_ALIASES = [
  'CCCD',
  'CMND',
  'Số CMND/CCCD',
  'Ngày sinh',
  'Giới tính',
  'Facebook',
  'Điểm hiện tại',
  'Tổng điểm',
  'Số ngày nợ',
  'Nợ cần thu hiện tại',
  'Tổng bán',
  'Tổng bán trừ trả hàng',
] as const;

export function getTemplateContract(
  target: ImportTarget,
  version: number,
): TemplateContract {
  const contract = TEMPLATE_CONTRACTS.find(
    (candidate) => candidate.target === target && candidate.version === version,
  );

  if (!contract) {
    throw new Error('Phiên bản mẫu Excel không được hỗ trợ.');
  }

  return contract;
}

export function listTemplateContracts() {
  return TEMPLATE_CONTRACTS;
}
