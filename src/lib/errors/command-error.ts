export const businessErrorMessages = {
  AUTH_REQUIRED: 'Vui lòng đăng nhập để tiếp tục.',
  ACCOUNT_INACTIVE: 'Tài khoản đã bị khóa.',
  PERMISSION_DENIED: 'Bạn không có quyền thực hiện thao tác này.',
  INVALID_STATE: 'Chứng từ đã thay đổi. Vui lòng tải lại dữ liệu.',
  PRICE_CHANGED:
    'Giá bán đã thay đổi. Vui lòng kiểm tra và xác nhận lại giỏ hàng.',
  SALES_CHANNEL_INACTIVE: 'Kênh bán đã ngừng sử dụng. Vui lòng chọn kênh khác.',
  INSUFFICIENT_STOCK: 'Tồn kho không đủ để hoàn tất hóa đơn.',
  LINE_DISCOUNT_EXCEEDED: 'Giảm giá từng dòng không được vượt tiền hàng.',
  ORDER_DISCOUNT_EXCEEDED: 'Giảm giá toàn đơn vượt số tiền còn lại.',
  RETURN_QTY_EXCEEDED: 'Số lượng trả vượt quá số lượng còn được phép trả.',
  RETURN_NOTHING_ACCEPTED: 'Cần chấp nhận ít nhất một sản phẩm trả lại.',
  ORIGINAL_INVOICE_REQUIRED: 'Vui lòng chọn hóa đơn gốc.',
  STALE_STOCK_COUNT: 'Tồn kho đã thay đổi. Vui lòng kiểm tra và đếm lại.',
  DUPLICATE_REQUEST: 'Yêu cầu đã được xử lý trước đó.',
  NETWORK_OUTCOME_UNKNOWN:
    'Chưa xác định được kết quả. Hệ thống sẽ kiểm tra lại giao dịch.',
  VALIDATION_ERROR: 'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại.',
  VALIDATION_FAILED: 'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại.',
  NOTIFICATION_NOT_FOUND: 'Không tìm thấy thông báo.',
  AUTH_UPDATE_FAILED: 'Không thể cập nhật tài khoản. Vui lòng thử lại.',
  PASSWORD_CHANGE_INCOMPLETE:
    'Mật khẩu đã được cập nhật nhưng chưa thể hoàn tất hồ sơ. Vui lòng thử lại.',
  STAFF_NOT_FOUND: 'Không tìm thấy tài khoản nhân viên.',
  DUPLICATE_STAFF_EMAIL: 'Email này đã được dùng cho tài khoản khác.',
  LAST_ACTIVE_OWNER:
    'Hệ thống phải luôn còn ít nhất một chủ cửa hàng hoạt động.',
  OWNER_ONLY_PERMISSION: 'Quyền này chỉ dành cho chủ cửa hàng.',
  OWNER_PERMISSION_OVERRIDE_NOT_ALLOWED:
    'Tài khoản chủ cửa hàng không sử dụng quyền tùy chỉnh.',
  DUPLICATE_IN_DATABASE: 'Dữ liệu đã tồn tại trong hệ thống.',
  VERSION_CONFLICT:
    'Dữ liệu đã được người khác cập nhật. Vui lòng tải lại dữ liệu.',
  REFERENCE_NOT_FOUND: 'Không tìm thấy dữ liệu liên quan.',
  CATEGORY_IN_USE: 'Không thể tắt nhóm hàng đang có sản phẩm hoạt động.',
  IMMUTABLE_FIELD: 'Thông tin này không thể thay đổi sau khi tạo.',
} as const;

export type BusinessErrorCode = keyof typeof businessErrorMessages;

export interface CommandError {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

export type CommandEnvelope<T> =
  | {
      ok: true;
      data: T;
      error: null;
      correlationId: string;
    }
  | {
      ok: false;
      data: null;
      error: CommandError;
      correlationId: string;
    };

const genericBusinessErrorMessage =
  'Không thể hoàn tất thao tác. Vui lòng thử lại.';

export function getBusinessErrorMessage(code: string): string {
  if (Object.hasOwn(businessErrorMessages, code)) {
    return businessErrorMessages[code as BusinessErrorCode];
  }

  return genericBusinessErrorMessage;
}
