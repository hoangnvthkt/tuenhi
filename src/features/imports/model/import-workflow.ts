export const IMPORT_STAGES = [
  'Chọn tệp',
  'Ghép cột',
  'Kiểm tra dữ liệu',
  'Xác nhận nhập',
] as const;

export type ImportStage = (typeof IMPORT_STAGES)[number];
