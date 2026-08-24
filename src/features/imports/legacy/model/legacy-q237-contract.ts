export const LEGACY_Q237_ADAPTER_ID = 'LEGACY_Q237_V1' as const;

export const LEGACY_SALES_SHEET = 'Bán hàng hằng ngày';
export const LEGACY_PRODUCTS_SHEET = 'Danh mục sản phẩm';
export const LEGACY_CUSTOMERS_SHEET = 'KHACH HANG';

export const LEGACY_SALES_HEADERS = [
  'Ngày bán',
  'Mã đơn',
  'Nhân viên',
  'Kênh bán',
  'Khách hàng',
  'SĐT',
  'Mã SP',
  'Tên sản phẩm',
  'SL',
  'Đơn giá',
  'Chiết khấu',
  'Thành tiền',
  'Phương thức TT',
  'Trạng thái đơn',
  'Ghi chú',
  'Mã đơn liên kết HĐ',
  'STT SP trong đơn',
  'Khóa HĐ-SP',
] as const;

export const LEGACY_PRODUCT_HEADERS = [
  'Mã hàng',
  'Tên hàng',
  'Nhóm SP',
  'Quy cách',
  'Giá bán',
  'Giá vốn',
  'Tồn đầu kỳ',
  'Ghi chú',
] as const;

export const LEGACY_CUSTOMER_HEADERS = [
  'Loại khách',
  'Chi nhánh tạo',
  'Mã khách hàng',
  'Tên khách hàng',
  'Điện thoại',
  'Địa chỉ',
  'Khu vực giao hàng',
  'Phường/Xã',
  'Công ty',
  'Mã số thuế',
  'Số CMND/CCCD',
  'Ngày sinh',
  'Giới tính',
  'Email',
  'Facebook',
  'Nhóm khách hàng',
  'Ghi chú',
  'Điểm hiện tại',
  'Tổng điểm',
  'Người tạo',
  'Ngày tạo',
  'Ngày giao dịch cuối',
  'Số ngày nợ',
  'Nợ cần thu hiện tại',
  'Tổng bán',
  'Tổng bán trừ trả hàng',
  'Trạng thái',
] as const;

export const LEGACY_OPTIONAL_SHEETS = [
  'Tổng hợp',
  'Báo cáo theo ngày',
  'HÓA ĐƠN K80',
] as const;

export const LEGACY_ERROR_MESSAGES: Record<string, string> = {
  LEGACY_WORKBOOK_UNSUPPORTED:
    'Tệp không đúng định dạng dữ liệu bán hàng cũ được hỗ trợ.',
  LEGACY_SHEET_FINGERPRINT_MISMATCH:
    'Tên trang tính hoặc tiêu đề cột không đúng mẫu dữ liệu cũ.',
  LEGACY_FORMULA_NOT_ALLOWED:
    'Tệp có công thức ngoài các cột được hỗ trợ. Vui lòng kiểm tra lại.',
  LEGACY_INVOICE_NUMBER_REQUIRED:
    'Không xác định được mã đơn cho dòng sản phẩm này.',
  LEGACY_DUPLICATE_INVOICE_NUMBER:
    'Mã đơn xuất hiện ở nhiều nhóm không liền nhau. Vui lòng kiểm tra lại.',
  LEGACY_GROUP_CONFLICT:
    'Các dòng cùng mã đơn có thông tin đơn hàng không thống nhất.',
  LEGACY_MAPPING_REQUIRED:
    'Vui lòng ghép dữ liệu hoặc xác nhận chỉ giữ nhãn cũ trước khi tiếp tục.',
  LEGACY_PRODUCT_NOT_FOUND:
    'Không tìm thấy sản phẩm phù hợp trong danh mục hiện tại.',
  LEGACY_CACHED_VALUE_MISSING:
    'Không có giá trị đã lưu cho ô công thức; hệ thống không tự thay bằng 0.',
  LEGACY_CACHED_VALUE_UNVERIFIED:
    'Giá trị này lấy từ bộ nhớ công thức của tệp cũ và chỉ dùng để tra cứu.',
};

export type LegacyIssue = {
  rowNumber: number | null;
  code: string;
  message: string;
  blocking: boolean;
};

export type LegacyResolution =
  | { kind: 'TARGET'; targetId: string; confirmed: boolean }
  | { kind: 'SOURCE_LABEL_ONLY'; confirmed: boolean };
