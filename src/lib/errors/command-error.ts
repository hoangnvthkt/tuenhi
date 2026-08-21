export const businessErrorMessages = {
  AUTH_REQUIRED: 'Vui lòng đăng nhập để tiếp tục.',
  ACCOUNT_INACTIVE: 'Tài khoản đã bị khóa.',
  PERMISSION_DENIED: 'Bạn không có quyền thực hiện thao tác này.',
  INVALID_STATE: 'Chứng từ đã thay đổi. Vui lòng tải lại dữ liệu.',
  PRICE_CHANGED:
    'Giá bán đã thay đổi. Vui lòng kiểm tra và xác nhận lại giỏ hàng.',
  INSUFFICIENT_STOCK: 'Tồn kho không đủ để hoàn tất hóa đơn.',
  RETURN_QTY_EXCEEDED: 'Số lượng trả vượt quá số lượng còn được phép trả.',
  RETURN_NOTHING_ACCEPTED: 'Cần chấp nhận ít nhất một sản phẩm trả lại.',
  ORIGINAL_INVOICE_REQUIRED: 'Vui lòng chọn hóa đơn gốc.',
  STALE_STOCK_COUNT: 'Tồn kho đã thay đổi. Vui lòng kiểm tra và đếm lại.',
  DUPLICATE_REQUEST: 'Yêu cầu đã được xử lý trước đó.',
  NETWORK_OUTCOME_UNKNOWN:
    'Chưa xác định được kết quả. Hệ thống sẽ kiểm tra lại giao dịch.',
  VALIDATION_ERROR: 'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại.',
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
  if (code in businessErrorMessages) {
    return businessErrorMessages[code as BusinessErrorCode];
  }

  return genericBusinessErrorMessage;
}
